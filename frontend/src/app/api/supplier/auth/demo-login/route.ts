import { NextResponse } from "next/server";
import { DEMO_SUPPLIERS, findSupplierById } from "@/lib/server/suppliers";
import { signSupplierToken } from "@/lib/server/jwt";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** One-click demo login for the seeded supplier accounts (Davwo Energy,
 * Acme Corp) — same ALLOW_DEMO_LOGIN gate as the ANI™ demo login. */
export async function POST(req: Request) {
  if ((process.env.ALLOW_DEMO_LOGIN ?? "").trim().toLowerCase() !== "true") {
    return NextResponse.json({ detail: "Demo login is disabled" }, { status: 403 });
  }
  if (!rateLimit(`supplier-demo-login:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }
  const account = new URL(req.url).searchParams.get("account") ?? "";
  if (!DEMO_SUPPLIERS.some((s) => s.id === account)) {
    return NextResponse.json({ detail: "Unknown demo account" }, { status: 400 });
  }
  const supplier = await findSupplierById(account);
  if (!supplier) return NextResponse.json({ detail: "No demo supplier for that account" }, { status: 404 });
  const token = await signSupplierToken({ sub: supplier.id, email: supplier.email });
  return NextResponse.json({ token, supplier });
}
