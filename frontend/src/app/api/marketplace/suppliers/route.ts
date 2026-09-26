import { NextResponse } from "next/server";
import { getAuth, isPlatformAdmin } from "@/lib/server/auth";
import { listSuppliers } from "@/lib/server/suppliers";

export const dynamic = "force-dynamic";

/** Marketplace administration — admin-only view of every registered supplier
 * account, for verifying (or removing verification from) a company. */
export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(claims)) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const suppliers = await listSuppliers();
  return NextResponse.json({ suppliers });
}
