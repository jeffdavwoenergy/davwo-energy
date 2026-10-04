// Multi-tenant registry. Each org is an isolated tenant with its own seeded
// synthetic network (so orgs see different assets/data). National grid data
// (carbon, pricing, weather) is shared.
//
// Two tiers: a fixed set of demo/showcase tenants (below) plus dynamically
// signed-up orgs (src/lib/server/orgs.ts, Mongo-backed with graceful
// in-memory fallback). Seeds are never looked up for the dynamic tier — they
// are a pure hash of the org id, so every org gets a distinct synthetic
// network the instant it's created, with zero DB round-trip on the hot path
// (currentSeed()/withTenant stay fully synchronous).

import { findOrg } from "@/lib/server/orgs";
import type { Market } from "@/lib/types";

export type Plan = "enterprise" | "growth" | "pilot";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  seed: number;
  plan: Plan;
  region: string;
  market: Market;
}

/** Davwo Energy's own seeded tenant — the platform operator, not a customer
 * org. Used to distinguish platform-level admin actions (marketplace
 * moderation) from ordinary org-scoped admin actions (that org's own team/
 * settings), since "admin" role is otherwise per-org and every self-signed-up
 * customer is the sole admin of their own tenant. */
export const PLATFORM_ORG_ID = "davwo";

export const TENANTS: Tenant[] = [
  { id: PLATFORM_ORG_ID, name: "Davwo Energy", slug: "davwo", seed: 42, plan: "enterprise", region: "London", market: "uk" },
  { id: "pilot-mcr", name: "Northbridge Mobility", slug: "northbridge", seed: 7, plan: "pilot", region: "Manchester", market: "uk" },
  { id: "growth-leeds", name: "Aire Valley Charge Co", slug: "aire-valley", seed: 99, plan: "growth", region: "Leeds", market: "uk" },
  { id: "acme", name: "Acme Corp", slug: "acme", seed: 23, plan: "enterprise", region: "Birmingham", market: "uk" },
];

const DEFAULT_TENANT = TENANTS[0];

/** Deterministic seed for any org id outside the static demo list — same id
 * always yields the same seed, so a new org's dashboard is stable across
 * requests/instances without persisting anything. */
export function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 900) + 100; // keep well clear of the static demo seeds (7/42/99)
}

/** Static-list lookup only — used where a synchronous, demo-only view is
 * correct (e.g. the pre-signup default). Prefer resolveTenant() for any org
 * that might be dynamically created. */
export function getTenant(id: string | undefined | null): Tenant {
  return TENANTS.find((t) => t.id === id) ?? DEFAULT_TENANT;
}

/** Full async resolution: static demo tenants, then dynamically signed-up
 * orgs, then a hash-seeded fallback — so an unrecognised id never silently
 * becomes "davwo" (the bug this replaces). */
export async function resolveTenant(id: string | undefined | null): Promise<Tenant> {
  if (!id) return DEFAULT_TENANT;
  const stat = TENANTS.find((t) => t.id === id);
  if (stat) return stat;
  const dyn = await findOrg(id);
  if (dyn) return { id: dyn.id, name: dyn.name, slug: dyn.slug, seed: hashSeed(dyn.id), plan: "pilot", region: dyn.region ?? "", market: dyn.market };
  return { id, name: id, slug: id, seed: hashSeed(id), plan: "pilot", region: "", market: "uk" };
}

export function tenantSeed(id: string | undefined | null): number {
  if (!id) return DEFAULT_TENANT.seed;
  const stat = TENANTS.find((t) => t.id === id);
  return stat ? stat.seed : hashSeed(id);
}

/** Orgs a user may access: admins of a static demo tenant see all demo
 * tenants (existing showcase behaviour, unchanged); everyone else — including
 * every dynamically signed-up org's admin — sees only their own org. */
export async function tenantsForUser(role: string, orgId: string): Promise<Tenant[]> {
  if (role === "admin" && TENANTS.some((t) => t.id === orgId)) return TENANTS;
  return [await resolveTenant(orgId)];
}
