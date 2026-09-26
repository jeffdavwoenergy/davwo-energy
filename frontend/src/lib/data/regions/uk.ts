// UK real-data connectors: National Grid ESO (carbon intensity, no key),
// Octopus Energy Agile tariff (no key), Open-Meteo (weather, shared with
// every other region), OpenChargeMap (charge points, shared, GB-filtered).
// Each returns `null` on any failure so callers fall back to synthetic data
// — see src/lib/data/regions/index.ts for how a market selects this module.

import { REVALIDATE } from "../config";
import { fetchWeather as fetchWeatherAt, type WeatherData } from "../weather";
import { fetchChargePoints as fetchChargePointsIn } from "../chargePoints";
import type { CarbonData, CarbonSlot, PricingData, PriceSlot, MapPin } from "../types";

const UA = { "User-Agent": "davwo-ani/1.0 (+davwoenergy/davwo-mvp1)", Accept: "application/json" };

async function getJSON<T>(url: string, revalidate = REVALIDATE): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Octopus Agile tariff (codes change over time; override via env). _C = London.
const OCTOPUS_PRODUCT = process.env.OCTOPUS_PRODUCT ?? "AGILE-24-10-01";
const OCTOPUS_TARIFF = process.env.OCTOPUS_TARIFF ?? `E-1R-${OCTOPUS_PRODUCT}-C`;

const WEATHER_LAT = Number(process.env.WEATHER_LAT ?? "51.5072");
const WEATHER_LON = Number(process.env.WEATHER_LON ?? "-0.1276");

// UK grid average carbon intensity baseline (gCO2/kWh) for "CO2 avoided" scaling.
export const GRID_BASELINE_GCO2 = 233;

export type { CarbonData, PricingData, CarbonSlot, PriceSlot, WeatherData, MapPin };

export async function fetchCarbonIntensity(): Promise<CarbonData | null> {
  const intensity = await getJSON<{ data: { intensity: { actual: number | null; forecast: number | null; index: string } }[] }>(
    "https://api.carbonintensity.org.uk/intensity",
  );
  if (!intensity?.data?.[0]) return null;
  const block = intensity.data[0].intensity;
  const value = block.actual ?? block.forecast;
  if (value == null) return null;

  const gen = await getJSON<{ data: { generationmix: { fuel: string; perc: number }[] } }>(
    "https://api.carbonintensity.org.uk/generation",
  );
  const generation_mix = gen?.data?.generationmix?.map((m) => ({ name: m.fuel, share: m.perc })) ?? null;

  return { intensity_gco2_kwh: value, index: block.index ?? null, generation_mix };
}

export async function fetchOctopusAgile(): Promise<PricingData | null> {
  const url = `https://api.octopus.energy/v1/products/${OCTOPUS_PRODUCT}/electricity-tariffs/${OCTOPUS_TARIFF}/standard-unit-rates/?page_size=1`;
  const data = await getJSON<{ results: { value_inc_vat: number; valid_from: string }[] }>(url);
  const row = data?.results?.[0];
  if (!row) return null;
  return {
    price_per_kwh: +(row.value_inc_vat / 100).toFixed(4),
    currency_symbol: "£",
    minor_unit_value: row.value_inc_vat,
    minor_unit_symbol: "p",
    valid_from: row.valid_from ?? null,
    product: OCTOPUS_PRODUCT,
  };
}

/** Next-24h half-hourly national carbon-intensity forecast. */
export async function fetchCarbonForecast(): Promise<CarbonSlot[] | null> {
  const url = `https://api.carbonintensity.org.uk/intensity/${new Date().toISOString()}/fw24h`;
  const data = await getJSON<{ data: { from: string; intensity: { forecast: number | null; actual: number | null } }[] }>(url, 1800);
  const rows = data?.data;
  if (!rows?.length) return null;
  const slots = rows
    .map((r) => ({ from: r.from, gco2: r.intensity.actual ?? r.intensity.forecast }))
    .filter((s): s is CarbonSlot => s.gco2 != null);
  return slots.length ? slots : null;
}

/** Upcoming half-hourly Agile rates (~24h) for the price curve + optimisation. */
export async function fetchOctopusWindow(): Promise<PriceSlot[] | null> {
  const url = `https://api.octopus.energy/v1/products/${OCTOPUS_PRODUCT}/electricity-tariffs/${OCTOPUS_TARIFF}/standard-unit-rates/?page_size=48`;
  const data = await getJSON<{ results: { value_inc_vat: number; valid_from: string }[] }>(url);
  if (!data?.results?.length) return null;
  return data.results
    .map((r) => ({ valid_from: r.valid_from, pence: r.value_inc_vat }))
    .sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1));
}

export async function fetchWeather(): Promise<WeatherData | null> {
  return fetchWeatherAt(WEATHER_LAT, WEATHER_LON, "Europe/London");
}

export async function fetchChargePoints(): Promise<MapPin[] | null> {
  return fetchChargePointsIn("GB");
}
