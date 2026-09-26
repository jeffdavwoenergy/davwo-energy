import { describe, it, expect, vi, beforeEach } from "vitest";

const assetStore: Record<string, unknown>[] = [];
const readingStore: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    userAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = { locationLat: null, locationLng: null, manufacturer: null, model: null, serialNumber: null, installedAt: null, productId: null, createdAt: now, updatedAt: now, ...data };
        assetStore.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => assetStore.find((d) => d.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const doc = assetStore.find((d) => d.id === where.id);
        if (!doc) throw new Error("Record to update not found.");
        Object.assign(doc, data, { updatedAt: new Date() });
        return doc;
      },
    },
    assetReading: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        readingStore.push(data);
        return data;
      },
      findMany: async ({ where, orderBy, take }: { where: Record<string, unknown>; orderBy?: { recordedAt: string }; take?: number }) => {
        let rows = readingStore.filter(
          (r) => (where.assetId === undefined || r.assetId === where.assetId) && r.orgId === where.orgId,
        );
        if (where.recordedAt) {
          const range = where.recordedAt as { gte?: Date; lte?: Date };
          rows = rows.filter((r) => {
            const ts = (r.recordedAt as Date).getTime();
            return (!range.gte || ts >= range.gte.getTime()) && (!range.lte || ts <= range.lte.getTime());
          });
        }
        rows = [...rows].sort((a, b) =>
          orderBy?.recordedAt === "desc"
            ? (b.recordedAt as Date).getTime() - (a.recordedAt as Date).getTime()
            : (a.recordedAt as Date).getTime() - (b.recordedAt as Date).getTime(),
        );
        return take ? rows.slice(0, take) : rows;
      },
    },
  }),
}));

describe("assetReadings (Postgres-backed)", () => {
  beforeEach(() => {
    assetStore.length = 0;
    readingStore.length = 0;
    vi.resetModules();
  });

  it("ingestReading persists via Prisma, org-scoped, and refreshes the asset's live snapshot", async () => {
    const { addUserAsset, getUserAsset } = await import("@/lib/server/assetsStore");
    const { ingestReading, listReadings, AssetNotFoundError } = await import("@/lib/server/assetReadings");

    const asset = await addUserAsset("org-x", { name: "Rapid 50", type: "EV Charger", site: "Depot", capacity_kw: 50 });
    await ingestReading("org-x", asset.id, { power_kw: 25, recorded_at: new Date().toISOString() });
    expect(readingStore).toHaveLength(1);

    const updated = await getUserAsset("org-x", asset.id);
    expect(updated?.current_load_kw).toBe(25);
    expect(updated?.utilisation_pct).toBe(50);

    await expect(ingestReading("org-y", asset.id, { power_kw: 10, recorded_at: new Date().toISOString() })).rejects.toThrow(
      AssetNotFoundError,
    );

    const readings = await listReadings("org-x", asset.id);
    expect(readings).toHaveLength(1);
    expect(readings[0].power_kw).toBe(25);
    expect(await listReadings("org-y", asset.id)).toEqual([]);
  });

  it("listReadings filters by from/to via Prisma and orders newest-first", async () => {
    const { addUserAsset } = await import("@/lib/server/assetsStore");
    const { ingestReading, listReadings } = await import("@/lib/server/assetReadings");

    const asset = await addUserAsset("org-x", { name: "Solar", type: "Solar", site: "Roof", capacity_kw: 200 });
    const base = Date.now() - 60_000;
    await ingestReading("org-x", asset.id, { power_kw: 10, recorded_at: new Date(base).toISOString() });
    await ingestReading("org-x", asset.id, { power_kw: 20, recorded_at: new Date(base + 10_000).toISOString() });
    await ingestReading("org-x", asset.id, { power_kw: 30, recorded_at: new Date(base + 20_000).toISOString() });

    const all = await listReadings("org-x", asset.id);
    expect(all.map((r) => r.power_kw)).toEqual([30, 20, 10]);

    const windowed = await listReadings("org-x", asset.id, { from: new Date(base + 5_000).toISOString(), to: new Date(base + 15_000).toISOString() });
    expect(windowed.map((r) => r.power_kw)).toEqual([20]);
  });

  it("listReadingsForOrg spans every asset in the org via Prisma, scoped by orgId alone", async () => {
    const { addUserAsset } = await import("@/lib/server/assetsStore");
    const { ingestReading, listReadingsForOrg } = await import("@/lib/server/assetReadings");

    const a1 = await addUserAsset("org-x", { name: "Charger A", type: "EV Charger", site: "Depot", capacity_kw: 50 });
    const a2 = await addUserAsset("org-x", { name: "Charger B", type: "EV Charger", site: "Depot", capacity_kw: 50 });
    const foreign = await addUserAsset("org-y", { name: "Not Ours", type: "Solar", site: "Elsewhere", capacity_kw: 10 });

    const base = Date.now() - 60_000;
    await ingestReading("org-x", a1.id, { energy_kwh: 5, recorded_at: new Date(base).toISOString() });
    await ingestReading("org-x", a2.id, { energy_kwh: 7, recorded_at: new Date(base + 10_000).toISOString() });
    await ingestReading("org-y", foreign.id, { energy_kwh: 100, recorded_at: new Date(base).toISOString() });

    const rows = await listReadingsForOrg("org-x", base - 1000, base + 20_000);
    expect(rows.map((r) => r.energy_kwh).sort()).toEqual([5, 7]);
  });

  it("bulkIngestReadings ingests valid rows via Prisma and reports an error per failing row", async () => {
    const { addUserAsset } = await import("@/lib/server/assetsStore");
    const { bulkIngestReadings } = await import("@/lib/server/assetReadings");

    const asset = await addUserAsset("org-x", { name: "Bulk Asset", type: "Battery", site: "Site", capacity_kw: 100 });
    const result = await bulkIngestReadings("org-x", [
      { assetId: asset.id, assetName: "Bulk Asset", power_kw: 10, recorded_at: new Date().toISOString() },
      { assetId: "ua-unknown", assetName: "Ghost Asset", power_kw: 10, recorded_at: new Date().toISOString() },
    ]);
    expect(result.ingested).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Ghost Asset");
  });
});
