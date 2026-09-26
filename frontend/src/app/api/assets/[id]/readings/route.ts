import { NextResponse } from "next/server";
import { withTenant, withMutateTenant, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import { ingestReading, listReadings, AssetNotFoundError, InvalidReadingError, type NewReadingInput } from "@/lib/server/assetReadings";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

function parseReading(body: unknown): NewReadingInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    power_kw: b.power_kw !== undefined ? Number(b.power_kw) : undefined,
    energy_kwh: b.energy_kwh !== undefined ? Number(b.energy_kwh) : undefined,
    recorded_at: (b.recorded_at ?? new Date().toISOString()).toString(),
  };
}

/** Accepts either a single reading or a batch (array) in one request — a real
 * ingestion integration (webhook, polling job, CSV import) is far more likely
 * to send a batch than one row at a time. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!rateLimit(`asset-readings:${clientKey(req)}`, 120, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const inputs = Array.isArray(body) ? body.map(parseReading) : [parseReading(body)];
  if (inputs.length === 0 || inputs.length > 500) {
    return NextResponse.json({ detail: "Provide 1-500 readings per request" }, { status: 400 });
  }

  try {
    const created = await withMutateTenant(req, async () => {
      const orgId = currentOrg();
      const out = [];
      for (const input of inputs) out.push(await ingestReading(orgId, id, input));
      return out;
    });
    return NextResponse.json(Array.isArray(body) ? { ingested: created.length, readings: created } : created[0], { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    if (err instanceof AssetNotFoundError) return NextResponse.json({ detail: err.message }, { status: 404 });
    if (err instanceof InvalidReadingError) return NextResponse.json({ detail: err.message }, { status: 400 });
    throw err;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const readings = await withTenant(req, () => listReadings(currentOrg(), id, { from, to, limit }));
    return NextResponse.json({ readings });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    throw err;
  }
}
