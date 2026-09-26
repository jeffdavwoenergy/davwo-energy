import { NextResponse } from "next/server";
import { findByRole, publicUser } from "@/lib/server/users";
import { signToken } from "@/lib/server/jwt";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import type { Role } from "@/lib/types";

/**
 * One-click role login for the investor/pilot demo experience. Off by
 * default — set ALLOW_DEMO_LOGIN=true on the showcase deployment. Must
 * stay off wherever real customer orgs/data exist alongside "davwo".
 */
export async function POST(req: Request) {
  if ((process.env.ALLOW_DEMO_LOGIN ?? "").trim().toLowerCase() !== "true") {
    return NextResponse.json({ detail: "Demo login is disabled" }, { status: 403 });
  }
  if (!rateLimit(`demo-login:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }
  const role = (new URL(req.url).searchParams.get("role") || "admin") as Role;
  if (!["admin", "operator", "pilot"].includes(role)) {
    return NextResponse.json({ detail: "Unknown role" }, { status: 400 });
  }
  const user = await findByRole(role);
  if (!user) return NextResponse.json({ detail: "No demo user for role" }, { status: 404 });
  const token = await signToken({ sub: user.id, email: user.email, role: user.role, org: user.orgId });
  return NextResponse.json({ token, user: await publicUser(user) });
}
