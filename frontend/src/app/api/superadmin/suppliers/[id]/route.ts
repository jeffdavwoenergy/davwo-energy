import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/lib/server/auth";
import { setSupplierVerified, deleteSupplier } from "@/lib/server/suppliers";
import { listProducts, deleteProduct } from "@/lib/server/products";
import { unlinkSupplier } from "@/lib/server/accountLinks";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.verified !== "boolean") {
    return NextResponse.json({ detail: "verified (boolean) is required" }, { status: 400 });
  }
  const { id } = await params;
  const supplier = await setSupplierVerified(id, body.verified);
  if (!supplier) return NextResponse.json({ detail: "Supplier not found" }, { status: 404 });
  return NextResponse.json(supplier);
}

/** Removes the supplier account together with every listing it published. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const products = await listProducts({ vendorId: id });
  for (const p of products) await deleteProduct(p.id);
  await unlinkSupplier(id);
  if (!(await deleteSupplier(id))) return NextResponse.json({ detail: "Supplier not found" }, { status: 404 });
  return NextResponse.json({ ok: true, removedListings: products.length });
}
