import { NextResponse } from "next/server";
import { askAboutProducts } from "@/lib/server/productQA";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Public, grounded product Q&A — no login required, matching the "Google
 * for renewable products" positioning: anyone researching products should
 * be able to ask, the same way a search engine doesn't gate its results. */
export async function POST(req: Request) {
  if (!rateLimit(`marketplace-ask:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds.map(String) : [];
  const question: string = (body?.question ?? "").toString().trim().slice(0, 500);

  if (productIds.length === 0 || !question) {
    return NextResponse.json({ detail: "productIds (non-empty array) and question are required" }, { status: 400 });
  }

  const result = await askAboutProducts(productIds, question);
  return NextResponse.json(result);
}
