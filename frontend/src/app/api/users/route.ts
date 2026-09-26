import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { listOrgUsers } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listOrgUsers(claims.org));
}
