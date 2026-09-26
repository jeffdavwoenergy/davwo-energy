import { NextResponse } from "next/server";
import { getAuth, isPlatformAdmin } from "@/lib/server/auth";
import { getProduct, addProductDocument, listProductDocuments, DocumentTooLargeError, UnsupportedDocumentTypeError } from "@/lib/server/products";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProduct(id))) return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  return NextResponse.json({ documents: await listProductDocuments(id) });
}

/** Admin-only manual/spec-sheet upload — this is the feature that lets ANI
 * answer intricate technical questions grounded in a product's real
 * documentation instead of just its summary fields. PDF or plain text,
 * capped at 8MB (see products.ts), stored as a DB blob (no object-storage
 * vendor added yet — fine at this catalogue size). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(claims)) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  if (!rateLimit(`product-doc-upload:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return NextResponse.json({ detail: "Product not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "A file is required (field name: file)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const meta = await addProductDocument(id, { filename: file.name, mimeType: file.type, data: buffer });
    return NextResponse.json(meta, { status: 201 });
  } catch (err) {
    if (err instanceof DocumentTooLargeError || err instanceof UnsupportedDocumentTypeError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    throw err;
  }
}
