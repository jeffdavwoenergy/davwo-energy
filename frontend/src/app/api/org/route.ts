import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { updateOrg, isMarket, type Market } from "@/lib/server/orgs";
import { TENANTS } from "@/lib/server/tenants";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  if (!rateLimit(`org-update:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  if (TENANTS.some((t) => t.id === claims.org)) {
    return NextResponse.json(
      { detail: "This organisation's details are fixed for the shared demo tenant and can't be edited." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const updates: { name?: string; region?: string; market?: Market } = {};
  if (body?.name !== undefined) updates.name = body.name.toString().trim().slice(0, 120);
  if (body?.region !== undefined) updates.region = body.region.toString().trim().slice(0, 80);
  if (body?.market !== undefined) {
    const market = body.market.toString().trim().toLowerCase();
    if (!isMarket(market)) {
      return NextResponse.json({ detail: "Unrecognised market" }, { status: 400 });
    }
    updates.market = market;
  }

  if (updates.name !== undefined && !updates.name) {
    return NextResponse.json({ detail: "Organisation name cannot be empty" }, { status: 400 });
  }

  const org = await updateOrg(claims.org, updates);
  if (!org) return NextResponse.json({ detail: "Organisation not found" }, { status: 404 });
  return NextResponse.json(org);
}
