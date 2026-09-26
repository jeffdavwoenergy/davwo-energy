import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { inviteUser, EmailInUseError } from "@/lib/server/users";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "operator", "pilot"];

export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  if (!rateLimit(`invite:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email: string = (body?.email ?? "").toString().trim().slice(0, 200);
  const name: string = (body?.name ?? "").toString().trim().slice(0, 120);
  const role: string = (body?.role ?? "").toString();

  if (!email || !name || !ROLES.includes(role as Role)) {
    return NextResponse.json({ detail: "email, name and a valid role are required" }, { status: 400 });
  }

  try {
    const result = await inviteUser(claims.org, email, name, role as Role);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof EmailInUseError) {
      return NextResponse.json({ detail: err.message }, { status: 409 });
    }
    throw err;
  }
}
