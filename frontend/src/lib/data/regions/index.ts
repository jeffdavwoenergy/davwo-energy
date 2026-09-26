// Registry mapping an org's market to its real-data provider set. Every
// region module exports functions matching the shared shapes in
// src/lib/data/types.ts, so providers.ts and every UI consumer work
// unchanged regardless of which market an org is in. Property names here are
// brand-neutral (fetchPricing, not fetchOctopusAgile) even though uk.ts's own
// exports keep their historical names for its other, already-wired callers.

import type { Market } from "@/lib/types";
import type { CarbonData, CarbonSlot, PricingData, PriceSlot, MapPin } from "../types";
import type { WeatherData } from "../weather";
import * as uk from "./uk";
import * as us from "./us";

export interface RegionProviders {
  fetchCarbonIntensity: () => Promise<CarbonData | null>;
  fetchCarbonForecast: () => Promise<CarbonSlot[] | null>;
  fetchPricing: () => Promise<PricingData | null>;
  fetchPriceWindow: () => Promise<PriceSlot[] | null>;
  fetchWeather: () => Promise<WeatherData | null>;
  fetchChargePoints: () => Promise<MapPin[] | null>;
  gridBaselineGco2: number;
  // Data-provenance identifiers surfaced in `data_sources`/`source` fields —
  // kept per-region so a US/EU org's badges never claim a UK product name
  // (e.g. "octopus_agile") for data that actually came from EIA/ENTSO-E.
  pricingSourceId: string;
  carbonSourceId: string;
  priceWindowSourceLabel: string;
}

const REGIONS: Record<Market, RegionProviders> = {
  uk: {
    fetchCarbonIntensity: uk.fetchCarbonIntensity,
    fetchCarbonForecast: uk.fetchCarbonForecast,
    fetchPricing: uk.fetchOctopusAgile,
    fetchPriceWindow: uk.fetchOctopusWindow,
    fetchWeather: uk.fetchWeather,
    fetchChargePoints: uk.fetchChargePoints,
    gridBaselineGco2: uk.GRID_BASELINE_GCO2,
    pricingSourceId: "octopus_agile",
    carbonSourceId: "carbon_intensity",
    priceWindowSourceLabel: "octopus.energy (Agile)",
  },
  us: {
    fetchCarbonIntensity: us.fetchCarbonIntensity,
    fetchCarbonForecast: us.fetchCarbonForecast,
    fetchPricing: us.fetchPricing,
    fetchPriceWindow: us.fetchPriceWindow,
    fetchWeather: us.fetchWeather,
    fetchChargePoints: us.fetchChargePoints,
    gridBaselineGco2: us.GRID_BASELINE_GCO2,
    pricingSourceId: "eia_retail_price",
    carbonSourceId: "eia_fuel_mix",
    priceWindowSourceLabel: "eia.gov",
  },
  // eu provider lands in a follow-up pass (src/lib/data/regions/eu.ts, gated
  // on the ENTSO-E token) — until then eu falls back to the UK data set
  // rather than throwing or silently going synthetic-only for a market an
  // org has genuinely selected.
  eu: {
    fetchCarbonIntensity: uk.fetchCarbonIntensity,
    fetchCarbonForecast: uk.fetchCarbonForecast,
    fetchPricing: uk.fetchOctopusAgile,
    fetchPriceWindow: uk.fetchOctopusWindow,
    fetchWeather: uk.fetchWeather,
    fetchChargePoints: uk.fetchChargePoints,
    gridBaselineGco2: uk.GRID_BASELINE_GCO2,
    pricingSourceId: "octopus_agile",
    carbonSourceId: "carbon_intensity",
    priceWindowSourceLabel: "octopus.energy (Agile)",
  },
};

export function getRegionProviders(market: Market): RegionProviders {
  return REGIONS[market] ?? REGIONS.uk;
}
