import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/lib/server/auth";
import { deleteProduct } from "@/lib/server/products";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSuperAdminAuth(req))) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await deleteProduct(id))) return NextResponse.json({ detail: "Listing not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
