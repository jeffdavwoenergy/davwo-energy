import { verifyToken, verifySupplierToken, type TokenClaims, type SupplierTokenClaims } from "@/lib/server/jwt";
import { PLATFORM_ORG_ID } from "@/lib/server/tenants";

/** Extract + verify the bearer token from a request. Returns null if absent/invalid. */
export async function getAuth(req: Request): Promise<TokenClaims | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

/** "admin" is a per-org role — any customer who self-signs-up gets an org
 * with themselves as its sole admin, per resolveTenant's dynamic
 * provisioning. That's the right check for org-scoped actions (team
 * management, that org's own settings), but marketplace moderation
 * (verify/unverify a supplier, remove any vendor's listing) is a
 * platform-level action: without this, any newly-signed-up customer's
 * "admin" role would let them moderate every other tenant's marketplace
 * presence, not just their own org's data. Restricts it to admins of
 * PLATFORM_ORG_ID (Davwo Energy's own seeded tenant, the platform operator). */
export function isPlatformAdmin(claims: TokenClaims): boolean {
  return claims.role === "admin" && claims.org === PLATFORM_ORG_ID;
}

/** Same shape as getAuth, but for the separate supplier-portal session —
 * verifySupplierToken rejects anything that isn't a genuine supplier token. */
export async function getSupplierAuth(req: Request): Promise<SupplierTokenClaims | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return await verifySupplierToken(token);
  } catch {
    return null;
  }
}
