import { NextResponse } from "next/server";
import { authenticateSupplier, WrongSupplierPasswordError } from "@/lib/server/suppliers";
import { signSupplierToken } from "@/lib/server/jwt";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`supplier-login:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email: string = (body?.email ?? "").toString().trim();
  const password: string = (body?.password ?? "").toString();
  if (!email || !password) {
    return NextResponse.json({ detail: "email and password are required" }, { status: 400 });
  }

  try {
    const supplier = await authenticateSupplier(email, password);
    const token = await signSupplierToken({ sub: supplier.id, email: supplier.email });
    return NextResponse.json({ token, supplier });
  } catch (err) {
    if (err instanceof WrongSupplierPasswordError) {
      return NextResponse.json({ detail: err.message }, { status: 401 });
    }
    throw err;
  }
}
