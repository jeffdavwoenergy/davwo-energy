import { NextResponse } from "next/server";
import { getProductImage } from "@/lib/server/products";

export const dynamic = "force-dynamic";

/** Public — listing photos are shown to anyone browsing the marketplace.
 * Image ids are immutable (a replaced photo gets a new id), so the response
 * can be cached hard. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;
  const image = await getProductImage(imageId);
  if (!image || image.productId !== id) {
    return NextResponse.json({ detail: "Photo not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
