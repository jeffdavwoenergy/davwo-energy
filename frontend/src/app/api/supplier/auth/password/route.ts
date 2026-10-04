import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { changeSupplierPassword, WrongSupplierPasswordError, DemoSupplierPasswordError } from "@/lib/server/suppliers";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`supplier-password:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword: string = (body?.currentPassword ?? "").toString();
  const newPassword: string = (body?.newPassword ?? "").toString();
  if (newPassword.length < 8) {
    return NextResponse.json({ detail: "New password must be at least 8 characters" }, { status: 400 });
  }

  try {
    await changeSupplierPassword(claims.sub, currentPassword, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WrongSupplierPasswordError) {
      return NextResponse.json({ detail: "Current password is incorrect" }, { status: 400 });
    }
    if (err instanceof DemoSupplierPasswordError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    throw err;
  }
}
