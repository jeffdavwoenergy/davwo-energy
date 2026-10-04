import { getPrisma, isDbConfigured } from "@/lib/server/prisma";

/**
 * Links between an ANI™ user and a supplier account belonging to the same
 * person, so a Full member can switch platforms without signing in again.
 * A link is only ever created from proof of both sessions (see
 * /api/membership/link) — never from matching emails, since supplier
 * sign-up doesn't verify email ownership. One supplier per user and vice
 * versa. Postgres-with-in-memory-fallback, like every other store.
 */
export interface AccountLink {
  userId: string;
  supplierId: string;
}

/** The seeded demo admins (users.ts DEMO_USERS ↔ suppliers.ts DEMO_SUPPLIERS)
 * come pre-linked so their platform switch works from the first sign-in. */
export const DEMO_LINKS: AccountLink[] = [
  { userId: "u-admin", supplierId: "s-davwo" },
  { userId: "u-acme-admin", supplierId: "s-acme" },
];

const memoryLinks = new Map<string, string>(); // userId -> supplierId

export async function linkAccounts(userId: string, supplierId: string): Promise<void> {
  if (!isDbConfigured()) {
    // Re-linking either side replaces its old link.
    for (const [u, s] of memoryLinks) if (u === userId || s === supplierId) memoryLinks.delete(u);
    memoryLinks.set(userId, supplierId);
    return;
  }
  const prisma = getPrisma()!;
  await prisma.$transaction([
    prisma.accountLink.deleteMany({ where: { OR: [{ userId }, { supplierId }] } }),
    prisma.accountLink.create({ data: { userId, supplierId } }),
  ]);
}

export async function linkedSupplierFor(userId: string): Promise<string | undefined> {
  const demo = DEMO_LINKS.find((l) => l.userId === userId);
  if (demo) return demo.supplierId;
  if (!isDbConfigured()) return memoryLinks.get(userId);
  const row = await getPrisma()!.accountLink.findUnique({ where: { userId } });
  return row?.supplierId;
}

export async function linkedUserFor(supplierId: string): Promise<string | undefined> {
  const demo = DEMO_LINKS.find((l) => l.supplierId === supplierId);
  if (demo) return demo.userId;
  if (!isDbConfigured()) return [...memoryLinks].find(([, s]) => s === supplierId)?.[0];
  const row = await getPrisma()!.accountLink.findUnique({ where: { supplierId } });
  return row?.userId;
}
