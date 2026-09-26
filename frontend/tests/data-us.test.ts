import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCarbonForecast, fetchPriceWindow } from "@/lib/data/regions/us";

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const bad = () => ({ ok: false, json: async () => ({}) }) as Response;

function seq(...responses: Array<Response | Error>) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("fetchCarbonIntensity (US, EIA-derived)", () => {
  it("returns null without a key", async () => {
    const { fetchCarbonIntensity } = await import("@/lib/data/regions/us");
    expect(await fetchCarbonIntensity()).toBeNull();
  });

  it("derives a weighted intensity + generation mix from the latest hour's fuel-type rows", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchCarbonIntensity } = await import("@/lib/data/regions/us");
    seq(ok({
      response: {
        data: [
          { period: "2026-09-15T14", respondent: "US48", "type-name": "natural gas", value: "400" },
          { period: "2026-09-15T14", respondent: "US48", "type-name": "coal", value: "100" },
          { period: "2026-09-15T14", respondent: "US48", "type-name": "nuclear", value: "300" },
          { period: "2026-09-15T14", respondent: "US48", "type-name": "wind", value: "200" },
          // an older/partial hour that should be excluded from the weighting
          { period: "2026-09-15T13", respondent: "US48", "type-name": "solar", value: "9999" },
        ],
      },
    }));
    const c = await fetchCarbonIntensity();
    expect(c).not.toBeNull();
    // 40% gas(490) + 10% coal(820) + 30% nuclear(12) + 20% wind(11) = 283.8 -> 284
    expect(c!.intensity_gco2_kwh).toBe(284);
    expect(c!.index).toBe("moderate");
    expect(c!.generation_mix!.find((m) => m.name === "solar")).toBeUndefined();
    expect(c!.generation_mix!.find((m) => m.name === "natural gas")!.share).toBe(40);
  });

  it("falls back to the conservative 'other' factor for an unrecognised fuel name", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchCarbonIntensity } = await import("@/lib/data/regions/us");
    seq(ok({ response: { data: [{ period: "2026-09-15T14", respondent: "US48", "type-name": "mystery-fuel", value: "100" }] } } ));
    const c = await fetchCarbonIntensity();
    expect(c!.intensity_gco2_kwh).toBe(500);
  });

  it("accepts a numeric value field and skips a zero/negative-MW row", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchCarbonIntensity } = await import("@/lib/data/regions/us");
    seq(ok({
      response: {
        data: [
          { period: "2026-09-15T14", respondent: "US48", "type-name": "nuclear", value: 100 },
          { period: "2026-09-15T14", respondent: "US48", "type-name": "wind", value: "0" },
          { period: "2026-09-15T14", respondent: "US48", "type-name": "solar", value: "-5" },
        ],
      },
    }));
    const c = await fetchCarbonIntensity();
    expect(c!.generation_mix).toEqual([{ name: "nuclear", share: 100 }]);
    expect(c!.intensity_gco2_kwh).toBe(12);
  });

  // Blends nuclear (12 gCO2/kWh) with an unrecognised "other"-factor fuel
  // (500 gCO2/kWh) at different shares to land the weighted intensity in
  // each labelled bucket.
  it.each([
    [[1000, 0], "very low"],   // 100% nuclear -> 12
    [[700, 300], "low"],       // -> ~158
    [[500, 500], "moderate"],  // -> ~256
    [[200, 800], "high"],      // -> ~402
    [[0, 1000], "very high"],  // 100% other -> 500
  ] as const)("labels a %j MW nuclear/other mix as %s", async ([nuclear, other], expectedIndex) => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchCarbonIntensity } = await import("@/lib/data/regions/us");
    const rows = [
      ...(nuclear ? [{ period: "p", respondent: "US48", "type-name": "nuclear", value: String(nuclear) }] : []),
      ...(other ? [{ period: "p", respondent: "US48", "type-name": "mystery-fuel", value: String(other) }] : []),
    ];
    seq(ok({ response: { data: rows } }));
    const c = await fetchCarbonIntensity();
    expect(c!.index).toBe(expectedIndex);
  });

  it("null on empty rows, malformed values, or a failed request", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchCarbonIntensity } = await import("@/lib/data/regions/us");
    seq(ok({ response: { data: [] } }));
    expect(await fetchCarbonIntensity()).toBeNull();
    seq(ok({ response: { data: [{ period: "2026-09-15T14", respondent: "US48", "type-name": "coal", value: "not-a-number" }] } }));
    expect(await fetchCarbonIntensity()).toBeNull();
    seq(bad());
    expect(await fetchCarbonIntensity()).toBeNull();
    seq(new Error("network"));
    expect(await fetchCarbonIntensity()).toBeNull();
  });
});

describe("fetchPricing (US, EIA retail-sales)", () => {
  it("returns null without a key", async () => {
    const { fetchPricing } = await import("@/lib/data/regions/us");
    expect(await fetchPricing()).toBeNull();
  });

  it("converts cents/kWh to a currency-agnostic PricingData shape", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchPricing } = await import("@/lib/data/regions/us");
    seq(ok({ response: { data: [{ period: "2026-08", price: "16.23" }] } }));
    const p = await fetchPricing();
    expect(p).toEqual({
      price_per_kwh: 0.1623,
      currency_symbol: "$",
      minor_unit_value: 16.23,
      minor_unit_symbol: "¢",
      valid_from: "2026-08-01",
      product: "EIA retail (US/RES)",
    });
  });

  it("null on empty rows, a malformed price, or a failed request", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchPricing } = await import("@/lib/data/regions/us");
    seq(ok({ response: { data: [] } }));
    expect(await fetchPricing()).toBeNull();
    seq(ok({ response: { data: [{ period: "2026-08", price: "n/a" }] } }));
    expect(await fetchPricing()).toBeNull();
    seq(bad());
    expect(await fetchPricing()).toBeNull();
  });

  it("accepts a numeric price field and a missing period", async () => {
    vi.stubEnv("EIA_API_KEY", "testkey");
    vi.resetModules();
    const { fetchPricing } = await import("@/lib/data/regions/us");
    seq(ok({ response: { data: [{ period: "", price: 12.5 }] } }));
    const p = await fetchPricing();
    expect(p!.price_per_kwh).toBe(0.125);
    expect(p!.valid_from).toBeNull();
  });
});

describe("fetchCarbonForecast / fetchPriceWindow (US)", () => {
  it("are honestly null — EIA has no forward forecast or sub-hourly price series", async () => {
    expect(await fetchCarbonForecast()).toBeNull();
    expect(await fetchPriceWindow()).toBeNull();
  });
});

describe("fetchWeather / fetchChargePoints (US)", () => {
  it("delegate to the shared weather fetcher with Washington DC coordinates", async () => {
    const { fetchWeather } = await import("@/lib/data/regions/us");
    seq(ok({ hourly: { temperature_2m: [10, 12], shortwave_radiation: [100, 200] } }));
    const w = await fetchWeather();
    expect(w!.temp_min_c).toBe(10);
  });

  it("returns null without an OpenChargeMap key", async () => {
    const { fetchChargePoints } = await import("@/lib/data/regions/us");
    expect(await fetchChargePoints()).toBeNull();
  });
});
