import { NextResponse } from "next/server";
import { getAuth, isPlatformAdmin } from "@/lib/server/auth";
import { createProduct, listProducts } from "@/lib/server/products";
import { CATEGORIES, resolveVendor } from "@/lib/server/marketplace";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Public — product browse/search is the whole point of the "Google for
 * renewable products" positioning; no login required to look, same as any
 * real search engine or product catalogue. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const products = await listProducts({ category, q });
  const withVendor = await Promise.all(
    products.map(async (p) => ({ ...p, vendorName: (await resolveVendor(p.vendorId))?.name })),
  );
  return NextResponse.json({ products: withVendor, categories: CATEGORIES });
}

/** Admin-only — for the platform team adding/curating a listing on a
 * vendor's behalf (static or a real registered supplier). Suppliers manage
 * their own catalogue through /api/supplier/products instead. */
export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(claims)) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  if (!rateLimit(`product-create:${clientKey(req)}`, 30, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const vendorId: string = (body?.vendorId ?? "").toString();
  const name: string = (body?.name ?? "").toString().trim().slice(0, 160);
  const category: string = (body?.category ?? "").toString();
  const summary: string = (body?.summary ?? "").toString().trim().slice(0, 240);
  const description: string = (body?.description ?? "").toString().trim().slice(0, 4000);
  const priceNote: string = (body?.priceNote ?? "").toString().trim().slice(0, 120);
  const specs = body?.specs && typeof body.specs === "object" ? body.specs : undefined;

  if (!(await resolveVendor(vendorId))) return NextResponse.json({ detail: "Unknown vendor" }, { status: 400 });
  if (!name || !summary || !description || !CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ detail: "name, a valid category, summary and description are required" }, { status: 400 });
  }

  const product = await createProduct({
    vendorId, name, category, summary, description,
    specs, priceNote: priceNote || undefined,
  });
  return NextResponse.json(product, { status: 201 });
}
