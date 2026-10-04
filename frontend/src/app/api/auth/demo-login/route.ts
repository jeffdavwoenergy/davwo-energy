import { NextResponse } from "next/server";
import { findById, findByRole, publicUser, DEMO_USERS } from "@/lib/server/users";
import { signToken } from "@/lib/server/jwt";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import type { Role } from "@/lib/types";

/**
 * One-click demo login for the investor/pilot demo experience. Off by
 * default — set ALLOW_DEMO_LOGIN=true on the showcase deployment. Must
 * stay off wherever real customer orgs/data exist alongside "davwo".
 *
 * ?account=<demo user id> picks a specific seeded account (e.g. the Davwo
 * vs Acme Corp admins); ?role= is the older first-match-by-role form.
 */
export async function POST(req: Request) {
  if ((process.env.ALLOW_DEMO_LOGIN ?? "").trim().toLowerCase() !== "true") {
    return NextResponse.json({ detail: "Demo login is disabled" }, { status: 403 });
  }
  if (!rateLimit(`demo-login:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }
  const params = new URL(req.url).searchParams;
  const account = params.get("account");
  let user;
  if (account) {
    // Only ever the seeded demo accounts — never an arbitrary user id.
    if (!DEMO_USERS.some((u) => u.id === account)) {
      return NextResponse.json({ detail: "Unknown demo account" }, { status: 400 });
    }
    user = await findById(account);
  } else {
    const role = (params.get("role") || "admin") as Role;
    if (!["admin", "operator", "pilot"].includes(role)) {
      return NextResponse.json({ detail: "Unknown role" }, { status: 400 });
    }
    user = await findByRole(role);
  }
  if (!user) return NextResponse.json({ detail: "No demo user for that account" }, { status: 404 });
  const token = await signToken({ sub: user.id, email: user.email, role: user.role, org: user.orgId });
  return NextResponse.json({ token, user: await publicUser(user) });
}
