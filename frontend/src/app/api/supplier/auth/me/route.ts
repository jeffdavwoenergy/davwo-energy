import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { findSupplierById } from "@/lib/server/suppliers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const supplier = await findSupplierById(claims.sub);
  if (!supplier) return NextResponse.json({ detail: "Supplier not found" }, { status: 404 });
  return NextResponse.json(supplier);
}
