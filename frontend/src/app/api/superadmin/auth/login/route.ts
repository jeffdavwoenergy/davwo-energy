import { NextResponse } from "next/server";
import { checkSuperAdmin, isSuperAdminConfigured, superAdminEmail, SUPERADMIN_ID } from "@/lib/server/superadmin";
import { signSuperAdminToken } from "@/lib/server/jwt";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Tighter than the customer/supplier logins — this session can manage every account.
  if (!rateLimit(`superadmin-login:${clientKey(req)}`, 5, 15 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait 15 minutes." }, { status: 429 });
  }
  if (!isSuperAdminConfigured()) {
    return NextResponse.json({ detail: "Super admin access is not configured on this deployment." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const email: string = (body?.email ?? "").toString().trim();
  const password: string = (body?.password ?? "").toString();
  if (!email || !password) {
    return NextResponse.json({ detail: "email and password are required" }, { status: 400 });
  }
  if (!checkSuperAdmin(email, password)) {
    return NextResponse.json({ detail: "Invalid super admin credentials" }, { status: 401 });
  }

  const token = await signSuperAdminToken({ sub: SUPERADMIN_ID, email: superAdminEmail()! });
  return NextResponse.json({ token, email: superAdminEmail() });
}
