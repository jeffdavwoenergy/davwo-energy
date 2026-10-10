import { NextResponse } from "next/server";
import { assets, createAsset } from "@/lib/server/providers";
import { tenantJson, withMutateTenant, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import { ASSET_TYPES, parseSpecs, type AssetType } from "@/lib/assetSpecs";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  return tenantJson(req, () => assets(currentOrg()));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name: string = (body?.name ?? "").toString().trim().slice(0, 120);
  const type: string = (body?.type ?? "").toString();
  const site: string = (body?.site ?? "").toString().trim().slice(0, 120);
  const capacity_kw = Number(body?.capacity_kw);
  const manufacturer: string | undefined = body?.manufacturer ? body.manufacturer.toString().trim().slice(0, 120) : undefined;
  const model: string | undefined = body?.model ? body.model.toString().trim().slice(0, 120) : undefined;
  const serial_number: string | undefined = body?.serial_number ? body.serial_number.toString().trim().slice(0, 120) : undefined;
  const installed_at: string | undefined = body?.installed_at ? body.installed_at.toString() : undefined;
  const product_id: string | undefined = body?.product_id ? body.product_id.toString() : undefined;

  if (!name || !site || !ASSET_TYPES.includes(type as AssetType) || !Number.isFinite(capacity_kw) || capacity_kw <= 0) {
    return NextResponse.json(
      { detail: "name, site, a valid type, and a positive capacity_kw are required" },
      { status: 400 },
    );
  }
  if (installed_at && Number.isNaN(new Date(installed_at).getTime())) {
    return NextResponse.json({ detail: "installed_at must be a valid date" }, { status: 400 });
  }
  const { specs, error: specsError } = parseSpecs(type as AssetType, body?.specs);
  if (specsError) return NextResponse.json({ detail: specsError }, { status: 400 });

  try {
    const asset = await withMutateTenant(req, () =>
      createAsset(currentOrg(), {
        name, type: type as AssetType, site, capacity_kw,
        manufacturer, model, serial_number, installed_at, product_id,
        specs: Object.keys(specs).length ? specs : undefined,
      }),
    );
    return NextResponse.json(asset, { status: 201 });
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
