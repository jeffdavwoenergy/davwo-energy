import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { getProduct, updateProduct, parseListing, type ProductListing } from "@/lib/server/products";
import { CATEGORIES } from "@/lib/server/marketplace";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** The platform-provided gallery (seeded demo listings) isn't part of the
 * supplier's form, so an edit must carry it over rather than wipe it. */
function withGallery(listing: ProductListing | undefined, gallery: string[] | undefined): ProductListing | undefined {
  if (!gallery?.length) return listing;
  return { ...(listing ?? {}), gallery };
}

/** A supplier editing their own listing — same fields and validation as
 * create, ownership checked via vendorId (another supplier's product is a
 * 404, not a 403, so ids can't be probed). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`supplier-product-update:${clientKey(req)}`, 60, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  const existing = await getProduct(id);
  if (!existing || existing.vendorId !== claims.sub) {
    return NextResponse.json({ detail: "Product not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name: string = (body?.name ?? "").toString().trim().slice(0, 160);
  const category: string = (body?.category ?? "").toString();
  const summary: string = (body?.summary ?? "").toString().trim().slice(0, 240);
  const description: string = (body?.description ?? "").toString().trim().slice(0, 4000);
  const priceNote: string = (body?.priceNote ?? "").toString().trim().slice(0, 120);
  const specs = body?.specs && typeof body.specs === "object" ? body.specs : undefined;

  if (!name || !summary || !description || !CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ detail: "name, a valid category, summary and description are required" }, { status: 400 });
  }

  const product = await updateProduct(id, {
    name, category, summary, description,
    specs, priceNote: priceNote || undefined, listing: withGallery(parseListing(body?.listing), existing.listing?.gallery),
  });
  return NextResponse.json(product);
}
