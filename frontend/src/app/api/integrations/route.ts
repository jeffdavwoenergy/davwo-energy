import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { tenantJson, currentOrg } from "@/lib/server/context";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import { integrationsOverview, connectIntegration, IntegrationInputError } from "@/lib/server/integrations/service";

export const dynamic = "force-dynamic";

/** The provider catalogue (with its access assessment), this org's
 * connections (never their credentials) and the live sync status. */
export async function GET(req: Request) {
  return tenantJson(req, () => integrationsOverview(currentOrg()));
}

/** Connect a device platform. Admin only — it stores third-party credentials
 * for the whole org. Body: { provider, token?, demo?, label? }. */
export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ detail: "Only an admin can connect device platforms" }, { status: 403 });
  if (!rateLimit(`integrations:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many attempts — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const result = await connectIntegration(claims.org, {
      provider: String(body?.provider ?? ""),
      token: typeof body?.token === "string" ? body.token : undefined,
      demo: body?.demo === true,
      label: typeof body?.label === "string" ? body.label : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof IntegrationInputError) return NextResponse.json({ detail: err.message }, { status: err.status });
    throw err;
  }
}
