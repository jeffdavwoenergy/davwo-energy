// Victron VRM API connector — Davwo's first live device integration.
// Docs: https://vrm-api-docs.victronenergy.com/
//
// Auth: a VRM personal access token (X-Authorization: Token <t>), or VRM's
// public demo account (GET /auth/loginAsDemo → short-lived bearer JWT), whose
// installations are real Victron systems streaming live data.
//
// One VRM installation (a GX gateway) becomes up to N+2 Davwo assets: one EV
// Charger per EV Charging Station on it, plus one Battery and one Solar asset
// for the site when it reports them. Every value is read from VRM — nothing
// here is simulated; anything VRM doesn't report is left out, not invented.

import type { AssetType } from "@/lib/assetSpecs";
import type { AssetStatus, AssetSpecs } from "@/lib/server/assetsStore";

const VRM_API = "https://vrmapi.victronenergy.com/v2";
const TIMEOUT_MS = 15_000;
const HOUR = 3_600_000;
export const HISTORY_DAYS = 30;

export type VrmCredentials = { mode: "demo" } | { mode: "token"; token: string };

export class VrmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "VrmError";
  }
}

/** One hourly bucket of real history. powerKw is the hour's mean power. */
export interface HourlyPoint {
  ts: number;
  powerKw: number;
  energyKwh: number;
  /** EV charger status code for the hour (rounded mean), EVs only. */
  statusCode?: number;
  /** Battery state of charge, batteries only. */
  socPct?: number;
}

export interface DiscoveredDevice {
  externalId: string;
  type: AssetType;
  name: string;
  site: string;
  capacityKw: number;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  location: { lat: number; lng: number } | null;
  status: AssetStatus;
  currentLoadKw: number;
  utilisationPct: number;
  specs: AssetSpecs;
  telemetry: Record<string, string | number | boolean | null>;
  lastSeenAt: string | null;
  history: HourlyPoint[];
}

// ------------------------------------------------------------------ HTTP ----

let demoToken: { token: string; exp: number } | null = null;

async function vrmFetch(path: string, auth: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${VRM_API}${path}`, {
      headers: { "X-Authorization": auth, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new VrmError(`VRM unreachable: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body || body.success === false) {
    const msg = typeof body?.errors === "string" ? body.errors : `HTTP ${res.status}`;
    throw new VrmError(`VRM ${path.split("?")[0]}: ${msg}`, res.status);
  }
  return body;
}

/** Resolves the X-Authorization header value for a set of credentials. */
export async function vrmAuthHeader(creds: VrmCredentials): Promise<string> {
  if (creds.mode === "token") return `Token ${creds.token}`;
  if (demoToken && demoToken.exp > Date.now() + 10 * 60_000) return `Bearer ${demoToken.token}`;
  const res = await fetch(`${VRM_API}/auth/loginAsDemo`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { token?: string } | null;
  if (!res.ok || !body?.token) throw new VrmError("VRM demo login failed", res.status);
  // VRM demo tokens last 24h; refresh well before that.
  demoToken = { token: body.token, exp: Date.now() + 12 * HOUR };
  return `Bearer ${body.token}`;
}

export async function vrmUser(auth: string): Promise<{ id: number; name: string }> {
  const body = await vrmFetch("/users/me", auth);
  const user = body.user as { id: number; name: string };
  return { id: user.id, name: user.name };
}

interface ExtendedAttr { code: string; rawValue: unknown; formattedValue?: string }
interface Installation { idSite: number; name: string; extended?: ExtendedAttr[] }
type SeriesPoint = [number, number, ...number[]];

// ------------------------------------------------------------- Mapping ----

/** Victron EV Charging Station status codes (com.victronenergy.evcharger /Status). */
export const EVCS_STATUS: Record<number, string> = {
  0: "Disconnected", 1: "Connected", 2: "Charging", 3: "Charged", 4: "Waiting for sun",
  5: "Waiting for RFID", 6: "Waiting for start", 7: "Low SOC", 8: "Ground test error",
  9: "Welded contacts error", 10: "CP input test error", 11: "Residual current detected",
  12: "Undervoltage detected", 13: "Overvoltage detected", 14: "Overheating detected",
  20: "Charging limit", 21: "Start charging", 22: "Switching to 3-phase", 23: "Switching to 1-phase",
};
export const isEvcsFault = (code: number) => code >= 8 && code <= 19;

/** VRM's widget reports status as display text ("EV Disconnected", "CP input
 * test error (shorted)") — map it back to the code by the longest known
 * label it contains, so "Charging limit" never reads as "Charging". */
export function evcsStatusCode(text: string | null): number | null {
  if (!text) return null;
  let best: [number, number] | null = null;
  for (const [code, label] of Object.entries(EVCS_STATUS)) {
    if (text.toLowerCase().includes(label.toLowerCase()) && (!best || label.length > best[1])) best = [Number(code), label.length];
  }
  return best ? best[0] : null;
}

/** Victron's EV Charging Station is a 22 kW (3-phase, 32 A) unit. */
const EVCS_RATED_KW = 22;

/** Continuous power rating from a Victron inverter/charger product name —
 * "MultiPlus-II 48/3000/35-32" → 3, "Multi RS Smart 48V/6000VA/100A" → 6. */
export function inverterKw(productName: string): number | null {
  const m = productName.match(/\d{2}V?\/(\d{3,5})(?:VA)?\b/);
  return m ? Number(m[1]) / 1000 : null;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const attr = (inst: Installation, code: string) => inst.extended?.find((e) => e.code === code);

/** Sum several hourly kWh series bucket-by-bucket. */
function sumSeries(records: Record<string, unknown>, keys: string[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const k of keys) {
    const s = records[k];
    if (!Array.isArray(s)) continue;
    for (const p of s as SeriesPoint[]) out.set(p[0], (out.get(p[0]) ?? 0) + (Number(p[1]) || 0));
  }
  return out;
}

const completeHoursOnly = (ts: number, now: number) => ts + HOUR <= now;

// ----------------------------------------------------------- Discovery ----

export interface DiscoverOptions {
  /** Restrict to these VRM site ids (the demo connection curates its sites). */
  siteIds?: number[];
  now?: number;
}

/** Every device Davwo can monitor across the account's installations, with
 * live status and HISTORY_DAYS of hourly history. */
export async function discoverVrm(creds: VrmCredentials, opts: DiscoverOptions = {}): Promise<DiscoveredDevice[]> {
  const auth = await vrmAuthHeader(creds);
  const user = await vrmUser(auth);
  const list = await vrmFetch(`/users/${user.id}/installations?extended=1`, auth);
  const installs = (list.records as Installation[]).filter((i) => !opts.siteIds || opts.siteIds.includes(i.idSite));
  const now = opts.now ?? Date.now();
  const results = await Promise.all(installs.map((inst) => discoverSite(auth, inst, now)));
  return results.flat();
}

async function discoverSite(auth: string, inst: Installation, now: number): Promise<DiscoveredDevice[]> {
  const site = inst.name;
  const id = inst.idSite;
  const lat = num(attr(inst, "lt")?.rawValue);
  const lng = num(attr(inst, "lg")?.rawValue);
  const location = lat != null && lng != null ? { lat, lng } : null;
  const end = Math.floor(now / 1000);
  const start = Math.floor((now - HISTORY_DAYS * 24 * HOUR) / HOUR) * 3600;

  const [overview, kwh, soc] = await Promise.all([
    vrmFetch(`/installations/${id}/system-overview`, auth).catch(() => null),
    vrmFetch(`/installations/${id}/stats?type=kwh&interval=hours&start=${start}&end=${end}`, auth).catch(() => null),
    vrmFetch(`/installations/${id}/stats?type=custom&attributeCodes[]=bs&interval=hours&start=${start}&end=${end}`, auth).catch(() => null),
  ]);
  const devices = ((overview?.records as { devices?: { name: string; productName: string; instance?: number }[] })?.devices) ?? [];
  const out: DiscoveredDevice[] = [];
  const consumptionKw = num(attr(inst, "consumption")?.rawValue);
  const gridKw = num(attr(inst, "from_to_grid")?.rawValue);
  const siteTelemetry = {
    siteConsumptionKw: consumptionKw != null ? r2(consumptionKw / 1000) : null,
    siteGridKw: gridKw != null ? r2(gridKw / 1000) : null,
    systemType: (attr(inst, "st")?.rawValue as string) ?? null,
    vrmSiteId: id,
  };

  // --- EV Charging Stations -------------------------------------------------
  const evcs = devices.filter((d) => d.name === "EV Charging Station" && d.instance != null);
  if (evcs.length) {
    const hist = await vrmFetch(
      `/installations/${id}/stats?type=custom&attributeCodes[]=evp&attributeCodes[]=evs&interval=hours&start=${start}&end=${end}&show_instance=true`,
      auth,
    ).catch(() => null);
    const byInstance = new Map<number, { evp?: SeriesPoint[]; evs?: SeriesPoint[] }>();
    for (const rec of (hist?.records as { instance: number; stats: Record<string, SeriesPoint[]> }[] | undefined) ?? []) {
      byInstance.set(Number(rec.instance), rec.stats);
    }
    const summaries = await Promise.all(
      evcs.map((d) => vrmFetch(`/installations/${id}/widgets/EvChargerSummary?instance=${d.instance}`, auth).catch(() => null)),
    );
    evcs.forEach((d, i) => {
      const inst = d.instance as number;
      const data = ((summaries[i]?.records as { data?: Record<string, { code?: string; rawValue?: unknown; formattedValue?: string }> })?.data) ?? {};
      const byCode = Object.fromEntries(Object.values(data).filter((v) => v && v.code).map((v) => [v.code as string, v]));
      const statusText = (byCode.evs?.formattedValue ?? byCode.evs?.rawValue ?? null) as string | null;
      const code = evcsStatusCode(statusText);
      const currentA = num(byCode.evi?.rawValue) ?? 0;
      const maxA = num(byCode.evmi?.rawValue);
      const stats = byInstance.get(inst) ?? {};
      const evsByTs = new Map((stats.evs ?? []).map((p) => [p[0], Math.round(Number(p[1]))]));
      const history: HourlyPoint[] = (stats.evp ?? [])
        .filter((p) => completeHoursOnly(p[0], now))
        .map((p) => {
          const kw = Math.max(0, Number(p[1]) || 0) / 1000;
          return { ts: p[0], powerKw: r2(kw), energyKwh: r2(kw), statusCode: evsByTs.get(p[0]) };
        });
      // Load is the latest complete hour's measured mean — VRM's own logged
      // power, never estimated from the instantaneous current. The widget's
      // "secondsAgo" is NOT a per-charger freshness signal (it's identical
      // across chargers whose power still changes hourly), so it's
      // deliberately not used to infer "offline".
      const loadKw = history.at(-1)?.powerKw ?? 0;
      const status: AssetStatus = code != null && isEvcsFault(code) ? "down" : "healthy";
      out.push({
        externalId: `${id}:evcs:${inst}`,
        type: "EV Charger",
        name: `${site} · EV Charger #${inst}`,
        site,
        capacityKw: EVCS_RATED_KW,
        manufacturer: "Victron Energy",
        model: d.productName,
        location,
        status,
        currentLoadKw: r2(Math.min(loadKw, EVCS_RATED_KW)),
        utilisationPct: Math.round((Math.min(loadKw, EVCS_RATED_KW) / EVCS_RATED_KW) * 100),
        specs: { ports: 1, connectors: "Type 2" },
        telemetry: {
          ...siteTelemetry,
          vrmInstance: inst,
          statusCode: code,
          statusText,
          currentA,
          maxCurrentA: maxA,
          mode: (byCode.evm?.formattedValue as string) ?? null,
          chargingTimeS: num(byCode.evt?.rawValue),
        },
        lastSeenAt: history.length ? new Date(history.at(-1)!.ts + HOUR).toISOString() : null,
        history,
      });
    });
  }

  // --- Battery -------------------------------------------------------------
  const socNow = num(attr(inst, "bs")?.rawValue);
  if (socNow != null) {
    const kr = (kwh?.records as Record<string, unknown>) ?? {};
    const charge = sumSeries(kr, ["Pb", "Gb"]);
    const discharge = sumSeries(kr, ["Bc", "Bg"]);
    const socSeries = new Map(((soc?.records as Record<string, SeriesPoint[]>)?.bs ?? []).map((p) => [p[0], Number(p[1])]));
    const hours = [...new Set([...charge.keys(), ...discharge.keys(), ...socSeries.keys()])].filter((t) => completeHoursOnly(t, now)).sort((a, b) => a - b);
    const history: HourlyPoint[] = hours.map((ts) => {
      const net = (charge.get(ts) ?? 0) - (discharge.get(ts) ?? 0);
      return { ts, powerKw: r2(net), energyKwh: r2(Math.abs(net)), socPct: socSeries.has(ts) ? r1(socSeries.get(ts)!) : undefined };
    });
    const voltage = num(attr(inst, "bv")?.rawValue);
    const current = num(attr(inst, "bc")?.rawValue);
    const powerKw = voltage != null && current != null ? r2((voltage * current) / 1000) : 0;
    const inverter = devices.find((d) => /VE\.Bus|Inverter\/Charger/.test(d.name));
    const monitor = devices.find((d) => d.name === "Battery Monitor");
    const ratingKw = (inverter && inverterKw(inverter.productName)) || null;
    // Throughput over the history window ≈ equivalent full cycles needs the
    // pack's kWh, which VRM doesn't expose to read-only users — so it's left
    // unset rather than guessed (batteryMonitoring falls back explicitly).
    out.push({
      externalId: `${id}:battery`,
      type: "Battery",
      name: `${site} · Battery`,
      site,
      capacityKw: ratingKw ?? Math.max(1, r1(Math.max(...history.map((h) => Math.abs(h.powerKw)), 1))),
      manufacturer: "Victron Energy",
      model: [monitor?.productName, inverter?.productName].filter(Boolean).join(" + ") || "Victron ESS",
      location,
      status: "healthy",
      currentLoadKw: Math.abs(powerKw),
      utilisationPct: Math.round(socNow),
      specs: {},
      telemetry: {
        ...siteTelemetry,
        socPct: r1(socNow),
        voltageV: voltage,
        currentA: current,
        powerKw,
        state: (attr(inst, "bst")?.formattedValue as string) ?? null,
        powerRatingSource: ratingKw ? "inverter nameplate" : "observed peak",
      },
      lastSeenAt: new Date(now).toISOString(),
      history,
    });
  }

  // --- Solar ---------------------------------------------------------------
  const kr = (kwh?.records as Record<string, unknown>) ?? {};
  const pv = sumSeries(kr, ["Pc", "Pb", "Pg"]);
  const solarNowW = num(attr(inst, "solar_yield")?.rawValue);
  if (pv.size || (solarNowW != null && solarNowW > 0)) {
    const history: HourlyPoint[] = [...pv.entries()]
      .filter(([ts]) => completeHoursOnly(ts, now))
      .sort((a, b) => a[0] - b[0])
      .map(([ts, e]) => ({ ts, powerKw: r2(e), energyKwh: r2(e) }));
    // VRM's configured PV size (pvMax) is usually 0, so the array size is the
    // highest hourly yield seen in the window — labelled as such in specs.
    const peakKw = Math.max(0, ...history.map((h) => h.powerKw));
    const pvChargers = devices.filter((d) => d.name === "Solar Charger" || d.name === "PV Inverter");
    const nowKw = solarNowW != null ? Math.max(0, r2(solarNowW / 1000)) : 0;
    const midnight = new Date(now);
    midnight.setUTCHours(0, 0, 0, 0);
    const monthStart = Date.UTC(midnight.getUTCFullYear(), midnight.getUTCMonth(), 1);
    // VRM splits PV energy by destination: Pg = exported to the grid,
    // Pc/Pb = used on site or stored — a measured self-consumption split.
    const exported = sumSeries(kr, ["Pg"]);
    const sinceKwh = (series: Map<number, number>, from: number) =>
      r1([...series.entries()].filter(([ts]) => ts >= from).reduce((s, [, v]) => s + v, 0));
    out.push({
      externalId: `${id}:solar`,
      type: "Solar",
      name: `${site} · Solar PV`,
      site,
      capacityKw: Math.max(0.1, r1(peakKw)),
      manufacturer: "Victron Energy",
      model: [...new Set(pvChargers.map((d) => d.productName))].join(", ") || "Victron PV",
      location,
      status: "healthy",
      currentLoadKw: nowKw,
      utilisationPct: peakKw > 0 ? Math.min(100, Math.round((nowKw / peakKw) * 100)) : 0,
      specs: { inverter: pvChargers.length ? `${pvChargers.length} PV chargers/inverters` : "Victron" },
      telemetry: {
        ...siteTelemetry,
        currentKw: nowKw,
        todayKwh: sinceKwh(pv, midnight.getTime()),
        todayExportKwh: sinceKwh(exported, midnight.getTime()),
        monthKwh: sinceKwh(pv, monthStart),
        monthExportKwh: sinceKwh(exported, monthStart),
        capacitySource: `observed ${HISTORY_DAYS}-day peak`,
        pvDeviceCount: pvChargers.length,
      },
      lastSeenAt: new Date(now).toISOString(),
      history,
    });
  }
  return out;
}

/** The demo connection's curated sites: the EV charging site (Paris), the
 * grid-tied ESS (Amsterdam) and the off-grid system (Queensland). The demo
 * account's yachts and boats aren't energy infrastructure, so they're left out. */
export const VRM_DEMO_SITE_IDS = [374891, 219742, 209689];
