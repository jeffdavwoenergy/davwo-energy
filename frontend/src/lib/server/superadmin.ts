import { createHash, timingSafeEqual } from "node:crypto";
import { TENANTS, type Plan } from "@/lib/server/tenants";
import { listOrgs } from "@/lib/server/orgs";
import { listAllUsers, type PlatformUser } from "@/lib/server/users";
import { listSuppliers, type Supplier } from "@/lib/server/suppliers";
import { listProducts } from "@/lib/server/products";
import { listAllLeads, resolveVendor, type Lead } from "@/lib/server/marketplace";
import { linkedUserFor } from "@/lib/server/accountLinks";
import type { Market } from "@/lib/types";

/**
 * The super admin console — Davwo's own platform-operator view across every
 * customer org, user, supplier and marketplace listing. Deliberately not a
 * User row: the credential lives in env (SUPERADMIN_EMAIL /
 * SUPERADMIN_PASSWORD), so no org admin, demo login or database write can
 * ever create or escalate to it. Without those env vars, a fixed local
 * credential works in development only — production stays locked.
 */
const DEV_EMAIL = "superadmin@davwo.com";
const DEV_PASSWORD = "SuperAdmin@123";

export const SUPERADMIN_ID = "superadmin";

function credentials(): { email: string; password: string } | null {
  const email = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  if (email && password) return { email, password };
  if (process.env.NODE_ENV !== "production") return { email: DEV_EMAIL, password: DEV_PASSWORD };
  return null;
}

export function isSuperAdminConfigured(): boolean {
  return credentials() !== null;
}

/** Constant-time compare (hashing first equalises the lengths). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkSuperAdmin(email: string, password: string): boolean {
  const creds = credentials();
  if (!creds) return false;
  // Evaluate both so a wrong email takes as long as a wrong password.
  const emailOk = safeEqual(email.trim().toLowerCase(), creds.email);
  const passwordOk = safeEqual(password, creds.password);
  return emailOk && passwordOk;
}

export function superAdminEmail(): string | undefined {
  return credentials()?.email;
}

/* ── Platform overview ─────────────────────────────────────────────────── */

export interface OverviewOrg {
  id: string;
  name: string;
  region?: string;
  market: Market;
  plan: Plan | "customer";
  /** Seeded showcase tenant vs a real signed-up customer org. */
  demo: boolean;
  createdAt?: string;
  userCount: number;
  adminCount: number;
  enquiryCount: number;
}

export interface OverviewUser extends PlatformUser {
  orgName: string;
  linkedSupplierId?: string;
}

export interface OverviewSupplier extends Supplier {
  productCount: number;
  enquiryCount: number;
  linkedUserId?: string;
  linkedUserEmail?: string;
}

export interface OverviewProduct {
  id: string;
  name: string;
  category: string;
  summary: string;
  vendorId: string;
  vendorName: string;
  /** Supplier account behind the listing, when it's a self-service one. */
  supplierId?: string;
  brand?: string;
  monthlyPrice?: number;
  outrightPrice?: number;
  imageUrl?: string;
  createdAt: string;
}

export interface OverviewLead extends Lead {
  vendorName: string;
  orgName: string;
}

export interface PlatformOverview {
  generatedAt: string;
  stats: {
    organisations: number;
    customerOrgs: number;
    users: number;
    admins: number;
    suppliers: number;
    verifiedSuppliers: number;
    listings: number;
    enquiries: number;
    openEnquiries: number;
    newThisWeek: number;
  };
  organisations: OverviewOrg[];
  users: OverviewUser[];
  suppliers: OverviewSupplier[];
  products: OverviewProduct[];
  leads: OverviewLead[];
}

function countBy<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}

export async function buildOverview(): Promise<PlatformOverview> {
  const [orgRecords, users, suppliers, products, leads] = await Promise.all([
    listOrgs(), listAllUsers(), listSuppliers(), listProducts(), listAllLeads(),
  ]);

  const usersByOrg = countBy(users, (u) => u.orgId);
  const adminsByOrg = countBy(users.filter((u) => u.role === "admin"), (u) => u.orgId);
  const leadsByOrg = countBy(leads, (l) => l.orgId);
  const leadsByVendor = countBy(leads, (l) => l.vendorId);
  const productsByVendor = countBy(products, (p) => p.vendorId);

  const orgs = new Map<string, OverviewOrg>();
  const addOrg = (o: Omit<OverviewOrg, "userCount" | "adminCount" | "enquiryCount">) =>
    orgs.set(o.id, { ...o, userCount: usersByOrg.get(o.id) ?? 0, adminCount: adminsByOrg.get(o.id) ?? 0, enquiryCount: leadsByOrg.get(o.id) ?? 0 });
  for (const t of TENANTS) addOrg({ id: t.id, name: t.name, region: t.region, market: t.market, plan: t.plan, demo: true });
  for (const o of orgRecords) addOrg({ id: o.id, name: o.name, region: o.region, market: o.market, plan: "customer", demo: false, createdAt: o.createdAt });
  // Users whose org record is gone (or lived in another instance's memory)
  // still show up, under their raw org id, rather than silently vanishing.
  for (const u of users) {
    if (!orgs.has(u.orgId)) addOrg({ id: u.orgId, name: u.company || u.orgId, market: "uk", plan: "customer", demo: false });
  }
  const orgName = (id: string) => orgs.get(id)?.name ?? id;

  const vendorIds = [...new Set([...products.map((p) => p.vendorId), ...leads.map((l) => l.vendorId)])];
  const vendorNames = new Map(await Promise.all(vendorIds.map(async (id) => [id, (await resolveVendor(id))?.name ?? id] as const)));
  const supplierIds = new Set(suppliers.map((s) => s.id));

  const links = await Promise.all(suppliers.map(async (s) => [s.id, await linkedUserFor(s.id)] as const));
  const userBySupplier = new Map(links.filter((l): l is readonly [string, string] => Boolean(l[1])));
  const supplierByUser = new Map([...userBySupplier].map(([s, u]) => [u, s]));
  const userEmail = new Map(users.map((u) => [u.id, u.email]));

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const recent = (iso?: string) => Boolean(iso && iso >= weekAgo);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      organisations: orgs.size,
      customerOrgs: [...orgs.values()].filter((o) => !o.demo).length,
      users: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      suppliers: suppliers.length,
      verifiedSuppliers: suppliers.filter((s) => s.verified).length,
      listings: products.length,
      enquiries: leads.length,
      openEnquiries: leads.filter((l) => l.status === "new" || l.status === "responded").length,
      newThisWeek: users.filter((u) => recent(u.createdAt)).length + suppliers.filter((s) => recent(s.createdAt)).length,
    },
    organisations: [...orgs.values()].sort((a, b) => Number(a.demo) - Number(b.demo) || b.userCount - a.userCount),
    users: users.map((u) => ({ ...u, orgName: orgName(u.orgId), linkedSupplierId: supplierByUser.get(u.id) })),
    suppliers: suppliers.map((s) => {
      const linkedUserId = userBySupplier.get(s.id);
      return {
        ...s,
        productCount: productsByVendor.get(s.id) ?? 0,
        enquiryCount: leadsByVendor.get(s.id) ?? 0,
        linkedUserId,
        linkedUserEmail: linkedUserId ? userEmail.get(linkedUserId) : undefined,
      };
    }),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      summary: p.summary,
      vendorId: p.vendorId,
      vendorName: vendorNames.get(p.vendorId) ?? p.vendorId,
      supplierId: supplierIds.has(p.vendorId) ? p.vendorId : undefined,
      brand: p.listing?.brand,
      monthlyPrice: p.listing?.monthlyPrice,
      outrightPrice: p.listing?.outrightPrice,
      imageUrl: p.imageIds?.length ? `/api/marketplace/products/${p.id}/images/${p.imageIds[0]}` : p.listing?.gallery?.[0],
      createdAt: p.createdAt,
    })),
    leads: leads.map((l) => ({ ...l, vendorName: vendorNames.get(l.vendorId) ?? l.vendorId, orgName: orgName(l.orgId) })),
  };
}
