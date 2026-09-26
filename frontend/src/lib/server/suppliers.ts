import { randomUUID } from "node:crypto";
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
  const normalized = email.toLowerCase().trim();
  if (!isDbConfigured()) return [...memorySuppliers.values()].find((s) => s.email === normalized);
  const prisma = getPrisma()!;
  const doc = await prisma.supplier.findUnique({ where: { email: normalized } });
  return doc ? fromRow(doc) : undefined;
}

export async function findSupplierById(id: string): Promise<Supplier | undefined> {
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
  if (!isDbConfigured()) {
    return [...memorySuppliers.values()].map(publicSupplier).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const prisma = getPrisma()!;
  const docs = await prisma.supplier.findMany({ orderBy: { createdAt: "desc" } });
  return docs.map((d) => publicSupplier(fromRow(d)));
}

export async function setSupplierVerified(id: string, verified: boolean): Promise<Supplier | undefined> {
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
