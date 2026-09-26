import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { listLeadsForVendor } from "@/lib/server/marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const leads = await listLeadsForVendor(claims.sub);
  return NextResponse.json({ leads });
}
