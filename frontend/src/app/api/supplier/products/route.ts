import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { createProduct, listProducts, parseListing } from "@/lib/server/products";
import { CATEGORIES } from "@/lib/server/marketplace";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** A supplier's own catalogue — scoped to their own vendorId (their supplier
 * id), never another supplier's or a static vendor's products. */
export async function GET(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const products = await listProducts({ vendorId: claims.sub });
  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`supplier-product-create:${clientKey(req)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const name: string = (body?.name ?? "").toString().trim().slice(0, 160);
  const category: string = (body?.category ?? "").toString();
  const summary: string = (body?.summary ?? "").toString().trim().slice(0, 240);
  const description: string = (body?.description ?? "").toString().trim().slice(0, 4000);
  const priceNote: string = (body?.priceNote ?? "").toString().trim().slice(0, 120);
  const specs = body?.specs && typeof body.specs === "object" ? body.specs : undefined;
  const listing = parseListing(body?.listing);

  if (!name || !summary || !description || !CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ detail: "name, a valid category, summary and description are required" }, { status: 400 });
  }

  const product = await createProduct({
    vendorId: claims.sub, name, category, summary, description,
    specs, priceNote: priceNote || undefined, listing,
  });
  return NextResponse.json(product, { status: 201 });
}
