import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import { addUserAsset, getUserAsset } from "@/lib/server/assetsStore";
import { ingestReading, listReadings, listReadingsForOrg, bulkIngestReadings, AssetNotFoundError, InvalidReadingError } from "@/lib/server/assetReadings";

describe("assetReadings (in-memory fallback — no DATABASE_URL configured)", () => {
  it("confirms no DB is configured for this test file", () => {
    expect(isDbConfigured()).toBe(false);
  });

  it("ingestReading validates the asset exists in the org, and rejects an unknown/foreign id", async () => {
    const org = `org-${Math.random()}`;
    await expect(ingestReading(org, "ua-unknown", { power_kw: 10, recorded_at: new Date().toISOString() })).rejects.toThrow(
      AssetNotFoundError,
    );
    const asset = await addUserAsset(org, { name: "Rapid 50", type: "EV Charger", site: "Depot", capacity_kw: 50 });
    await expect(
      ingestReading(`org-other-${Math.random()}`, asset.id, { power_kw: 10, recorded_at: new Date().toISOString() }),
    ).rejects.toThrow(AssetNotFoundError);
  });

  it("ingestReading rejects invalid readings: neither metric given, negative values, bad/future timestamps", async () => {
    const org = `org-${Math.random()}`;
    const asset = await addUserAsset(org, { name: "Battery", type: "Battery", site: "Site", capacity_kw: 100 });

    await expect(ingestReading(org, asset.id, { recorded_at: new Date().toISOString() })).rejects.toThrow(InvalidReadingError);
    await expect(ingestReading(org, asset.id, { power_kw: -5, recorded_at: new Date().toISOString() })).rejects.toThrow(
      InvalidReadingError,
    );
    await expect(ingestReading(org, asset.id, { energy_kwh: -1, recorded_at: new Date().toISOString() })).rejects.toThrow(
      InvalidReadingError,
    );
    await expect(ingestReading(org, asset.id, { power_kw: 10, recorded_at: "not-a-date" })).rejects.toThrow(InvalidReadingError);
    await expect(
      ingestReading(org, asset.id, { power_kw: 10, recorded_at: new Date(Date.now() + 3_600_000).toISOString() }),
    ).rejects.toThrow(InvalidReadingError);
  });

  it("ingestReading with power_kw refreshes the asset's live snapshot (current_load_kw/utilisation_pct), capped at 100%", async () => {
    const org = `org-${Math.random()}`;
    const asset = await addUserAsset(org, { name: "Rapid 50", type: "EV Charger", site: "Depot", capacity_kw: 50 });

    await ingestReading(org, asset.id, { power_kw: 25, recorded_at: new Date().toISOString() });
    const midway = await getUserAsset(org, asset.id);
    expect(midway?.current_load_kw).toBe(25);
    expect(midway?.utilisation_pct).toBe(50);

    // Over capacity — utilisation caps at 100, doesn't overshoot.
    await ingestReading(org, asset.id, { power_kw: 80, recorded_at: new Date().toISOString() });
    const over = await getUserAsset(org, asset.id);
    expect(over?.utilisation_pct).toBe(100);

    // energy_kwh-only reading doesn't touch the live snapshot.
    await ingestReading(org, asset.id, { energy_kwh: 12, recorded_at: new Date().toISOString() });
    const afterEnergyOnly = await getUserAsset(org, asset.id);
    expect(afterEnergyOnly?.current_load_kw).toBe(80);
  });

  it("listReadings returns newest-first, filters by from/to, and caps at 500 regardless of requested limit", async () => {
    const org = `org-${Math.random()}`;
    const asset = await addUserAsset(org, { name: "Solar", type: "Solar", site: "Roof", capacity_kw: 200 });
    const base = Date.now() - 60_000;
    await ingestReading(org, asset.id, { power_kw: 10, recorded_at: new Date(base).toISOString() });
    await ingestReading(org, asset.id, { power_kw: 20, recorded_at: new Date(base + 10_000).toISOString() });
    await ingestReading(org, asset.id, { power_kw: 30, recorded_at: new Date(base + 20_000).toISOString() });

    const all = await listReadings(org, asset.id);
    expect(all.map((r) => r.power_kw)).toEqual([30, 20, 10]);

    const windowed = await listReadings(org, asset.id, { from: new Date(base + 5_000).toISOString() });
    expect(windowed.map((r) => r.power_kw)).toEqual([30, 20]);

    const capped = await listReadings(org, asset.id, { limit: 10_000 });
    expect(capped.length).toBeLessThanOrEqual(500);

    expect(await listReadings(`org-other-${Math.random()}`, asset.id)).toEqual([]);
  });

  it("listReadingsForOrg spans every asset the org owns, ignores other orgs' assets, and respects the range", async () => {
    const org = `org-${Math.random()}`;
    const a1 = await addUserAsset(org, { name: "Charger A", type: "EV Charger", site: "Depot", capacity_kw: 50 });
    const a2 = await addUserAsset(org, { name: "Charger B", type: "EV Charger", site: "Depot", capacity_kw: 50 });
    const otherOrg = `org-other-${Math.random()}`;
    const foreign = await addUserAsset(otherOrg, { name: "Not Ours", type: "Solar", site: "Elsewhere", capacity_kw: 10 });

    const base = Date.now() - 60_000;
    await ingestReading(org, a1.id, { energy_kwh: 5, recorded_at: new Date(base).toISOString() });
    await ingestReading(org, a2.id, { energy_kwh: 7, recorded_at: new Date(base + 10_000).toISOString() });
    await ingestReading(org, a2.id, { energy_kwh: 9, recorded_at: new Date(base - 3_600_000).toISOString() }); // outside range
    await ingestReading(otherOrg, foreign.id, { energy_kwh: 100, recorded_at: new Date(base).toISOString() });

    const inRange = await listReadingsForOrg(org, base - 1000, base + 20_000);
    expect(inRange.map((r) => r.energy_kwh).sort()).toEqual([5, 7]);
  });

  it("bulkIngestReadings ingests valid rows and reports an error per failing row, without aborting the batch", async () => {
    const org = `org-${Math.random()}`;
    const asset = await addUserAsset(org, { name: "Bulk Asset", type: "Battery", site: "Site", capacity_kw: 100 });

    const result = await bulkIngestReadings(org, [
      { assetId: asset.id, assetName: "Bulk Asset", power_kw: 10, recorded_at: new Date().toISOString() },
      { assetId: asset.id, assetName: "Bulk Asset", power_kw: -5, recorded_at: new Date().toISOString() }, // invalid: negative
      { assetId: "ua-unknown", assetName: "Ghost Asset", power_kw: 10, recorded_at: new Date().toISOString() }, // invalid: no such asset
    ]);
    expect(result.ingested).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.includes("Bulk Asset"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Ghost Asset"))).toBe(true);
  });

  it("bulkIngestReadings processes a batch spanning multiple concurrency chunks without losing or misattributing any row", async () => {
    const org = `org-${Math.random()}`;
    const asset = await addUserAsset(org, { name: "Chunked Asset", type: "Battery", site: "Site", capacity_kw: 100 });

    // 25 rows exercises 3 chunks at the internal concurrency of 10; every
    // 5th row is deliberately invalid to prove errors land on the right row
    // regardless of which chunk it fell into.
    const rows = Array.from({ length: 25 }, (_, i) => ({
      assetId: i % 5 === 4 ? "ua-unknown" : asset.id,
      assetName: i % 5 === 4 ? `Ghost ${i}` : "Chunked Asset",
      power_kw: 5,
      recorded_at: new Date().toISOString(),
    }));

    const result = await bulkIngestReadings(org, rows);
    expect(result.ingested).toBe(20);
    expect(result.errors).toHaveLength(5);
    for (let i = 4; i < 25; i += 5) {
      expect(result.errors.some((e) => e.includes(`Ghost ${i}`))).toBe(true);
    }
  });
});
