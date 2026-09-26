import { NextResponse } from "next/server";
import { getProductDocument } from "@/lib/server/products";

export const dynamic = "force-dynamic";

/** Public download — a product's manual/spec sheet is meant to be readable
 * by any prospective buyer, same as a real product page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const doc = await getProductDocument(docId);
  if (!doc || doc.meta.productId !== id) {
    return NextResponse.json({ detail: "Document not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.meta.mimeType,
      "Content-Disposition": `inline; filename="${doc.meta.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
