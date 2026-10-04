import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/password";

/**
 * Real, self-service supplier accounts — the "separate portal" side of the
 * marketplace, deliberately distinct from User (customer org accounts): no
 * orgId, no admin/operator/pilot role, its own JWT (see jwt.ts's
 * SupplierTokenClaims). Same Postgres-with-in-memory-fallback pattern as
 * every other store in this codebase.
 */
export interface Supplier {
  id: string;
  email: string;
  companyName: string;
  category: string;
  region?: string;
  website?: string;
  verified: boolean;
  createdAt: string;
}

interface SupplierRecord extends Supplier {
  passwordHash: string;
}

const memorySuppliers = new Map<string, SupplierRecord>(); // key: id

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "Demo@123";

/** Built-in supplier accounts for the demo admins — same emails and demo
 * password as their ANI™ accounts in users.ts (DEMO_USERS), so each has
 * Full membership (both platforms) out of the box. */
export const DEMO_SUPPLIERS = [
  {
    id: "s-davwo",
    email: "admin@davwo.com",
    companyName: "Davwo Energy Ltd",
    category: "energy-services",
    region: "United Kingdom",
    website: "https://davwo.com",
    verified: true,
  },
  {
    id: "s-acme",
    email: "admin@acmecorp.com",
    companyName: "Acme Corp",
    category: "ev-chargers",
    region: "Birmingham",
    website: "https://acmecorp.example",
    verified: true,
  },
];
/** The Davwo platform admin's supplier account. */
export const DEMO_SUPPLIER = DEMO_SUPPLIERS[0];

let seeding: Promise<void> | null = null;

/** Lazy, idempotent seed of DEMO_SUPPLIERS (bcrypt-hashed on first use), into
 * Postgres on a demo deployment or the in-memory map otherwise — same pattern as
 * users.ts's ensureSeeded, but keyed on each email so they also land in a
 * suppliers table that already has other rows. */
function ensureSeeded(): Promise<void> {
  seeding ??= (async () => {
    // Known-password demo accounts only exist without a database (local/demo
    // mode) or on a deployment flagged as a demo (ALLOW_DEMO_LOGIN) — never
    // injected into a real suppliers table.
    if (isDbConfigured() && (process.env.ALLOW_DEMO_LOGIN ?? "").trim().toLowerCase() !== "true") return;
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    for (const demo of DEMO_SUPPLIERS) {
      if (!isDbConfigured()) {
        if (![...memorySuppliers.values()].some((s) => s.email === demo.email)) {
          memorySuppliers.set(demo.id, { ...demo, passwordHash, createdAt: new Date().toISOString() });
        }
        continue;
      }
      const prisma = getPrisma()!;
      if (await prisma.supplier.findUnique({ where: { email: demo.email } })) continue;
      try {
        await prisma.supplier.create({ data: { ...demo, passwordHash } });
      } catch (err) {
        // Another instance seeded it first — fine.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
  })().catch((err) => {
    seeding = null;
    throw err;
  });
  return seeding;
}

export class SupplierEmailInUseError extends Error {
  constructor() {
    super("A supplier account with this email already exists");
    this.name = "SupplierEmailInUseError";
  }
}

export class WrongSupplierPasswordError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "WrongSupplierPasswordError";
  }
}

function fromRow(row: {
  id: string; email: string; passwordHash: string; companyName: string;
  category: string; region: string | null; website: string | null; verified: boolean; createdAt: Date;
}): SupplierRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    companyName: row.companyName,
    category: row.category,
    region: row.region ?? undefined,
    website: row.website ?? undefined,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
  };
}

function publicSupplier(s: SupplierRecord): Supplier {
  const { passwordHash: _ph, ...rest } = s;
  void _ph;
  return rest;
}

async function findRecordByEmail(email: string): Promise<SupplierRecord | undefined> {
  await ensureSeeded();
  const normalized = email.toLowerCase().trim();
  if (!isDbConfigured()) return [...memorySuppliers.values()].find((s) => s.email === normalized);
  const prisma = getPrisma()!;
  const doc = await prisma.supplier.findUnique({ where: { email: normalized } });
  return doc ? fromRow(doc) : undefined;
}

/** Public supplier account for a login email, if one exists — used to work
 * out whether an ANI™ user also has a supplier membership. */
export async function findSupplierByEmail(email: string): Promise<Supplier | undefined> {
  const record = await findRecordByEmail(email);
  return record ? publicSupplier(record) : undefined;
}

export async function findSupplierById(id: string): Promise<Supplier | undefined> {
  await ensureSeeded();
  if (!isDbConfigured()) {
    const found = memorySuppliers.get(id);
    return found ? publicSupplier(found) : undefined;
  }
  const prisma = getPrisma()!;
  const doc = await prisma.supplier.findUnique({ where: { id } });
  return doc ? publicSupplier(fromRow(doc)) : undefined;
}

export interface NewSupplierInput {
  email: string;
  password: string;
  companyName: string;
  category: string;
  region?: string;
  website?: string;
}

export async function registerSupplier(input: NewSupplierInput): Promise<Supplier> {
  const normalized = input.email.toLowerCase().trim();
  if (await findRecordByEmail(normalized)) throw new SupplierEmailInUseError();

  const record: SupplierRecord = {
    id: randomUUID(),
    email: normalized,
    passwordHash: await hashPassword(input.password),
    companyName: input.companyName,
    category: input.category,
    region: input.region,
    website: input.website,
    verified: false,
    createdAt: new Date().toISOString(),
  };

  if (!isDbConfigured()) {
    memorySuppliers.set(record.id, record);
    return publicSupplier(record);
  }
  const prisma = getPrisma()!;
  await prisma.supplier.create({
    data: {
      id: record.id, email: record.email, passwordHash: record.passwordHash,
      companyName: record.companyName, category: record.category,
      region: record.region, website: record.website, verified: record.verified,
    },
  });
  return publicSupplier(record);
}

export async function authenticateSupplier(email: string, password: string): Promise<Supplier> {
  const record = await findRecordByEmail(email);
  if (!record || !(await verifyPassword(password, record.passwordHash))) throw new WrongSupplierPasswordError();
  return publicSupplier(record);
}

/** Marketplace administration — the platform team's view of every registered
 * supplier, and the ability to verify one (or revoke that badge). */
export async function listSuppliers(): Promise<Supplier[]> {
  await ensureSeeded();
  if (!isDbConfigured()) {
    return [...memorySuppliers.values()].map(publicSupplier).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const prisma = getPrisma()!;
  const docs = await prisma.supplier.findMany({ orderBy: { createdAt: "desc" } });
  return docs.map((d) => publicSupplier(fromRow(d)));
}

export async function setSupplierVerified(id: string, verified: boolean): Promise<Supplier | undefined> {
  await ensureSeeded();
  if (!isDbConfigured()) {
    const found = memorySuppliers.get(id);
    if (!found) return undefined;
    found.verified = verified;
    return publicSupplier(found);
  }
  const prisma = getPrisma()!;
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) return undefined;
  const doc = await prisma.supplier.update({ where: { id }, data: { verified } });
  return publicSupplier(fromRow(doc));
}

export interface SupplierProfileUpdate {
  companyName?: string;
  category?: string;
  region?: string;
  website?: string;
}

/** A supplier editing their own company profile from the portal's Settings
 * page. Email and the verified badge are deliberately not editable here
 * (identity and platform-granted trust respectively). Empty region/website
 * clears them. */
export async function updateSupplierProfile(id: string, patch: SupplierProfileUpdate): Promise<Supplier | undefined> {
  await ensureSeeded();
  const data = {
    ...(patch.companyName !== undefined ? { companyName: patch.companyName } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.region !== undefined ? { region: patch.region || undefined } : {}),
    ...(patch.website !== undefined ? { website: patch.website || undefined } : {}),
  };
  if (!isDbConfigured()) {
    const found = memorySuppliers.get(id);
    if (!found) return undefined;
    Object.assign(found, data);
    return publicSupplier(found);
  }
  const prisma = getPrisma()!;
  if (!(await prisma.supplier.findUnique({ where: { id } }))) return undefined;
  const doc = await prisma.supplier.update({
    where: { id },
    data: {
      ...data,
      ...(patch.region !== undefined ? { region: patch.region || null } : {}),
      ...(patch.website !== undefined ? { website: patch.website || null } : {}),
    },
  });
  return publicSupplier(fromRow(doc));
}

/** Changes a supplier's password after re-checking the current one. Throws
 * WrongSupplierPasswordError if it doesn't match (or the account is gone). */
export class DemoSupplierPasswordError extends Error {
  constructor() {
    super("Password changes aren't available on the shared demo account without a database — it would lock out every other visitor.");
    this.name = "DemoSupplierPasswordError";
  }
}

export async function changeSupplierPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
  if (DEMO_SUPPLIERS.some((d) => d.id === id) && !isDbConfigured()) throw new DemoSupplierPasswordError();
  const supplier = await findSupplierById(id);
  const record = supplier ? await findRecordByEmail(supplier.email) : undefined;
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) throw new WrongSupplierPasswordError();
  const passwordHash = await hashPassword(newPassword);
  if (!isDbConfigured()) {
    record.passwordHash = passwordHash;
    return;
  }
  const prisma = getPrisma()!;
  await prisma.supplier.update({ where: { id }, data: { passwordHash } });
}
