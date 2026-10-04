import { NextResponse } from "next/server";
import { getAuth, getSupplierAuth } from "@/lib/server/auth";
import { getMembership } from "@/lib/server/membership";
import { linkedSupplierFor, linkedUserFor } from "@/lib/server/accountLinks";

export const dynamic = "force-dynamic";

/** The caller's membership across ANI™ and the Supplier Portal — works with
 * either platform's token (shown on both Settings pages). `linked` says
 * whether switching to the other platform can skip its sign-in. */
export async function GET(req: Request) {
  const ani = await getAuth(req);
  const supplier = ani ? null : await getSupplierAuth(req);
  const claims = ani ?? supplier;
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  const linked = Boolean(ani ? await linkedSupplierFor(ani.sub) : await linkedUserFor(supplier!.sub));
  return NextResponse.json({ ...(await getMembership(claims.email)), linked });
}
