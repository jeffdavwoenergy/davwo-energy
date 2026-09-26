// US real-data connectors: EIA (US Energy Information Administration) open
// data for generation mix + retail price, Open-Meteo (weather, shared),
// OpenChargeMap (charge points, shared, US-filtered). Each returns `null` on
// any failure so callers fall back to synthetic data — see
// src/lib/data/regions/index.ts for how a market selects this module.
//
// Unlike the UK's National Grid ESO (which publishes a ready-made carbon
// intensity figure), EIA only publishes generation by fuel type — carbon
// intensity here is *derived* from that mix using published lifecycle
// emission factors (see EMISSION_FACTORS_GCO2_PER_KWH below), not a metered
// number. That's a real methodological difference worth being visible about,
// not hidden behind an identical-looking number.
//
// EIA also has no national real-time dynamic tariff the way Octopus Agile is
// for the UK — US retail electricity is priced per-state/utility, not one
// national half-hourly rate. `fetchPricing()` uses EIA's monthly average
// retail price instead (a real, published number, just not sub-hourly), and
// `fetchCarbonForecast()`/`fetchPriceWindow()` are honestly `null`: EIA
// publishes historical/near-real-time data, not a forward forecast, and this
// app doesn't invent one.

import { REVALIDATE, EIA_API_KEY } from "../config";
import { fetchWeather as fetchWeatherAt, type WeatherData } from "../weather";
import { fetchChargePoints as fetchChargePointsIn } from "../chargePoints";
import type { CarbonData, CarbonSlot, PricingData, PriceSlot, MapPin } from "../types";

const UA = { "User-Agent": "davwo-ani/1.0 (+davwoenergy/davwo-mvp1)", Accept: "application/json" };
const EIA_BASE = "https://api.eia.gov/v2/";

async function getJSON<T>(url: string, revalidate = REVALIDATE): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// EIA's Lower-48 national aggregate — the closest analogue to the UK's single
// national grid-carbon figure, so this doesn't have to pick one RTO/ISO among
// many as "the" US grid. Override via env if a specific balancing authority
// (e.g. "PJM", "CISO", "ERCO") is ever preferred instead.
const EIA_RESPONDENT = process.env.EIA_RESPONDENT ?? "US48";

// EIA's retail-sales dataset facets — monthly average price, most recently
// published month. "US" is EIA's documented national-aggregate stateid;
// "RES" (residential) is the most consumer-representative sector. Override
// via env if a specific state/sector turns out to be a better fit once
// verified against a real key.
const EIA_RETAIL_STATE = process.env.EIA_RETAIL_STATE ?? "US";
const EIA_RETAIL_SECTOR = process.env.EIA_RETAIL_SECTOR ?? "RES";

const WEATHER_LAT = Number(process.env.US_WEATHER_LAT ?? "38.9072"); // Washington, DC
const WEATHER_LON = Number(process.env.US_WEATHER_LON ?? "-77.0369");

// US grid average carbon intensity baseline (gCO2/kWh) for "CO2 avoided"
// scaling — EIA/EPA eGRID puts the US national average around 370-390
// gCO2/kWh (vs. the UK's ~233); this baseline should be revisited once a
// direct eGRID figure is wired in rather than approximated here.
export const GRID_BASELINE_GCO2 = 380;

// Published lifecycle emission factors (gCO2eq/kWh), the same category of
// figure IPCC AR5/NREL cite for full lifecycle (not just combustion) impact
// per generation source. "other"/"unknown" fall back to a conservative
// mid-range estimate since their actual composition isn't reported.
const EMISSION_FACTORS_GCO2_PER_KWH: Record<string, number> = {
  coal: 820,
  "natural gas": 490,
  petroleum: 650,
  oil: 650,
  nuclear: 12,
  hydro: 24,
  wind: 11,
  solar: 41,
  biomass: 230,
  geothermal: 38,
  "battery storage": 0, // storage, not generation — charged from the mix above
  other: 500,
  unknown: 500,
};

function emissionFactorFor(fuelName: string): number {
  const key = fuelName.toLowerCase().trim();
  return EMISSION_FACTORS_GCO2_PER_KWH[key] ?? EMISSION_FACTORS_GCO2_PER_KWH.other;
}

function carbonIndexFor(intensity: number): string {
  if (intensity < 150) return "very low";
  if (intensity < 250) return "low";
  if (intensity < 350) return "moderate";
  if (intensity < 450) return "high";
  return "very high";
}

interface EiaFuelTypeRow {
  period: string;
  respondent: string;
  "type-name": string;
  value: string | number;
}

export async function fetchCarbonIntensity(): Promise<CarbonData | null> {
  if (!EIA_API_KEY) return null;
  const url =
    `${EIA_BASE}electricity/rto/fuel-type-data/data/?api_key=${EIA_API_KEY}` +
    `&frequency=hourly&data[]=value&facets[respondent][]=${EIA_RESPONDENT}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=40`;
  const data = await getJSON<{ response: { data: EiaFuelTypeRow[] } }>(url);
  const rows = data?.response?.data;
  if (!rows?.length) return null;

  // Rows span multiple fuel types per hour; take only the most recent period
  // actually present (the latest hour may not have every fuel type reported
  // yet, so don't assume the very first row's period covers the whole set).
  const latestPeriod = rows.reduce((max, r) => (r.period > max ? r.period : max), rows[0].period);
  const latest = rows.filter((r) => r.period === latestPeriod);
  if (!latest.length) return null;

  const byFuel = new Map<string, number>();
  for (const r of latest) {
    const mw = typeof r.value === "string" ? parseFloat(r.value) : r.value;
    if (!Number.isFinite(mw) || mw <= 0) continue;
    const name = r["type-name"];
    byFuel.set(name, (byFuel.get(name) ?? 0) + mw);
  }
  const total = [...byFuel.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  const generation_mix = [...byFuel.entries()].map(([name, mw]) => ({ name, share: +((mw / total) * 100).toFixed(1) }));
  const intensity_gco2_kwh = Math.round(
    generation_mix.reduce((s, m) => s + (m.share / 100) * emissionFactorFor(m.name), 0),
  );

  return { intensity_gco2_kwh, index: carbonIndexFor(intensity_gco2_kwh), generation_mix };
}

/** EIA publishes historical/near-real-time generation, not a forward
 * forecast — honestly null rather than inventing one. */
export async function fetchCarbonForecast(): Promise<CarbonSlot[] | null> {
  return null;
}

interface EiaRetailRow {
  period: string;
  price: string | number;
}

export async function fetchPricing(): Promise<PricingData | null> {
  if (!EIA_API_KEY) return null;
  const url =
    `${EIA_BASE}electricity/retail-sales/data/?api_key=${EIA_API_KEY}` +
    `&frequency=monthly&data[]=price&facets[stateid][]=${EIA_RETAIL_STATE}&facets[sectorid][]=${EIA_RETAIL_SECTOR}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const data = await getJSON<{ response: { data: EiaRetailRow[] } }>(url);
  const row = data?.response?.data?.[0];
  if (!row) return null;
  const cents = typeof row.price === "string" ? parseFloat(row.price) : row.price;
  if (!Number.isFinite(cents)) return null;

  return {
    price_per_kwh: +(cents / 100).toFixed(4),
    currency_symbol: "$",
    minor_unit_value: cents,
    minor_unit_symbol: "¢",
    valid_from: row.period ? `${row.period}-01` : null,
    product: `EIA retail (${EIA_RETAIL_STATE}/${EIA_RETAIL_SECTOR})`,
  };
}

/** No sub-hourly forward US price series is published the way Octopus
 * Agile's half-hourly window is for the UK — honestly null. */
export async function fetchPriceWindow(): Promise<PriceSlot[] | null> {
  return null;
}

export async function fetchWeather(): Promise<WeatherData | null> {
  return fetchWeatherAt(WEATHER_LAT, WEATHER_LON, "America/New_York");
}

export async function fetchChargePoints(): Promise<MapPin[] | null> {
  return fetchChargePointsIn("US");
}
