import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { listVendors, CATEGORIES } from "@/lib/server/marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const category = new URL(req.url).searchParams.get("category") || undefined;
  return NextResponse.json({ vendors: listVendors(category), categories: CATEGORIES });
}
