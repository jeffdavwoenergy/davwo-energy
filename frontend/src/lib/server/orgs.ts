import { randomUUID } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import { MARKETS, type Market } from "@/lib/types";

export type { Market };

/**
 * Dynamic tenant provisioning for self-service signup. The static TENANTS
 * list (tenants.ts) stays as the fixed demo/showcase set; every org created
 * through /api/auth/signup lives here instead. Same graceful-fallback shape
 * as assetsStore/alertState/users: Postgres when configured, per-instance
 * in-memory otherwise (documented limitation, not a silent gap).
 */
export const isMarket = (v: unknown): v is Market => MARKETS.includes(v as Market);

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  region?: string;
  market: Market;
  createdAt: string;
}

const memoryOrgs = new Map<string, OrgRecord>();

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "org";

export async function createOrg(name: string, region?: string, market?: Market): Promise<OrgRecord> {
  const org: OrgRecord = {
    id: `org-${randomUUID()}`,
    name,
    slug: `${slugify(name)}-${randomUUID().slice(0, 6)}`,
    region,
    market: market && isMarket(market) ? market : "uk",
    createdAt: new Date().toISOString(),
  };
  if (!isDbConfigured()) {
    memoryOrgs.set(org.id, org);
    return org;
  }
  const prisma = getPrisma()!;
  await prisma.org.create({ data: { ...org, region: org.region ?? null } });
  return org;
}

export async function findOrg(id: string): Promise<OrgRecord | undefined> {
  if (!isDbConfigured()) return memoryOrgs.get(id);
  const prisma = getPrisma()!;
  const doc = await prisma.org.findUnique({ where: { id } });
  if (!doc) return undefined;
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    region: doc.region ?? undefined,
    market: isMarket(doc.market) ? doc.market : "uk",
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface OrgUpdate {
  name?: string;
  region?: string;
  market?: Market;
}

/** Updates a dynamically signed-up org's own details. Static demo tenants
 * (davwo/pilot-mcr/growth-leeds — see tenants.ts) never reach the org store
 * at all, so they naturally can't be found here; callers should check for
 * that case explicitly (via the static TENANTS list) to give a clear error
 * rather than a confusing "not found". */
export async function updateOrg(id: string, updates: OrgUpdate): Promise<OrgRecord | undefined> {
  if (!isDbConfigured()) {
    const existing = memoryOrgs.get(id);
    if (!existing) return undefined;
    const next = { ...existing, ...updates };
    memoryOrgs.set(id, next);
    return next;
  }
  const prisma = getPrisma()!;
  const existing = await prisma.org.findUnique({ where: { id } });
  if (!existing) return undefined;
  const doc = await prisma.org.update({ where: { id }, data: updates });
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    region: doc.region ?? undefined,
    market: isMarket(doc.market) ? doc.market : "uk",
    createdAt: doc.createdAt.toISOString(),
  };
}
