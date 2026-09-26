import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchCarbonIntensity, fetchCarbonForecast, fetchOctopusAgile,
  fetchOctopusWindow, fetchWeather, fetchChargePoints,
} from "@/lib/data/regions/uk";

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

describe("fetchCarbonIntensity", () => {
  it("returns intensity + mix (actual)", async () => {
    seq(
      ok({ data: [{ intensity: { actual: 200, forecast: 180, index: "high" } }] }),
      ok({ data: { generationmix: [{ fuel: "gas", perc: 42 }] } }),
    );
    const c = await fetchCarbonIntensity();
    expect(c!.intensity_gco2_kwh).toBe(200);
    expect(c!.generation_mix![0].name).toBe("gas");
  });
  it("falls back to forecast and tolerates missing mix", async () => {
    seq(ok({ data: [{ intensity: { actual: null, forecast: 150, index: "moderate" } }] }), bad());
    const c = await fetchCarbonIntensity();
    expect(c!.intensity_gco2_kwh).toBe(150);
    expect(c!.generation_mix).toBeNull();
  });
  it("returns null when no data / both null / fetch fails", async () => {
    seq(ok({ data: [] }));
    expect(await fetchCarbonIntensity()).toBeNull();
    seq(ok({ data: [{ intensity: { actual: null, forecast: null, index: "x" } }] }), bad());
    expect(await fetchCarbonIntensity()).toBeNull();
    seq(bad());
    expect(await fetchCarbonIntensity()).toBeNull();
    seq(new Error("network"));
    expect(await fetchCarbonIntensity()).toBeNull();
  });
});

describe("fetchCarbonForecast", () => {
  it("maps + filters null slots", async () => {
    seq(ok({ data: [
      { from: "2026-06-27T00:00Z", intensity: { actual: 100, forecast: 90 } },
      { from: "2026-06-27T00:30Z", intensity: { actual: null, forecast: null } },
    ] }));
    const f = await fetchCarbonForecast();
    expect(f!.length).toBe(1);
    expect(f![0].gco2).toBe(100);
  });
  it("null on empty / failure", async () => {
    seq(ok({ data: [] }));
    expect(await fetchCarbonForecast()).toBeNull();
    seq(bad());
    expect(await fetchCarbonForecast()).toBeNull();
  });
});

describe("octopus", () => {
  it("agile rate + window", async () => {
    seq(ok({ results: [{ value_inc_vat: 21, valid_from: "2026-06-27T13:00:00Z" }] }));
    expect((await fetchOctopusAgile())!.price_per_kwh).toBe(0.21);
    seq(ok({ results: [
      { value_inc_vat: 20, valid_from: "2026-06-27T13:30:00Z" },
      { value_inc_vat: 18, valid_from: "2026-06-27T13:00:00Z" },
    ] }));
    const w = await fetchOctopusWindow();
    expect(w![0].valid_from < w![1].valid_from).toBe(true);
  });
  it("null on empty", async () => {
    seq(ok({ results: [] }));
    expect(await fetchOctopusAgile()).toBeNull();
    seq(ok({ results: [] }));
    expect(await fetchOctopusWindow()).toBeNull();
  });
});

describe("fetchWeather", () => {
  it("cold + solar drivers", async () => {
    seq(ok({ hourly: { temperature_2m: [5, 6, 4], shortwave_radiation: [0, 400, 100] } }));
    const w = await fetchWeather();
    expect(w!.drivers.join(" ")).toMatch(/cool/);
    expect(w!.drivers.join(" ")).toMatch(/solar/);
  });
  it("warm + mild branches, and null on empty", async () => {
    seq(ok({ hourly: { temperature_2m: [25, 26], shortwave_radiation: [10] } }));
    expect((await fetchWeather())!.drivers.join(" ")).toMatch(/Warm/);
    seq(ok({ hourly: { temperature_2m: [15, 16], shortwave_radiation: [] } }));
    expect((await fetchWeather())!.peak_solar_wm2).toBe(0);
    seq(ok({ hourly: { temperature_2m: [], shortwave_radiation: [] } }));
    expect(await fetchWeather()).toBeNull();
  });
});

describe("fetchChargePoints", () => {
  it("returns null without a key", async () => {
    expect(await fetchChargePoints()).toBeNull();
  });
  it("maps real POIs when a key is configured", async () => {
    vi.stubEnv("OCM_API_KEY", "testkey");
    vi.resetModules();
    const mod = await import("@/lib/data/regions/uk");
    seq(ok([
      { AddressInfo: { Title: "A", Latitude: 51, Longitude: -1 }, StatusType: { IsOperational: true }, NumberOfPoints: 3 },
      { AddressInfo: { Latitude: 52, Longitude: -2 }, StatusType: { IsOperational: false } },
      { AddressInfo: { Town: "T", Latitude: 53, Longitude: -3 }, StatusType: {} },
      { AddressInfo: null },
    ]));
    const pins = await mod.fetchChargePoints();
    expect(pins!.length).toBe(3);
    expect(pins!.find((p) => p.status === "warning")).toBeTruthy();
  });
  it("null on empty + failure when key set", async () => {
    vi.stubEnv("OCM_API_KEY", "testkey");
    vi.resetModules();
    const mod = await import("@/lib/data/regions/uk");
    seq(ok([]));
    expect(await mod.fetchChargePoints()).toBeNull();
    seq(bad());
    expect(await mod.fetchChargePoints()).toBeNull();
  });
});
