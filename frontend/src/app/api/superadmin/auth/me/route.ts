import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getSuperAdminAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ email: claims.email, expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : undefined });
}
