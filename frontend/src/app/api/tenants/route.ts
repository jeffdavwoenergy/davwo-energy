import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { tenantsForUser } from "@/lib/server/tenants";

export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  // Don't leak seeds to the client.
  const list = (await tenantsForUser(claims.role, claims.org)).map(({ seed: _seed, ...t }) => {
    void _seed;
    return t;
  });
  return NextResponse.json(list);
}
