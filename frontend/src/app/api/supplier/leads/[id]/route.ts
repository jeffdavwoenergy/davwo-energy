import { NextResponse } from "next/server";
import { getSupplierAuth } from "@/lib/server/auth";
import { respondToLead, LeadNotFoundError, InvalidLeadTransitionError } from "@/lib/server/marketplace";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Supplier responds to one of their own leads — new -> responded. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getSupplierAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`supplier-lead-respond:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const response: string = (body?.response ?? "").toString().trim().slice(0, 1000);
  if (!response) return NextResponse.json({ detail: "A response message is required" }, { status: 400 });

  try {
    const lead = await respondToLead(claims.sub, id, response);
    return NextResponse.json(lead);
  } catch (err) {
    if (err instanceof LeadNotFoundError) return NextResponse.json({ detail: err.message }, { status: 404 });
    if (err instanceof InvalidLeadTransitionError) return NextResponse.json({ detail: err.message }, { status: 400 });
    throw err;
  }
}
