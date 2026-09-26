import { NextResponse } from "next/server";
import { registerSupplier, SupplierEmailInUseError } from "@/lib/server/suppliers";
import { signSupplierToken } from "@/lib/server/jwt";
import { CATEGORIES } from "@/lib/server/marketplace";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!rateLimit(`supplier-signup:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const companyName: string = (body?.companyName ?? "").toString().trim().slice(0, 160);
  const category: string = (body?.category ?? "").toString();
  const email: string = (body?.email ?? "").toString().trim().slice(0, 200);
  const password: string = (body?.password ?? "").toString();
  const region: string = (body?.region ?? "").toString().trim().slice(0, 120);
  const website: string = (body?.website ?? "").toString().trim().slice(0, 200);

  if (!companyName || !email || !EMAIL_RE.test(email) || !CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ detail: "Company name, a valid category, and a valid email are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ detail: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const supplier = await registerSupplier({
      email, password, companyName, category,
      region: region || undefined, website: website || undefined,
    });
    const token = await signSupplierToken({ sub: supplier.id, email: supplier.email });
    return NextResponse.json({ token, supplier }, { status: 201 });
  } catch (err) {
    if (err instanceof SupplierEmailInUseError) {
      return NextResponse.json({ detail: err.message }, { status: 409 });
    }
    throw err;
  }
}
