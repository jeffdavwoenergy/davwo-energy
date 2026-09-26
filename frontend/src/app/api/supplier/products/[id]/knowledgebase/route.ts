import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { getProduct } from "@/lib/server/products";
import { addKnowledgeBaseEntry } from "@/lib/server/knowledgeBase";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** A supplier can only add known-issue entries to their own product —
 * ownership is checked via the product's vendorId, same as the document
 * upload route. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`supplier-kb-create:${clientKey(req)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  const product = await getProduct(id);
  if (!product || product.vendorId !== claims.sub) {
    return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const issue: string = (body?.issue ?? "").toString().trim().slice(0, 200);
  const symptoms: string = (body?.symptoms ?? "").toString().trim().slice(0, 1000);
  const resolution: string = (body?.resolution ?? "").toString().trim().slice(0, 4000);
  if (!issue || !resolution) {
    return NextResponse.json({ detail: "issue and resolution are required" }, { status: 400 });
  }

  const entry = await addKnowledgeBaseEntry(id, { issue, symptoms: symptoms || undefined, resolution });
  return NextResponse.json(entry, { status: 201 });
}
