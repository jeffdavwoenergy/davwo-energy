import { NextResponse } from "next/server";
import { verifyToken, verifySupplierToken } from "@/lib/server/jwt";
import { findById } from "@/lib/server/users";
import { findSupplierById } from "@/lib/server/suppliers";
import { linkAccounts } from "@/lib/server/accountLinks";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Links an ANI™ account and a supplier account. Requires a valid session
 * token for EACH (i.e. the caller has signed in to both) and the same email
 * on both — matching emails alone are never enough, since supplier sign-up
 * doesn't verify email ownership.
 */
export async function POST(req: Request) {
  if (!rateLimit(`membership-link:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const ani = await verifyToken(String(body?.aniToken ?? "")).catch(() => null);
  const sup = await verifySupplierToken(String(body?.supplierToken ?? "")).catch(() => null);
  // 400, not 401: the client's api interceptor clears the ANI™ session on any
  // 401, and an expired *supplier* token here mustn't sign someone out of ANI™.
  if (!ani || !sup) return NextResponse.json({ detail: "A valid sign-in for both platforms is required" }, { status: 400 });

  const [user, supplier] = await Promise.all([findById(ani.sub), findSupplierById(sup.sub)]);
  if (!user || !supplier || user.email.toLowerCase() !== supplier.email.toLowerCase()) {
    return NextResponse.json({ detail: "Both accounts must use the same email" }, { status: 400 });
  }
  await linkAccounts(user.id, supplier.id);
  return NextResponse.json({ linked: true });
}
