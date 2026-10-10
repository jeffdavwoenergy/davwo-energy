// Open-Meteo is a free, global weather API (no key) — the only one of this
// app's four external data sources that was never actually UK-specific, just
// hardcoded per-call to London's coordinates. Every region module calls this
// shared fetcher with its own flagship-city coordinates/timezone instead of
// each reimplementing the same request.

import { REVALIDATE } from "./config";

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

export interface WeatherData {
  temp_min_c: number;
  temp_max_c: number;
  peak_solar_wm2: number;
  drivers: string[];
}

export async function fetchWeather(lat: number, lon: number, timezone: string): Promise<WeatherData | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,shortwave_radiation&forecast_days=1&timezone=${encodeURIComponent(timezone)}`;
  const data = await getJSON<{ hourly: { temperature_2m: number[]; shortwave_radiation: number[] } }>(url, 1800);
  const temps = (data?.hourly?.temperature_2m ?? []).filter((t) => t != null);
  const rad = (data?.hourly?.shortwave_radiation ?? []).filter((s) => s != null);
  if (!temps.length) return null;

  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const peakSolar = rad.length ? Math.max(...rad) : 0;

  const drivers: string[] = [];
  if (tMin < 8) drivers.push("Forecast cool ambient temperatures raising charging load");
  else if (tMax > 22) drivers.push("Warm conditions increasing cooling-related demand");
  else drivers.push("Mild temperatures; demand driven by typical usage");
  if (peakSolar > 300) drivers.push(`Strong midday solar (~${Math.round(peakSolar)} W/m²) offsetting grid draw`);
  drivers.push("Workday demand profile with an evening EV-charging peak");

  return {
    temp_min_c: +tMin.toFixed(1),
    temp_max_c: +tMax.toFixed(1),
    peak_solar_wm2: +peakSolar.toFixed(1),
    drivers,
  };
}

export interface DailyWeather {
  date: string; // YYYY-MM-DD
  temp_min_c: number;
  temp_max_c: number;
  /** Total sunshine energy on a flat surface, kWh/m² (≈ "peak sun hours"). */
  sun_kwh_m2: number;
  cloud_pct: number;
}

/** Multi-day forecast (Open-Meteo daily) — drives the solar generation and
 * fleet cold-weather range forecasts. null when unavailable. */
export async function fetchDailyWeather(lat: number, lon: number, timezone: string, days = 7): Promise<DailyWeather[] | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_min,temperature_2m_max,shortwave_radiation_sum,cloud_cover_mean` +
    `&forecast_days=${days}&timezone=${encodeURIComponent(timezone)}`;
  const data = await getJSON<{
    daily: { time: string[]; temperature_2m_min: number[]; temperature_2m_max: number[]; shortwave_radiation_sum: number[]; cloud_cover_mean: number[] };
  }>(url, 1800);
  const d = data?.daily;
  if (!d?.time?.length) return null;
  return d.time.map((date, i) => ({
    date,
    temp_min_c: +(d.temperature_2m_min[i] ?? 0).toFixed(1),
    temp_max_c: +(d.temperature_2m_max[i] ?? 0).toFixed(1),
    // Open-Meteo gives MJ/m²; 3.6 MJ = 1 kWh.
    sun_kwh_m2: +((d.shortwave_radiation_sum[i] ?? 0) / 3.6).toFixed(2),
    cloud_pct: Math.round(d.cloud_cover_mean[i] ?? 0),
  }));
}
