import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { findById, publicUser } from "@/lib/server/users";
import { signToken } from "@/lib/server/jwt";
import { TENANTS } from "@/lib/server/tenants";

/** Admin-only: re-issue a token scoped to a different tenant. */
export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const orgId = new URL(req.url).searchParams.get("orgId") || "";
  if (!TENANTS.some((t) => t.id === orgId)) {
    return NextResponse.json({ detail: "Unknown org" }, { status: 404 });
  }
  const user = await findById(claims.sub);
  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });

  const token = await signToken({ sub: user.id, email: user.email, role: user.role, org: orgId });
  return NextResponse.json({ token, user: await publicUser(user, orgId) });
}
