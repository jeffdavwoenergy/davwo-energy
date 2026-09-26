import { NextResponse } from "next/server";
import { withMutateTenant, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import { listUserAssets } from "@/lib/server/assetsStore";
import { bulkIngestReadings } from "@/lib/server/assetReadings";
import { parseReadingsCsv } from "@/lib/server/csvImport";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Bulk-ingest usage readings from a CSV, matched by asset name against the
 * org's own registered assets — the second "connect your own data" path
 * alongside the single-reading API, for customers with a spreadsheet of
 * historical or manually-logged usage rather than a live integration. */
export async function POST(req: Request) {
  if (!rateLimit(`readings-import:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many imports — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const csv = (body?.csv ?? "").toString();
  if (!csv.trim()) {
    return NextResponse.json({ detail: "No CSV content provided" }, { status: 400 });
  }

  try {
    const result = await withMutateTenant(req, async () => {
      const orgId = currentOrg();
      const assets = await listUserAssets(orgId);
      const assetsByName = new Map<string, string[]>();
      for (const a of assets) {
        const key = a.name.toLowerCase();
        assetsByName.set(key, [...(assetsByName.get(key) ?? []), a.id]);
      }

      const parsed = parseReadingsCsv(csv, assetsByName);
      if (parsed.rows.length === 0) {
        return { imported: 0, skipped: parsed.totalDataRows, errors: parsed.errors };
      }
      const { ingested, errors: ingestErrors } = await bulkIngestReadings(orgId, parsed.rows);
      return {
        imported: ingested,
        skipped: parsed.totalDataRows - ingested,
        errors: [...parsed.errors, ...ingestErrors],
      };
    });

    if (result.imported === 0) {
      return NextResponse.json({ detail: "No valid rows to import", ...result }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}
