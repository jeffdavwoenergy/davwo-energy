import { NextResponse } from "next/server";
import { getProduct, listProductDocuments, deleteProduct } from "@/lib/server/products";
import { resolveVendor } from "@/lib/server/marketplace";
import { getAuth, isPlatformAdmin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Public product detail page data — spec sheet + attached document metadata
 * (not the raw file bytes; see the documents/[docId] route for download). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return NextResponse.json({ detail: "Product not found" }, { status: 404 });

  const [documents, vendor] = await Promise.all([listProductDocuments(id), resolveVendor(product.vendorId)]);
  return NextResponse.json({ product, vendor, documents });
}

/** Marketplace administration — admin-only removal of a listing (any vendor's,
 * static-curated or a real supplier's). Suppliers manage their own listings
 * through their portal; this is the platform team's moderation path. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(claims)) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const removed = await deleteProduct(id);
  if (!removed) return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
