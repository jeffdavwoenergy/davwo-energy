import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { getProduct, deleteProductImage } from "@/lib/server/products";

export const dynamic = "force-dynamic";

/** A supplier removing a photo from their own listing. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id, imageId } = await params;
  const product = await getProduct(id);
  if (!product || product.vendorId !== claims.sub || !(await deleteProductImage(id, imageId))) {
    return NextResponse.json({ detail: "Photo not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
