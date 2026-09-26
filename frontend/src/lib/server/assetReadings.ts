import { randomUUID } from "node:crypto";
import { getPrisma, isDbConfigured } from "@/lib/server/prisma";
import { getUserAsset, listUserAssets, updateUserAsset } from "@/lib/server/assetsStore";
import type { ReadingsCsvRow } from "@/lib/server/csvImport";

/**
 * Real per-asset time-series ingestion (Week 4: Energy Data Foundation) —
 * distinct from src/lib/ani/dataGenerator.ts's synthetic Reading type, which
 * is a deterministic, unpersisted generator for the engine-modelled EV
 * chargers only. This is the actual path for real customer telemetry: a
 * webhook, a polling integration, or manual/CSV entry all funnel through
 * ingestReading(). Same Postgres-with-in-memory-fallback pattern as
 * everything else in this codebase.
 */
export interface AssetReading {
  id: string;
  assetId: string;
  power_kw?: number;
  energy_kwh?: number;
  recorded_at: string;
}

export interface NewReadingInput {
  power_kw?: number;
  energy_kwh?: number;
  recorded_at: string;
}

const memoryReadings = new Map<string, AssetReading[]>(); // key: assetId

export class AssetNotFoundError extends Error {
  constructor() {
    super("Asset not found");
    this.name = "AssetNotFoundError";
  }
}

export class InvalidReadingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReadingError";
  }
}

function validate(input: NewReadingInput): void {
  if (input.power_kw === undefined && input.energy_kwh === undefined) {
    throw new InvalidReadingError("At least one of power_kw or energy_kwh is required");
  }
  if (input.power_kw !== undefined && (!Number.isFinite(input.power_kw) || input.power_kw < 0)) {
    throw new InvalidReadingError("power_kw must be a non-negative number");
  }
  if (input.energy_kwh !== undefined && (!Number.isFinite(input.energy_kwh) || input.energy_kwh < 0)) {
    throw new InvalidReadingError("energy_kwh must be a non-negative number");
  }
  const recordedAt = new Date(input.recorded_at).getTime();
  if (Number.isNaN(recordedAt)) throw new InvalidReadingError("recorded_at must be a valid date");
  if (recordedAt > Date.now() + 5 * 60_000) throw new InvalidReadingError("recorded_at can't be in the future");
}

/** Ingests one reading for an org's own asset, validates it, stores it, and —
 * when power_kw is given — refreshes the asset's live snapshot (current_load_kw
 * / utilisation_pct) so the Assets register and dashboard reflect real data the
 * moment it arrives, rather than this being a write-only pipeline nothing
 * surfaces. Throws AssetNotFoundError for an id that isn't a real
 * user-registered asset in this org (engine/preview assets can't receive
 * readings — they already have their own synthetic generator). */
export async function ingestReading(orgId: string, assetId: string, input: NewReadingInput): Promise<AssetReading> {
  validate(input);
  const asset = await getUserAsset(orgId, assetId);
  if (!asset) throw new AssetNotFoundError();

  const reading: AssetReading = {
    id: randomUUID(),
    assetId,
    power_kw: input.power_kw,
    energy_kwh: input.energy_kwh,
    recorded_at: input.recorded_at,
  };

  if (!isDbConfigured()) {
    const list = memoryReadings.get(assetId) ?? [];
    list.push(reading);
    memoryReadings.set(assetId, list);
  } else {
    const prisma = getPrisma()!;
    await prisma.assetReading.create({
      data: {
        id: reading.id,
        assetId,
        orgId,
        powerKw: reading.power_kw,
        energyKwh: reading.energy_kwh,
        recordedAt: new Date(reading.recorded_at),
      },
    });
  }

  if (input.power_kw !== undefined) {
    const utilisation_pct = asset.capacity_kw > 0 ? Math.min(100, Math.round((input.power_kw / asset.capacity_kw) * 100)) : 0;
    await updateUserAsset(orgId, assetId, { current_load_kw: input.power_kw, utilisation_pct });
  }

  return reading;
}

export interface BulkIngestResult {
  ingested: number;
  errors: string[];
}

const BULK_INGEST_CONCURRENCY = 10;

/** Ingests a batch of already-structurally-parsed CSV rows, BULK_INGEST_CONCURRENCY
 * at a time — one bad row (an asset that got deleted between upload and
 * submit, a stale future-dated timestamp, etc.) reports an error for that
 * row and continues, rather than aborting the whole file. Bounded
 * concurrency (rather than one-at-a-time, or all-at-once) keeps a large
 * import from taking as long as row-count × round-trip while not opening
 * hundreds of simultaneous DB connections at once. */
export async function bulkIngestReadings(orgId: string, rows: ReadingsCsvRow[]): Promise<BulkIngestResult> {
  const errors: string[] = [];
  let ingested = 0;
  for (let i = 0; i < rows.length; i += BULK_INGEST_CONCURRENCY) {
    const batch = rows.slice(i, i + BULK_INGEST_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row) => ingestReading(orgId, row.assetId, { power_kw: row.power_kw, energy_kwh: row.energy_kwh, recorded_at: row.recorded_at })),
    );
    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        ingested++;
      } else {
        const row = batch[idx];
        const message = result.reason instanceof Error ? result.reason.message : "Unknown error";
        errors.push(`"${row.assetName}" @ ${row.recorded_at}: ${message}`);
      }
    });
  }
  return { ingested, errors };
}

export interface ReadingQuery {
  from?: string;
  to?: string;
  limit?: number;
}

/** Time-range query for charting/analysis, newest-first, capped at 500 rows
 * per call regardless of requested limit (this is a read API, not a bulk
 * export — reports.ts is the place for full-history export). */
export async function listReadings(orgId: string, assetId: string, query: ReadingQuery = {}): Promise<AssetReading[]> {
  const limit = Math.min(query.limit ?? 100, 500);
  const fromTs = query.from ? new Date(query.from).getTime() : -Infinity;
  const toTs = query.to ? new Date(query.to).getTime() : Infinity;

  if (!isDbConfigured()) {
    // memoryReadings is keyed only by assetId (globally unique), so without
    // this ownership check any org could read any other org's readings by id.
    if (!(await getUserAsset(orgId, assetId))) return [];
    return (memoryReadings.get(assetId) ?? [])
      .filter((r) => {
        const ts = new Date(r.recorded_at).getTime();
        return ts >= fromTs && ts <= toTs;
      })
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      .slice(0, limit);
  }
  const prisma = getPrisma()!;
  const rows = await prisma.assetReading.findMany({
    where: {
      assetId,
      orgId,
      ...(query.from || query.to
        ? { recordedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    power_kw: r.powerKw ?? undefined,
    energy_kwh: r.energyKwh ?? undefined,
    recorded_at: r.recordedAt.toISOString(),
  }));
}

/** All of an org's readings (across every one of its assets) within a time
 * range — for aggregation (energySeries), not per-asset display. Uncapped:
 * callers own their own bucketing/summing, unlike listReadings' UI-facing cap. */
export async function listReadingsForOrg(orgId: string, fromMs: number, toMs: number): Promise<AssetReading[]> {
  if (!isDbConfigured()) {
    const assetIds = new Set((await listUserAssets(orgId)).map((a) => a.id));
    const out: AssetReading[] = [];
    for (const [assetId, list] of memoryReadings) {
      if (!assetIds.has(assetId)) continue;
      for (const r of list) {
        const ts = new Date(r.recorded_at).getTime();
        if (ts >= fromMs && ts <= toMs) out.push(r);
      }
    }
    return out;
  }
  const prisma = getPrisma()!;
  const rows = await prisma.assetReading.findMany({
    where: { orgId, recordedAt: { gte: new Date(fromMs), lte: new Date(toMs) } },
  });
  return rows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    power_kw: r.powerKw ?? undefined,
    energy_kwh: r.energyKwh ?? undefined,
    recorded_at: r.recordedAt.toISOString(),
  }));
}
