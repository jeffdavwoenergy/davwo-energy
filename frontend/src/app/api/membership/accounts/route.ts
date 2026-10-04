import { NextResponse } from "next/server";
import { getAuth, getSupplierAuth } from "@/lib/server/auth";
import { findById, publicUser, listOrgUsers } from "@/lib/server/users";
import { findSupplierById } from "@/lib/server/suppliers";
import { resolveTenant } from "@/lib/server/tenants";
import { linkedSupplierFor, linkedUserFor } from "@/lib/server/accountLinks";

export const dynamic = "force-dynamic";

/**
 * Both sides of a Full member's account for the combined Settings page —
 * the ANI™ profile/organisation/preferences/team and the supplier company
 * profile. Works with either platform's token; the OTHER platform's side is
 * only included when the two accounts are linked (proven to be the same
 * person), never just because the emails match.
 */
export async function GET(req: Request) {
  const ani = await getAuth(req);
  const sup = ani ? null : await getSupplierAuth(req);
  if (!ani && !sup) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const userId = ani ? ani.sub : await linkedUserFor(sup!.sub);
  const supplierId = sup ? sup.sub : await linkedSupplierFor(ani!.sub);

  const [user, supplier] = await Promise.all([
    userId ? findById(userId) : undefined,
    supplierId ? findSupplierById(supplierId) : undefined,
  ]);

  let aniSide = null;
  if (user) {
    const [profile, org, team] = await Promise.all([publicUser(user), resolveTenant(user.orgId), listOrgUsers(user.orgId)]);
    aniSide = {
      user: profile,
      org: { id: org.id, name: org.name, region: org.region, market: org.market, plan: org.plan },
      team: team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
    };
  }
  return NextResponse.json({ current: ani ? "ani" : "supplier", ani: aniSide, supplier: supplier ?? null });
}
