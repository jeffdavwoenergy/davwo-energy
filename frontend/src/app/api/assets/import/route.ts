import { NextResponse } from "next/server";
import { withMutateTenant, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import { importAssets } from "@/lib/server/providers";
import { parseAssetsCsv } from "@/lib/server/csvImport";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`assets-import:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many imports — please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const csv = (body?.csv ?? "").toString();
  if (!csv.trim()) {
    return NextResponse.json({ detail: "No CSV content provided" }, { status: 400 });
  }

  const { rows, errors, totalDataRows } = parseAssetsCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json(
      { detail: "No valid rows to import", errors, totalDataRows, imported: 0 },
      { status: 400 },
    );
  }

  try {
    const created = await withMutateTenant(req, () => importAssets(currentOrg(), rows));
    return NextResponse.json(
      { imported: created.length, skipped: totalDataRows - created.length, errors, assets: created },
      { status: 201 },
    );
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
