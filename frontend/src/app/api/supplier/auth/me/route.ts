import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { findSupplierById, updateSupplierProfile } from "@/lib/server/suppliers";
import { CATEGORIES } from "@/lib/server/marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const supplier = await findSupplierById(claims.sub);
  if (!supplier) return NextResponse.json({ detail: "Supplier not found" }, { status: 404 });
  return NextResponse.json(supplier);
}

/** The supplier's own company profile (portal Settings page). */
export async function PATCH(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const companyName: string = (body?.companyName ?? "").toString().trim().slice(0, 120);
  const category: string = (body?.category ?? "").toString();
  const region: string = (body?.region ?? "").toString().trim().slice(0, 80);
  const website: string = (body?.website ?? "").toString().trim().slice(0, 200);

  if (!companyName || !CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ detail: "Company name and a valid category are required" }, { status: 400 });
  }
  if (website && !/^https?:\/\/\S+$/i.test(website)) {
    return NextResponse.json({ detail: "Website must start with http:// or https://" }, { status: 400 });
  }

  const supplier = await updateSupplierProfile(claims.sub, { companyName, category, region, website });
  if (!supplier) return NextResponse.json({ detail: "Supplier not found" }, { status: 404 });
  return NextResponse.json(supplier);
}
