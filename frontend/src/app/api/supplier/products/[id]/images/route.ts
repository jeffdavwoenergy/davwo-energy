import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import {
  getProduct, addProductImage,
  ImageTooLargeError, UnsupportedImageTypeError, TooManyImagesError,
} from "@/lib/server/products";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** A supplier adding a photo to their own listing's gallery — ownership
 * checked via vendorId, same as document uploads. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`supplier-image-upload:${clientKey(req)}`, 40, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  const product = await getProduct(id);
  if (!product || product.vendorId !== claims.sub) {
    return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "A file is required (field name: file)" }, { status: 400 });
  }

  try {
    const image = await addProductImage(id, { mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json(image, { status: 201 });
  } catch (err) {
    if (err instanceof ImageTooLargeError || err instanceof UnsupportedImageTypeError || err instanceof TooManyImagesError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    throw err;
  }
}
