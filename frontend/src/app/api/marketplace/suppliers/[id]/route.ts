import { NextResponse } from "next/server";
import { getAuth, isPlatformAdmin } from "@/lib/server/auth";
import { setSupplierVerified } from "@/lib/server/suppliers";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(claims)) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.verified !== "boolean") {
    return NextResponse.json({ detail: "verified (boolean) is required" }, { status: 400 });
  }

  const { id } = await params;
  const supplier = await setSupplierVerified(id, body.verified);
  if (!supplier) return NextResponse.json({ detail: "Supplier not found" }, { status: 404 });
  return NextResponse.json(supplier);
}
