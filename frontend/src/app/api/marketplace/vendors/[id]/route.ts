import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { resolveVendor } from "@/lib/server/marketplace";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const vendor = await resolveVendor(id);
  if (!vendor) return NextResponse.json({ detail: "Vendor not found" }, { status: 404 });
  return NextResponse.json(vendor);
}
