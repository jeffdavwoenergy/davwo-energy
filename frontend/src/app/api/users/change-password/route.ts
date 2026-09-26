import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { changePassword, DemoAccountPasswordError, WrongPasswordError } from "@/lib/server/users";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`change-password:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword: string = (body?.currentPassword ?? "").toString();
  const newPassword: string = (body?.newPassword ?? "").toString();

  if (!currentPassword || newPassword.length < 8) {
    return NextResponse.json({ detail: "currentPassword is required and newPassword must be at least 8 characters" }, { status: 400 });
  }

  try {
    await changePassword(claims.sub, currentPassword, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DemoAccountPasswordError) {
      return NextResponse.json({ detail: err.message }, { status: 403 });
    }
    if (err instanceof WrongPasswordError) {
      return NextResponse.json({ detail: err.message }, { status: 401 });
    }
    throw err;
  }
}
