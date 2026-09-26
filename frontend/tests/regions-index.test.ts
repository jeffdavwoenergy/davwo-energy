import { describe, it, expect } from "vitest";
import { getRegionProviders } from "@/lib/data/regions";
import * as uk from "@/lib/data/regions/uk";
import * as us from "@/lib/data/regions/us";

describe("getRegionProviders", () => {
  it("resolves the uk provider set", () => {
    const providers = getRegionProviders("uk");
    expect(providers.fetchCarbonIntensity).toBe(uk.fetchCarbonIntensity);
    expect(providers.fetchCarbonForecast).toBe(uk.fetchCarbonForecast);
    expect(providers.fetchPricing).toBe(uk.fetchOctopusAgile);
    expect(providers.fetchPriceWindow).toBe(uk.fetchOctopusWindow);
    expect(providers.fetchWeather).toBe(uk.fetchWeather);
    expect(providers.fetchChargePoints).toBe(uk.fetchChargePoints);
    expect(providers.gridBaselineGco2).toBe(uk.GRID_BASELINE_GCO2);
  });

  it("resolves the us provider set to real EIA-backed connectors", () => {
    const providers = getRegionProviders("us");
    expect(providers.fetchCarbonIntensity).toBe(us.fetchCarbonIntensity);
    expect(providers.fetchCarbonForecast).toBe(us.fetchCarbonForecast);
    expect(providers.fetchPricing).toBe(us.fetchPricing);
    expect(providers.fetchPriceWindow).toBe(us.fetchPriceWindow);
    expect(providers.fetchWeather).toBe(us.fetchWeather);
    expect(providers.fetchChargePoints).toBe(us.fetchChargePoints);
    expect(providers.gridBaselineGco2).toBe(us.GRID_BASELINE_GCO2);
  });

  it("resolves eu to the uk data set (eu region module pending a follow-up pass)", () => {
    const providers = getRegionProviders("eu");
    expect(providers.fetchCarbonIntensity).toBe(uk.fetchCarbonIntensity);
    expect(providers.fetchPricing).toBe(uk.fetchOctopusAgile);
  });

  it("falls back to uk for an unrecognised market rather than throwing", () => {
    // @ts-expect-error deliberately passing an invalid market to prove the fallback
    const providers = getRegionProviders("not-a-real-market");
    expect(providers.fetchCarbonIntensity).toBe(uk.fetchCarbonIntensity);
    expect(providers.gridBaselineGco2).toBe(uk.GRID_BASELINE_GCO2);
  });
});
