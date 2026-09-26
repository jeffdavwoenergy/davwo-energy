import { NextResponse } from "next/server";
import { findByEmail, checkPassword, publicUser } from "@/lib/server/users";
import { signToken } from "@/lib/server/jwt";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export async function POST(req: Request) {
  if (!rateLimit(`login:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const email: string = body?.email || "";
  const password: string = body?.password || "";
  const user = email ? await findByEmail(email) : undefined;
  if (!user || !(await checkPassword(user, password))) {
    return NextResponse.json({ detail: "Invalid email or password" }, { status: 401 });
  }
  const token = await signToken({ sub: user.id, email: user.email, role: user.role, org: user.orgId });
  return NextResponse.json({ token, user: await publicUser(user) });
}
