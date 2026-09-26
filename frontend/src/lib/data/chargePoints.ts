// OpenChargeMap is a single global charge-point database (like Open-Meteo for
// weather) — every region module calls this shared fetcher with its own ISO
// country code instead of reimplementing the same request.

import { OCM_API_KEY, REVALIDATE } from "./config";
import type { MapPin } from "./types";

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

export async function fetchChargePoints(countryCode: string): Promise<MapPin[] | null> {
  if (!OCM_API_KEY) return null;
  const url =
    `https://api.openchargemap.io/v3/poi/?countrycode=${encodeURIComponent(countryCode)}` +
    `&maxresults=40&compact=true&verbose=false&key=${OCM_API_KEY}`;
  type Poi = {
    AddressInfo?: { Title?: string; Town?: string; Latitude?: number; Longitude?: number };
    StatusType?: { IsOperational?: boolean | null };
    NumberOfPoints?: number;
  };
  const pois = await getJSON<Poi[]>(url);
  if (!pois) return null;
  const pins: MapPin[] = [];
  for (const poi of pois) {
    const info = poi.AddressInfo;
    if (!info || info.Latitude == null || info.Longitude == null) continue;
    const op = poi.StatusType?.IsOperational;
    pins.push({
      site: info.Title || info.Town || "Charge point",
      lat: info.Latitude,
      lng: info.Longitude,
      status: op || op == null ? "operational" : "warning",
      active_sessions: poi.NumberOfPoints || 1,
    });
  }
  return pins.length ? pins : null;
}
