import { NextResponse } from "next/server";
import { signup } from "@/lib/server/signup";
import { EmailInUseError } from "@/lib/server/users";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import { isMarket } from "@/lib/server/orgs";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!rateLimit(`signup:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const orgName: string = (body?.orgName ?? "").toString().trim().slice(0, 120);
  const region: string = (body?.region ?? "").toString().trim().slice(0, 80);
  const marketRaw: string = (body?.market ?? "").toString().trim().toLowerCase();
  const name: string = (body?.name ?? "").toString().trim().slice(0, 120);
  const email: string = (body?.email ?? "").toString().trim().slice(0, 200);
  const password: string = (body?.password ?? "").toString();

  if (!orgName || !name || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ detail: "Organisation name, your name and a valid email are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ detail: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const result = await signup({
      orgName,
      region: region || undefined,
      market: isMarket(marketRaw) ? marketRaw : undefined,
      name,
      email,
      password,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof EmailInUseError) {
      return NextResponse.json({ detail: err.message }, { status: 409 });
    }
    throw err;
  }
}
