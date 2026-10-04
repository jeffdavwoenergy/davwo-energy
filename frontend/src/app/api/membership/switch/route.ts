import { NextResponse } from "next/server";
import { getAuth, getSupplierAuth } from "@/lib/server/auth";
import { signToken, signSupplierToken } from "@/lib/server/jwt";
import { findById, publicUser } from "@/lib/server/users";
import { findSupplierById } from "@/lib/server/suppliers";
import { linkedSupplierFor, linkedUserFor } from "@/lib/server/accountLinks";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Switch platforms without signing in again: with a valid session on one
 * platform, returns a session for the LINKED account on the other (see
 * /api/membership/link). 409 when the accounts aren't linked yet — the
 * client then falls back to the other platform's sign-in page.
 * Body: { to: "ani" | "supplier" }.
 */
export async function POST(req: Request) {
  if (!rateLimit(`membership-switch:${clientKey(req)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const to = body?.to;

  if (to === "supplier") {
    const claims = await getAuth(req);
    if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    const supplierId = await linkedSupplierFor(claims.sub);
    const supplier = supplierId ? await findSupplierById(supplierId) : undefined;
    if (!supplier) return NextResponse.json({ detail: "No linked supplier account" }, { status: 409 });
    return NextResponse.json({ token: await signSupplierToken({ sub: supplier.id, email: supplier.email }), supplier });
  }

  if (to === "ani") {
    const claims = await getSupplierAuth(req);
    if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    const userId = await linkedUserFor(claims.sub);
    const user = userId ? await findById(userId) : undefined;
    if (!user) return NextResponse.json({ detail: "No linked ANI™ account" }, { status: 409 });
    const token = await signToken({ sub: user.id, email: user.email, role: user.role, org: user.orgId });
    return NextResponse.json({ token, user: await publicUser(user) });
  }

  return NextResponse.json({ detail: "`to` must be \"ani\" or \"supplier\"" }, { status: 400 });
}
