import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { withTenant, currentOrg, UnauthorizedError } from "@/lib/server/context";
import { decideLead, LeadNotFoundError, InvalidLeadTransitionError } from "@/lib/server/marketplace";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Buyer accepts/declines a lead their org sent, once the supplier has responded. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Auth before rate limiting — matches the sibling supplier route, and
  // keeps an unauthenticated caller from being able to exhaust an IP-keyed
  // bucket that legitimate users behind the same NAT/proxy also share.
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  // "pilot" is this platform's read-only trial tier — deciding a procurement
  // enquiry is an organisation-level action, not something a read-only
  // viewer should be able to do on the org's behalf.
  if (claims.role === "pilot") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  if (!rateLimit(`marketplace-lead-decide:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const decision = body?.decision;
  if (decision !== "accepted" && decision !== "declined") {
    return NextResponse.json({ detail: "decision must be 'accepted' or 'declined'" }, { status: 400 });
  }

  try {
    const lead = await withTenant(req, () => decideLead(currentOrg(), id, decision));
    return NextResponse.json(lead);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    if (err instanceof LeadNotFoundError) return NextResponse.json({ detail: err.message }, { status: 404 });
    if (err instanceof InvalidLeadTransitionError) return NextResponse.json({ detail: err.message }, { status: 400 });
    throw err;
  }
}
