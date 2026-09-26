import { describe, it, expect } from "vitest";
import { parseAssetsCsv, parseReadingsCsv } from "@/lib/server/csvImport";

describe("parseAssetsCsv", () => {
  it("parses a well-formed CSV with header aliases and type aliases", () => {
    const csv = "Asset Name,Category,Location,Capacity\nRapid 1,ev,Depot A,150\nArray,PV,Depot A,80\nBank,BESS,Depot A,215";
    const r = parseAssetsCsv(csv);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({ name: "Rapid 1", type: "EV Charger", site: "Depot A", capacity_kw: 150 });
    expect(r.rows[1].type).toBe("Solar");
    expect(r.rows[2].type).toBe("Battery");
    expect(r.errors).toHaveLength(0);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'name,type,site,capacity_kw\n"Depot, North",EV Charger,"Leeds, UK",50';
    const r = parseAssetsCsv(csv);
    expect(r.rows[0].name).toBe("Depot, North");
    expect(r.rows[0].site).toBe("Leeds, UK");
  });

  it("reports per-row errors without failing the whole import", () => {
    const csv = "name,type,site,capacity_kw\nGood,Solar,Site,10\nBadType,Rocket,Site,10\nNoCap,Battery,Site,abc\n,EV,Site,5";
    const r = parseAssetsCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe("Good");
    expect(r.errors.length).toBe(3);
    expect(r.errors.some((e) => /unknown type/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /capacity/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /name and site/i.test(e))).toBe(true);
  });

  it("rejects a CSV missing required columns", () => {
    const r = parseAssetsCsv("name,type\nX,Solar");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]).toMatch(/Missing required column/);
  });

  it("rejects empty or header-only input", () => {
    expect(parseAssetsCsv("").errors[0]).toMatch(/header row/);
    expect(parseAssetsCsv("name,type,site,capacity_kw").errors[0]).toMatch(/header row/);
  });

  it("enforces the row cap", () => {
    const lines = ["name,type,site,capacity_kw"];
    for (let i = 0; i < 5; i++) lines.push(`A${i},Solar,S,10`);
    const r = parseAssetsCsv(lines.join("\n"), 3);
    expect(r.rows).toHaveLength(3);
    expect(r.errors.some((e) => /Row limit/i.test(e))).toBe(true);
  });

  it("clamps absurd capacities", () => {
    const r = parseAssetsCsv("name,type,site,capacity_kw\nBig,Battery,S,9999999");
    expect(r.rows[0].capacity_kw).toBe(100_000);
  });

  it("parses the optional technical columns (manufacturer, model, serial_number, installed_at) when present", () => {
    const csv =
      "name,type,site,capacity_kw,manufacturer,model,serial_number,installed_at\n" +
      "Rapid 1,EV Charger,Depot A,150,ABB,Terra 184,SN-1,2025-03-01";
    const r = parseAssetsCsv(csv);
    expect(r.errors).toHaveLength(0);
    expect(r.rows[0]).toEqual({
      name: "Rapid 1", type: "EV Charger", site: "Depot A", capacity_kw: 150,
      manufacturer: "ABB", model: "Terra 184", serial_number: "SN-1", installed_at: "2025-03-01",
    });
  });

  it("leaves the optional technical fields undefined when the columns are absent or blank", () => {
    const r = parseAssetsCsv("name,type,site,capacity_kw\nRapid 1,EV Charger,Depot A,150");
    expect(r.rows[0].manufacturer).toBeUndefined();
    expect(r.rows[0].model).toBeUndefined();
    expect(r.rows[0].serial_number).toBeUndefined();
    expect(r.rows[0].installed_at).toBeUndefined();

    const blank = parseAssetsCsv(
      "name,type,site,capacity_kw,manufacturer,model,serial_number,installed_at\nRapid 1,EV Charger,Depot A,150,,,,",
    );
    expect(blank.rows[0].manufacturer).toBeUndefined();
    expect(blank.rows[0].installed_at).toBeUndefined();
  });

  it("rejects a row whose installed_at column isn't a valid date, without failing the whole import", () => {
    const csv =
      "name,type,site,capacity_kw,installed_at\nGood,Solar,S,10,2025-01-01\nBad,Solar,S,10,not-a-date";
    const r = parseAssetsCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe("Good");
    expect(r.errors.some((e) => /installed_at/i.test(e))).toBe(true);
  });
});

describe("parseReadingsCsv", () => {
  const oneAsset = new Map([["depot rapid 1", ["ua-1"]]]);
  const twoNamesake = new Map([["depot rapid 1", ["ua-1", "ua-2"]]]);

  it("parses a well-formed CSV with header aliases, resolving asset name to id", () => {
    const csv = "Asset,Power,Timestamp\nDepot Rapid 1,35,2026-08-25T09:00:00Z\nDepot Rapid 1,42,2026-08-25T10:00:00Z";
    const r = parseReadingsCsv(csv, oneAsset);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ assetId: "ua-1", assetName: "Depot Rapid 1", power_kw: 35, energy_kwh: undefined, recorded_at: "2026-08-25T09:00:00Z" });
    expect(r.errors).toHaveLength(0);
  });

  it("accepts energy_kwh instead of (or alongside) power_kw", () => {
    const csv = "asset_name,energy_kwh,recorded_at\nDepot Rapid 1,12.5,2026-08-25T09:00:00Z";
    const r = parseReadingsCsv(csv, oneAsset);
    expect(r.rows[0]).toMatchObject({ power_kw: undefined, energy_kwh: 12.5 });
  });

  it("reports per-row errors without failing the whole import", () => {
    const csv = [
      "asset_name,power_kw,recorded_at",
      "Depot Rapid 1,35,2026-08-25T09:00:00Z", // good
      "Unknown Asset,10,2026-08-25T09:00:00Z", // not found
      ",10,2026-08-25T09:00:00Z", // missing name
      "Depot Rapid 1,notanumber,2026-08-25T09:00:00Z", // bad number
      "Depot Rapid 1,10,", // missing timestamp
    ].join("\n");
    const r = parseReadingsCsv(csv, oneAsset);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(4);
    expect(r.errors.some((e) => /no asset named/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /asset name is required/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /not a number/i.test(e))).toBe(true);
    expect(r.errors.some((e) => /recorded_at is required/i.test(e))).toBe(true);
  });

  it("rejects a row with neither power_kw nor energy_kwh filled in", () => {
    const csv = "asset_name,power_kw,energy_kwh,recorded_at\nDepot Rapid 1,,,2026-08-25T09:00:00Z";
    const r = parseReadingsCsv(csv, oneAsset);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]).toMatch(/at least one of power_kw or energy_kwh/i);
  });

  it("flags an ambiguous asset name (matches more than one asset) instead of guessing", () => {
    const csv = "asset_name,power_kw,recorded_at\nDepot Rapid 1,35,2026-08-25T09:00:00Z";
    const r = parseReadingsCsv(csv, twoNamesake);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]).toMatch(/matches more than one asset/i);
  });

  it("rejects a CSV missing required columns", () => {
    const missingAll = parseReadingsCsv("foo,bar\nX,Y", oneAsset);
    expect(missingAll.errors[0]).toMatch(/Missing required column/);

    const missingMetric = parseReadingsCsv("asset_name,recorded_at\nDepot Rapid 1,2026-08-25T09:00:00Z", oneAsset);
    expect(missingMetric.errors[0]).toMatch(/power_kw or energy_kwh/i);
  });

  it("rejects empty or header-only input", () => {
    expect(parseReadingsCsv("", oneAsset).errors[0]).toMatch(/header row/);
    expect(parseReadingsCsv("asset_name,power_kw,recorded_at", oneAsset).errors[0]).toMatch(/header row/);
  });

  it("enforces the row cap", () => {
    const lines = ["asset_name,power_kw,recorded_at"];
    for (let i = 0; i < 5; i++) lines.push(`Depot Rapid 1,${i},2026-08-25T09:00:00Z`);
    const r = parseReadingsCsv(lines.join("\n"), oneAsset, 3);
    expect(r.rows).toHaveLength(3);
    expect(r.errors.some((e) => /Row limit/i.test(e))).toBe(true);
  });
});
