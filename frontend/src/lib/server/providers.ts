// Composes the ANI engine (per-asset layer) with real public-API data (cost,
// carbon, weather, charge points) into the response shapes the frontend consumes.
// Real values overlay the engine-derived ones; everything degrades gracefully.

import { getNetwork } from "@/lib/ani/network";
import {
  analyse, forecast, monitor, optimise, recommend,
  loadShiftOpportunity, networkSummary,
  type Insight,
} from "@/lib/ani/engine";
import { alerts as syntheticAlerts, type Alert } from "@/lib/server/simulator";
import { backtestNetwork, type NetworkBacktest } from "@/lib/ani/evaluation";
import { getAlertStates, setAlertState, claimAlertState, type AlertStatus, type AlertStateRecord } from "@/lib/server/alertState";
import {
  listUserAssets, getUserAsset, addUserAsset, updateUserAsset, removeUserAsset,
  type UserAsset, type NewAssetInput, type AssetUpdate,
} from "@/lib/server/assetsStore";
import { listReadingsForOrg, type AssetReading } from "@/lib/server/assetReadings";
import { listOrgUsers, getPreferences, findById } from "@/lib/server/users";
import { sendEmail, emailShell, escapeHtml, isEmailConfigured } from "@/lib/server/email";
import type { Reading } from "@/lib/ani/dataGenerator";
import { getRegionProviders, type RegionProviders } from "@/lib/data/regions";
import { resolveTenant } from "@/lib/server/tenants";
import type { MapPin } from "@/lib/data/types";
import { USE_REAL_DATA } from "@/lib/data/config";

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const round = (x: number, n = 2) => +x.toFixed(n);
const pctDelta = (now: number, prev: number) =>
  prev > 0 ? Math.round(((now - prev) / prev) * 100) : 0;

function latestTsOf(readings: Reading[]) {
  return Math.max(...readings.map((r) => r.ts));
}

/** Resolves an org's real-data provider set from its market — the single
 * dispatch point every market-dependent function below goes through, so a
 * US/EU org's dashboard, forecast, price curve etc. all draw from its own
 * region rather than always UK. orgId is optional because some of these
 * functions are also reachable pre-auth (e.g. the public demo/marketing
 * pages hitting /grid/smart-window) — omitting it keeps today's UK default. */
async function regionFor(orgId?: string): Promise<RegionProviders> {
  const market = orgId ? (await resolveTenant(orgId)).market : "uk";
  return getRegionProviders(market);
}

// ----------------------------------------------------------------------------
// Dashboard metrics — engine aggregates + live cost & carbon overlays.
// ----------------------------------------------------------------------------
export async function metrics(orgId?: string) {
  const net = getNetwork();
  const latestTs = latestTsOf(net.readings);
  const latest = net.readings.filter((r) => r.ts === latestTs);

  // Rolling 24h vs the prior 24h — stable, meaningful, and free of the
  // partial-day distortion you get comparing "today so far" to a full yesterday.
  const DAY = 24 * 3_600_000;
  const last24 = net.readings.filter((r) => r.ts > latestTs - DAY);
  const prev24 = net.readings.filter((r) => r.ts > latestTs - 2 * DAY && r.ts <= latestTs - DAY);

  const energy24Kwh = sum(last24.map((r) => r.energyKwh));
  const energyPrevKwh = sum(prev24.map((r) => r.energyKwh));
  const sessions24 = sum(last24.map((r) => r.sessions));
  const sessionsPrev = sum(prev24.map((r) => r.sessions));
  const vehiclesNow = sum(latest.map((r) => r.sessions)); // charging right now
  const portsOnline = latest.filter((r) => r.online).length;
  const portsTotal = net.stations.reduce((s, st) => s + st.ports.length, 0);

  const region = await regionFor(orgId);
  const [carbon, pricing] = USE_REAL_DATA
    ? await Promise.all([region.fetchCarbonIntensity(), region.fetchPricing()])
    : [null, null];

  const sources: string[] = [];
  const pricePerKwh = pricing?.price_per_kwh ?? round(0.18, 3);
  if (pricing) sources.push(region.pricingSourceId);

  const intensity = carbon?.intensity_gco2_kwh ?? null;
  if (carbon) sources.push(region.carbonSourceId);
  const co2AvoidedT =
    intensity != null
      ? round((energy24Kwh * Math.max(0, region.gridBaselineGco2 - intensity)) / 1_000_000, 3)
      : round((energy24Kwh * 0.12) / 1000, 3);

  return {
    active_chargers: portsOnline,
    chargers_total: portsTotal,
    charging_sessions: sessions24,
    connected_vehicles: vehiclesNow,
    energy_consumption_mwh: round(energy24Kwh / 1000, 2),
    average_cost_per_kwh: round(pricePerKwh, 3),
    forecast_confidence_pct: 87,
    infrastructure_status: "Healthy",
    today_summary: {
      total_revenue_gbp: Math.round(energy24Kwh * pricePerKwh),
      total_energy_mwh: round(energy24Kwh / 1000, 2),
      cost_savings_gbp: Math.round(energy24Kwh * pricePerKwh * 0.18),
      co2_avoided_tco2: co2AvoidedT,
    },
    vs_yesterday: {
      active_chargers: 0,
      charging_sessions: pctDelta(sessions24, sessionsPrev),
      connected_vehicles: 0,
      energy_consumption: pctDelta(energy24Kwh, energyPrevKwh),
      average_cost: 0,
      co2_avoided: pctDelta(energy24Kwh, energyPrevKwh),
    },
    carbon_intensity_gco2_kwh: intensity ?? undefined,
    carbon_intensity_index: carbon?.index ?? undefined,
    generation_mix: carbon?.generation_mix ?? undefined,
    data_mode: sources.length ? "live" : "synthetic",
    data_sources: sources.length ? sources : ["synthetic"],
    data_updated_at: Date.now(),
  };
}

// ----------------------------------------------------------------------------
// Energy series — synthetic engine readings + real per-org AssetReading
// history, added together bucket-for-bucket. Same "real data overlays the
// synthetic baseline" shape as the rest of this file — a brand-new org with
// no real readings yet just gets the synthetic series unchanged.
// ----------------------------------------------------------------------------
export async function energySeries(orgId: string, period: "day" | "week" | "month" = "day") {
  const net = getNetwork();
  const dates = [...new Set(net.readings.map((r) => r.dateStr))].sort();
  const realKwhInRange = (real: AssetReading[], fromMs: number, toMs: number) =>
    sum(
      real
        .filter((r) => {
          const t = new Date(r.recorded_at).getTime();
          return t >= fromMs && t < toMs;
        })
        .map((r) => r.energy_kwh ?? 0),
    );

  if (period === "day") {
    const latestTs = latestTsOf(net.readings);
    const real = await listReadingsForOrg(orgId, latestTs - 23 * 3_600_000, latestTs + 3_600_000);
    const points = [];
    for (let i = 23; i >= 0; i--) {
      const ts = latestTs - i * 3_600_000;
      const rows = net.readings.filter((r) => r.ts === ts);
      const d = new Date(ts);
      points.push({
        time: `${String(d.getUTCHours()).padStart(2, "0")}:00`,
        value: round((sum(rows.map((r) => r.energyKwh)) + realKwhInRange(real, ts, ts + 3_600_000)) / 1000, 3),
      });
    }
    return points;
  }
  if (period === "week") {
    const weekDates = dates.slice(-7);
    const real = await listReadingsForOrg(
      orgId,
      new Date(weekDates[0] + "T00:00:00Z").getTime(),
      new Date(weekDates[weekDates.length - 1] + "T23:59:59Z").getTime(),
    );
    return weekDates.map((date) => {
      const rows = net.readings.filter((r) => r.dateStr === date);
      const dayStart = new Date(date + "T00:00:00Z").getTime();
      const d = new Date(dayStart);
      return {
        time: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()],
        value: round((sum(rows.map((r) => r.energyKwh)) + realKwhInRange(real, dayStart, dayStart + 24 * 3_600_000)) / 1000, 2),
      };
    });
  }
  // month: last 4 weeks
  const weeks = dates.slice(-28);
  const real = await listReadingsForOrg(
    orgId,
    new Date(weeks[0] + "T00:00:00Z").getTime(),
    new Date(weeks[weeks.length - 1] + "T23:59:59Z").getTime(),
  );
  return [0, 1, 2, 3].map((w) => {
    const slice = weeks.slice(w * 7, w * 7 + 7);
    const rows = net.readings.filter((r) => slice.includes(r.dateStr));
    const realKwh = sum(real.filter((r) => slice.includes(new Date(r.recorded_at).toISOString().slice(0, 10))).map((r) => r.energy_kwh ?? 0));
    return { time: `W${w + 1}`, value: round((sum(rows.map((r) => r.energyKwh)) + realKwh) / 1000, 1) };
  });
}

// ----------------------------------------------------------------------------
// Recommendation — top ANI insight, shaped for the dashboard card.
// ----------------------------------------------------------------------------
export function recommendation() {
  const net = getNetwork();
  const top = recommend(analyse(net), { top: 1 })[0];
  if (!top) {
    return {
      title: "ANI™ Recommendation",
      detail: "Network operating within healthy bounds across all sites.",
      action: "No action required.",
      estimated_savings_gbp: 0,
      confidence_pct: 80,
    };
  }
  return {
    title: "ANI™ Recommendation",
    detail: `${top.asset}: ${top.rationale}`,
    action: top.action,
    estimated_savings_gbp: Math.round(800 + top.confidence * 2600),
    confidence_pct: Math.round(top.confidence * 100),
  };
}

// ----------------------------------------------------------------------------
// Map pins — real OpenChargeMap sites, or the engine's stations.
// ----------------------------------------------------------------------------
export async function mapPins(orgId?: string): Promise<MapPin[]> {
  if (USE_REAL_DATA) {
    const region = await regionFor(orgId);
    const real = await region.fetchChargePoints();
    if (real) return real;
  }
  const net = getNetwork();
  const mon = monitor(net);
  return net.stations.map((st) => {
    const status = mon.stations.find((s) => s.stationId === st.id)?.status;
    return {
      site: st.name,
      lat: st.location.lat,
      lng: st.location.lng,
      status: status === "healthy" ? "operational" : status === "down" ? "critical" : "warning",
      active_sessions: 0,
    };
  });
}

// ----------------------------------------------------------------------------
// Forecast — network-wide daily forecast (sum of per-station) + weather drivers.
// ----------------------------------------------------------------------------
export async function forecastPayload(horizon = "14d", orgId?: string) {
  const net = getNetwork();
  const horizonDays = Number(horizon.replace(/\D/g, "")) || 14;
  const perStation = net.stations.map((s) => forecast(net, s.id, { horizonDays }));

  const points = Array.from({ length: horizonDays }, (_, i) => {
    const day = perStation.map((f) => f.points[i]).filter(Boolean);
    if (!day.length) return null;
    return {
      time: day[0]!.date,
      value: round(sum(day.map((p) => p!.predicted)) / 1000, 2),
      lower: round(sum(day.map((p) => p!.lower)) / 1000, 2),
      upper: round(sum(day.map((p) => p!.upper)) / 1000, 2),
    };
  }).filter(Boolean) as { time: string; value: number; lower: number; upper: number }[];

  const region = await regionFor(orgId);
  const weather = USE_REAL_DATA ? await region.fetchWeather() : null;
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);

  return {
    horizon,
    confidence: 87,
    peak_mwh: peak?.value ?? 0,
    peak_time: peak?.time ?? "",
    drivers: weather?.drivers ?? [
      "Day-of-week seasonal demand pattern",
      "Recent upward utilisation trend at key sites",
    ],
    weather: weather
      ? { temp_min_c: weather.temp_min_c, temp_max_c: weather.temp_max_c, peak_solar_wm2: weather.peak_solar_wm2 }
      : undefined,
    points,
    method: "seasonal_naive_x_trend",
    data_mode: weather ? "live" : "synthetic",
    data_sources: weather ? ["open_meteo", "ani_engine"] : ["ani_engine"],
  };
}

// ----------------------------------------------------------------------------
// Engine pass-throughs for asset/monitoring/insight tabs.
// ----------------------------------------------------------------------------
export function monitoring() {
  return monitor(getNetwork());
}
export function insights(): Insight[] {
  return analyse(getNetwork());
}
export function forecastAccuracy(): NetworkBacktest {
  return backtestNetwork(getNetwork());
}

/** Synthetic alerts overlaid with per-org acknowledge/resolve state (Mongo-backed
 * when configured, per-instance in-memory otherwise — see alertState.ts). */
const ASSET_FAULT_PREFIX = "asset-fault:";
const assetFaultAlertId = (assetId: string) => `${ASSET_FAULT_PREFIX}${assetId}`;

function assetFaultOf(a: UserAsset): Fault | null {
  return classifyFault({ stationId: a.id, name: a.name, status: a.status, portsOnline: a.status === "healthy" ? 1 : 0, portsTotal: 1 }, 0);
}

/** Real user-asset faults that are still active/acknowledged, in the same
 * Alert shape as the synthetic feed — surfaced on the same Alerts page,
 * acknowledge/resolve included. A fault that's cleared but whose AlertState
 * hasn't caught up yet (checkAssetFaultAlerts hasn't run since recovery) is
 * dropped here rather than shown stale; the next check call reconciles it. */
async function assetFaultAlerts(orgId: string, states: Map<string, AlertStateRecord>): Promise<Alert[]> {
  const userAssets = await listUserAssets(orgId);
  const out: Alert[] = [];
  for (const a of userAssets) {
    const id = assetFaultAlertId(a.id);
    const st = states.get(id);
    if (!st || st.status === "resolved") continue;
    const fault = assetFaultOf(a);
    if (!fault) continue;
    out.push({
      id,
      severity: fault.kind === "offline" ? "high" : "medium",
      status: st.status,
      title: fault.kind === "offline" ? `${a.name} is offline` : `${a.name} is degraded`,
      asset: a.name,
      site: a.site,
      created_at: a.updatedAt,
      acknowledged_at: st.acknowledged_at,
      resolved_at: st.resolved_at,
    });
  }
  return out;
}

export async function alertsWithState(orgId: string): Promise<Alert[]> {
  const base = syntheticAlerts();
  const states = await getAlertStates(orgId);
  const synthetic = base.map((a) => {
    const st = states.get(a.id);
    return st ? { ...a, ...st } : a;
  });
  return [...synthetic, ...(await assetFaultAlerts(orgId, states))];
}

export interface ProactiveAlertCheck { newFaults: number; resolved: number; emailed: string[] }

/** Detects newly-faulted / recovered real user assets and, best-effort,
 * emails opted-in org members once per occurrence — driven from AlertState
 * so repeat polling of an unchanged fault never re-sends. Called opportunis-
 * tically wherever fault data is read (no cron/background jobs on this
 * serverless deployment, so "on read" is the trigger, same as every other
 * derived value in this file). */
export async function checkAssetFaultAlerts(orgId: string): Promise<ProactiveAlertCheck> {
  const userAssets = await listUserAssets(orgId);
  const states = await getAlertStates(orgId);
  const newlyFaulted: { asset: UserAsset; fault: Fault }[] = [];
  let resolved = 0;

  for (const a of userAssets) {
    const id = assetFaultAlertId(a.id);
    const existing = states.get(id);
    const fault = assetFaultOf(a);
    if (fault) {
      if (!existing || existing.status === "resolved") {
        // claimAlertState (not setAlertState) — two concurrent callers can
        // both observe "not active yet" above; only the one that actually
        // wins the claim should count it and trigger the email.
        if (await claimAlertState(orgId, id, "active")) newlyFaulted.push({ asset: a, fault });
      }
    } else if (existing && existing.status !== "resolved") {
      await setAlertState(orgId, id, "resolved");
      resolved++;
    }
  }

  const emailed: string[] = [];
  if (newlyFaulted.length && isEmailConfigured()) {
    const subject = `Ask ANI™ — ${newlyFaulted.length} new asset alert${newlyFaulted.length === 1 ? "" : "s"}`;
    const rows = newlyFaulted.map(({ asset, fault }) => `<li><strong>${escapeHtml(asset.name)}</strong> (${escapeHtml(asset.site)}) — ${fault.detail}</li>`).join("");
    const html = emailShell(subject, `<ul style="padding-left:18px;margin:0">${rows}</ul>`);
    for (const u of await listOrgUsers(orgId)) {
      const prefs = await getPreferences(u.id);
      if (!prefs.emailAlerts) continue;
      const sent = await sendEmail({ to: u.email, subject, html });
      if (sent.sent) emailed.push(u.email);
    }
  }

  return { newFaults: newlyFaulted.length, resolved, emailed };
}

// ----------------------------------------------------------------------------
// Monitoring — fault detection surface + online/offline rollup.
// ----------------------------------------------------------------------------
export type FaultKind = "offline" | "degraded" | "recurring_fault";
export interface Fault {
  stationId: string;
  name: string;
  kind: FaultKind;
  detail: string;
  fault_rate_pct: number; // faulted readings over the last 24h
}
export interface FaultSummary {
  asOf: string;
  rollup: { healthy: number; degraded: number; down: number; ports_online: number; ports_offline: number; faulted_ports_now: number };
  faults: Fault[];
}

const FAULT_ORDER: Record<FaultKind, number> = { offline: 0, degraded: 1, recurring_fault: 2 };

/** Sort faults by severity kind, then by fault rate (worst first). */
export function compareFaults(a: Fault, b: Fault): number {
  return FAULT_ORDER[a.kind] - FAULT_ORDER[b.kind] || b.fault_rate_pct - a.fault_rate_pct;
}

/** Pure fault classification for one station given its status + 24h fault rate.
 * Returns null when the station is healthy with no significant recent faults. */
export function classifyFault(
  s: { stationId: string; name: string; status: "healthy" | "degraded" | "down"; portsOnline: number; portsTotal: number },
  ratePct: number,
): Fault | null {
  const base = { stationId: s.stationId, name: s.name, fault_rate_pct: ratePct };
  if (s.status === "down") {
    return { ...base, kind: "offline", detail: `All ${s.portsTotal} ports offline` };
  }
  if (s.status === "degraded") {
    const off = s.portsTotal - s.portsOnline;
    return { ...base, kind: "degraded", detail: `${off}/${s.portsTotal} port${off > 1 ? "s" : ""} offline` };
  }
  if (ratePct >= 10) {
    return { ...base, kind: "recurring_fault", detail: "Intermittent faults detected in the last 24h" };
  }
  return null;
}

/** Real user-registered assets contribute to the same rollup/fault list as
 * the synthetic engine fleet — a customer asset marked degraded/down is
 * exactly the kind of thing this surface exists to show. They don't have the
 * engine's per-reading "faulted" concept, so they can only ever classify as
 * offline/degraded (from their own status field), never "recurring_fault"
 * (ratePct 0) — that needs real historical fault-rate data this phase
 * doesn't track yet. */
export async function faultSummary(orgId: string): Promise<FaultSummary> {
  const net = getNetwork();
  const mon = monitor(net);
  const latestTs = latestTsOf(net.readings);
  const DAY = 24 * 3_600_000;
  const last24 = net.readings.filter((r) => r.ts > latestTs - DAY);
  const latest = net.readings.filter((r) => r.ts === latestTs);

  const portsTotal = net.stations.reduce((s, st) => s + st.ports.length, 0);
  const portsOnline = latest.filter((r) => r.online).length;
  const faultedPortsNow = latest.filter((r) => r.faulted).length;

  const byStation = new Map<string, { faulted: number; total: number }>();
  for (const r of last24) {
    const e = byStation.get(r.stationId) ?? { faulted: 0, total: 0 };
    e.total++;
    if (r.faulted) e.faulted++;
    byStation.set(r.stationId, e);
  }

  const faults: Fault[] = [];
  for (const s of mon.stations) {
    const fr = byStation.get(s.stationId);
    const ratePct = fr && fr.total ? Math.round((fr.faulted / fr.total) * 100) : 0;
    const f = classifyFault(s, ratePct);
    if (f) faults.push(f);
  }

  const userAssets = await listUserAssets(orgId);
  for (const a of userAssets) {
    const f = assetFaultOf(a);
    if (f) faults.push(f);
  }
  faults.sort(compareFaults);

  const userHealthy = userAssets.filter((a) => a.status === "healthy").length;
  const userDegraded = userAssets.filter((a) => a.status === "degraded").length;
  const userDown = userAssets.filter((a) => a.status === "down").length;

  return {
    asOf: mon.asOf,
    rollup: {
      healthy: mon.stations.filter((s) => s.status === "healthy").length + userHealthy,
      degraded: mon.stations.filter((s) => s.status === "degraded").length + userDegraded,
      down: mon.stations.filter((s) => s.status === "down").length + userDown,
      ports_online: portsOnline + userHealthy,
      ports_offline: portsTotal - portsOnline + userDegraded + userDown,
      faulted_ports_now: faultedPortsNow,
    },
    faults,
  };
}

// ----------------------------------------------------------------------------
// Analytics — period-over-period comparison over real 60-day reading history.
// ----------------------------------------------------------------------------
const COMPARE_WINDOW_DAYS: Record<string, number> = { day: 1, week: 7, month: 28 };

export interface ComparisonTotals { energy_mwh: number; sessions: number; cost_gbp: number; co2_avoided_t: number; }
export interface ComparisonSummary {
  period: "day" | "week" | "month";
  window_days: number;
  range: { from: string; to: string };
  current: ComparisonTotals;
  previous: ComparisonTotals;
  deltas: { energy: number; sessions: number; cost: number; co2_avoided: number };
  data_mode: "live" | "synthetic";
  data_sources: string[];
}

/** orgId (optional) blends this org's real ingested readings into the totals,
 * the same "real overlays synthetic" pattern as energySeries. from/to
 * (optional, ISO dates, both required together) override the day/week/month
 * preset with an arbitrary historical window — the previous period is the
 * same-length window immediately before it, for a fair comparison. */
export async function comparisonSummary(
  periodRaw = "week",
  opts: { orgId?: string; from?: string; to?: string } = {},
): Promise<ComparisonSummary> {
  const period = (["day", "week", "month"].includes(periodRaw) ? periodRaw : "week") as "day" | "week" | "month";
  const net = getNetwork();
  const latestTs = latestTsOf(net.readings);

  const customFrom = opts.from ? new Date(opts.from).getTime() : NaN;
  const customTo = opts.to ? new Date(opts.to).getTime() : NaN;
  const usingCustomRange = Number.isFinite(customFrom) && Number.isFinite(customTo) && customTo > customFrom;
  let curFromMs: number, curToMs: number, windowMs: number, windowDays: number;
  if (usingCustomRange) {
    curFromMs = customFrom;
    curToMs = customTo;
    windowMs = curToMs - curFromMs;
    windowDays = Math.round(windowMs / (24 * 3_600_000));
  } else {
    windowDays = COMPARE_WINDOW_DAYS[period];
    windowMs = windowDays * 24 * 3_600_000;
    curToMs = latestTs;
    curFromMs = latestTs - windowMs;
  }
  const prevFromMs = curFromMs - windowMs;
  const prevToMs = curFromMs;

  const cur = net.readings.filter((r) => r.ts > curFromMs && r.ts <= curToMs);
  const prev = net.readings.filter((r) => r.ts > prevFromMs && r.ts <= prevToMs);

  // Real readings carry genuine wall-clock timestamps, not the synthetic
  // engine's hour-aligned latestTs — for the current-preset window (not a
  // custom range, which is already an exact caller-given bound), pad the
  // real-data query's upper bound by an hour so a reading recorded after
  // the engine's last synthetic tick isn't silently dropped.
  const realCurToMs = usingCustomRange ? curToMs : curToMs + 3_600_000;
  // listReadingsForOrg is inclusive at both ends; current's lower bound and
  // previous's upper bound are the same instant (curFromMs), so without this
  // -1ms a reading recorded at exactly that boundary would double-count into
  // both windows.
  const realPrevToMs = prevToMs - 1;

  const region = await regionFor(opts.orgId);
  const [carbon, pricing, realCur, realPrev] = await Promise.all([
    USE_REAL_DATA ? region.fetchCarbonIntensity() : Promise.resolve(null),
    USE_REAL_DATA ? region.fetchPricing() : Promise.resolve(null),
    opts.orgId ? listReadingsForOrg(opts.orgId, curFromMs, realCurToMs) : Promise.resolve([]),
    opts.orgId ? listReadingsForOrg(opts.orgId, prevFromMs, realPrevToMs) : Promise.resolve([]),
  ]);
  const sources: string[] = [];
  const price = pricing?.price_per_kwh ?? 0.18;
  if (pricing) sources.push(region.pricingSourceId);
  const intensity = carbon?.intensity_gco2_kwh ?? null;
  if (carbon) sources.push(region.carbonSourceId);

  const totals = (rows: Reading[], real: AssetReading[]): ComparisonTotals => {
    const kwh = sum(rows.map((r) => r.energyKwh)) + sum(real.map((r) => r.energy_kwh ?? 0));
    const co2 = intensity != null
      ? (kwh * Math.max(0, region.gridBaselineGco2 - intensity)) / 1_000_000
      : (kwh * 0.12) / 1000;
    return {
      energy_mwh: round(kwh / 1000, 2),
      sessions: sum(rows.map((r) => r.sessions)),
      cost_gbp: Math.round(kwh * price),
      co2_avoided_t: round(co2, 2),
    };
  };
  const current = totals(cur, realCur);
  const previous = totals(prev, realPrev);

  return {
    period, window_days: windowDays,
    range: { from: new Date(curFromMs).toISOString(), to: new Date(curToMs).toISOString() },
    current, previous,
    deltas: {
      energy: pctDelta(current.energy_mwh, previous.energy_mwh),
      sessions: pctDelta(current.sessions, previous.sessions),
      cost: pctDelta(current.cost_gbp, previous.cost_gbp),
      co2_avoided: pctDelta(current.co2_avoided_t, previous.co2_avoided_t),
    },
    data_mode: sources.length ? "live" : "synthetic",
    data_sources: sources.length ? sources : ["synthetic"],
  };
}

export interface Notification {
  id: string;
  severity: "high" | "medium" | "low";
  status: AlertStatus;
  title: string;
  detail: string;
  at: string;
}

/** In-app notifications derived from live alert state — no separate store.
 * Unread = still-active (unacknowledged) alerts, so acknowledging or resolving
 * an alert clears its notification automatically. */
export async function notifications(orgId: string): Promise<{ items: Notification[]; unread: number }> {
  const list = await alertsWithState(orgId);
  const items = list
    .filter((a) => a.status !== "resolved")
    .map((a) => ({
      id: a.id, severity: a.severity, status: a.status,
      title: a.title, detail: `${a.asset} · ${a.site}`, at: a.created_at,
    }));
  return { items, unread: items.filter((i) => i.status === "active").length };
}

/** Throws if the alert id doesn't exist in the synthetic set — callers turn
 * that into a 404 rather than letting arbitrary ids silently "succeed". */
export async function updateAlertStatus(orgId: string, alertId: string, status: AlertStatus): Promise<Alert> {
  if (alertId.startsWith(ASSET_FAULT_PREFIX)) {
    const asset = await getUserAsset(orgId, alertId.slice(ASSET_FAULT_PREFIX.length));
    if (!asset) throw new Error("Alert not found");
    const fault = assetFaultOf(asset);
    await setAlertState(orgId, alertId, status);
    const st = (await getAlertStates(orgId)).get(alertId)!;
    return {
      id: alertId,
      severity: fault?.kind === "offline" ? "high" : "medium",
      status,
      title: fault ? (fault.kind === "offline" ? `${asset.name} is offline` : `${asset.name} is degraded`) : `${asset.name} fault cleared`,
      asset: asset.name,
      site: asset.site,
      created_at: asset.updatedAt,
      acknowledged_at: st.acknowledged_at,
      resolved_at: st.resolved_at,
    };
  }
  const base = syntheticAlerts();
  const alert = base.find((a) => a.id === alertId);
  if (!alert) throw new Error("Alert not found");
  await setAlertState(orgId, alertId, status);
  const states = await getAlertStates(orgId);
  return { ...alert, ...states.get(alertId) };
}
export interface AssetRow {
  id: string;
  name: string;
  type: string;
  site: string;
  capacity_kw: number;
  ports: number;
  status: "healthy" | "degraded" | "down";
  utilisation_pct: number;
  current_load_kw: number;
  location: { lat: number; lng: number } | null;
  source: "engine" | "preview" | "user";
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  installed_at?: string;
  product_id?: string;
}

// Illustrative Battery/Solar entries — the underlying engine only models EV
// charging infrastructure, and these asset classes are explicitly "preview"
// in the MVP spec, not a full monitoring pipeline like the EV fleet.
const PREVIEW_ASSETS: AssetRow[] = [
  {
    id: "preview-battery-1",
    name: "Riverside Battery Bank",
    type: "Battery",
    site: "Leeds Depot",
    capacity_kw: 500,
    ports: 1,
    status: "healthy",
    utilisation_pct: 62,
    current_load_kw: 310,
    location: { lat: 53.8008, lng: -1.5491 },
    source: "preview",
  },
  {
    id: "preview-solar-1",
    name: "Northbridge Rooftop Solar",
    type: "Solar",
    site: "Manchester Site",
    capacity_kw: 250,
    ports: 1,
    status: "healthy",
    utilisation_pct: 41,
    current_load_kw: 102,
    location: { lat: 53.4808, lng: -2.2426 },
    source: "preview",
  },
];

/** Engine-modelled EV chargers + illustrative Battery/Solar previews +
 * this org's user-registered assets (Mongo-backed when configured, graceful
 * in-memory fallback otherwise — see assetsStore.ts). */
export async function assets(orgId: string): Promise<AssetRow[]> {
  const net = getNetwork();
  const mon = monitor(net);
  const evAssets: AssetRow[] = net.stations.map((st) => {
    const m = mon.stations.find((s) => s.stationId === st.id);
    return {
      id: st.id,
      name: st.name,
      type: "EV Charger",
      site: st.name,
      capacity_kw: st.capacityKw,
      ports: st.ports.length,
      status: m?.status ?? "healthy",
      utilisation_pct: Math.round((m?.currentUtilisation ?? 0) * 100),
      current_load_kw: m?.currentLoadKw ?? 0,
      location: st.location,
      source: "engine",
    };
  });

  const userAssets = await listUserAssets(orgId);
  const userRows: AssetRow[] = userAssets.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    site: a.site,
    capacity_kw: a.capacity_kw,
    ports: 1,
    status: a.status,
    utilisation_pct: a.utilisation_pct,
    current_load_kw: a.current_load_kw,
    location: a.location,
    source: "user",
    manufacturer: a.manufacturer,
    model: a.model,
    serial_number: a.serial_number,
    installed_at: a.installed_at,
    product_id: a.product_id,
  }));

  return [...evAssets, ...PREVIEW_ASSETS, ...userRows];
}

export async function getAsset(orgId: string, id: string): Promise<AssetRow | undefined> {
  return (await assets(orgId)).find((a) => a.id === id);
}

export async function createAsset(orgId: string, input: NewAssetInput): Promise<AssetRow> {
  const asset = await addUserAsset(orgId, input);
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    site: asset.site,
    capacity_kw: asset.capacity_kw,
    ports: 1,
    status: asset.status,
    utilisation_pct: asset.utilisation_pct,
    current_load_kw: asset.current_load_kw,
    location: asset.location,
    source: "user",
    manufacturer: asset.manufacturer,
    model: asset.model,
    serial_number: asset.serial_number,
    installed_at: asset.installed_at,
    product_id: asset.product_id,
  };
}

/** Updates status/technical-info/product-link on an org's own asset. Returns
 * undefined for engine/preview assets (never in the DB-backed store) or an
 * unknown id — callers turn that into a 404, never a silent success. */
export async function updateAsset(orgId: string, id: string, updates: AssetUpdate): Promise<AssetRow | undefined> {
  const asset = await updateUserAsset(orgId, id, updates);
  if (!asset) return undefined;
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    site: asset.site,
    capacity_kw: asset.capacity_kw,
    ports: 1,
    status: asset.status,
    utilisation_pct: asset.utilisation_pct,
    current_load_kw: asset.current_load_kw,
    location: asset.location,
    source: "user",
    manufacturer: asset.manufacturer,
    model: asset.model,
    serial_number: asset.serial_number,
    installed_at: asset.installed_at,
    product_id: asset.product_id,
  };
}

export async function deleteAsset(orgId: string, id: string): Promise<boolean> {
  return removeUserAsset(orgId, id);
}

/** Bulk-create user assets (CSV import). Sequential so the in-memory fallback
 * stays consistent; volumes are bounded by the parser's row cap. */
export async function importAssets(orgId: string, inputs: NewAssetInput[]): Promise<AssetRow[]> {
  const created: AssetRow[] = [];
  for (const input of inputs) created.push(await createAsset(orgId, input));
  return created;
}

export function summary() {
  return networkSummary(getNetwork());
}

// ----------------------------------------------------------------------------
// Smart charging window — blend live price + carbon forecast to find the single
// best half-hour to charge (cheapest AND cleanest). The core user payoff.
// ----------------------------------------------------------------------------
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export async function smartWindow(orgId?: string) {
  const region = await regionFor(orgId);
  const [slots, carbon] = USE_REAL_DATA
    ? await Promise.all([region.fetchPriceWindow(), region.fetchCarbonForecast()])
    : [null, null];
  if (!slots?.length || !carbon?.length) {
    return { available: false, data_mode: "synthetic" as const };
  }

  const carbonByTime = new Map<string, number>();
  for (const c of carbon) carbonByTime.set(hhmm(c.from), c.gco2);

  const joined = slots
    .map((s) => ({ time: hhmm(s.valid_from), pence: s.pence, gco2: carbonByTime.get(hhmm(s.valid_from)) }))
    .filter((x): x is { time: string; pence: number; gco2: number } => x.gco2 != null);
  if (!joined.length) return { available: false, data_mode: "synthetic" as const };

  const prices = joined.map((j) => j.pence);
  const carbons = joined.map((j) => j.gco2);
  const norm = (v: number, arr: number[]) => {
    const mn = Math.min(...arr);
    const mx = Math.max(...arr);
    return mx > mn ? (v - mn) / (mx - mn) : 0;
  };
  const scored = joined.map((j) => ({ ...j, score: round(0.6 * norm(j.pence, prices) + 0.4 * norm(j.gco2, carbons), 3) }));
  const best = scored.reduce((a, b) => (b.score < a.score ? b : a));
  const avgPence = prices.reduce((s, x) => s + x, 0) / prices.length;
  const avgCarbon = carbons.reduce((s, x) => s + x, 0) / carbons.length;

  return {
    available: true as const,
    best_at: best.time,
    price_pence: round(best.pence, 2),
    carbon_gco2: Math.round(best.gco2),
    vs_avg_price_pct: Math.round(((best.pence - avgPence) / avgPence) * 100),
    vs_avg_carbon_pct: Math.round(((best.gco2 - avgCarbon) / avgCarbon) * 100),
    points: scored.map((s) => ({ time: s.time, pence: s.pence, gco2: s.gco2, score: s.score })),
    data_mode: "live" as const,
    data_sources: [region.pricingSourceId, region.carbonSourceId],
  };
}

const AUTO_OPTIMISE_PREFIX = "auto-optimise:";

export interface AutoOptimiseCheck { autoScheduled: boolean; justExecuted: boolean }

/** Turns the previously-dead "auto-optimise" preference into a real,
 * once-a-day action: when a user has it on and today's smart-charging
 * window is available, ANI "schedules" it — recorded via AlertState for
 * idempotency (no schema change, same on-read trigger pattern as
 * checkAssetFaultAlerts) and confirmed by email once. There's no real
 * hardware control in this MVP, so "execute" means recording the decision
 * and notifying — not dispatching a command to a charger. */
export async function checkAutoOptimise(
  orgId: string,
  userId: string,
  window: { available: boolean; best_at?: string },
): Promise<AutoOptimiseCheck> {
  if (!window.available) return { autoScheduled: false, justExecuted: false };
  const prefs = await getPreferences(userId);
  if (!prefs.autoOptimise) return { autoScheduled: false, justExecuted: false };

  const dateStr = new Date().toISOString().slice(0, 10);
  const id = `${AUTO_OPTIMISE_PREFIX}${userId}:${dateStr}`;
  // claimAlertState (not a read-then-write) — two concurrent requests for
  // the same user's first load of the day must not both send the email.
  if (!(await claimAlertState(orgId, id, "active"))) return { autoScheduled: true, justExecuted: false };

  if (isEmailConfigured() && prefs.emailAlerts) {
    const user = await findById(userId);
    if (user) {
      await sendEmail({
        to: user.email,
        subject: "Ask ANI™ — charging auto-scheduled for today",
        html: emailShell(
          "Auto-optimise scheduled",
          `<p>ANI™ auto-scheduled your flexible load for today's cheapest, cleanest window — <strong>${window.best_at}</strong>.</p>`,
        ),
      }).catch(() => {});
    }
  }

  return { autoScheduled: true, justExecuted: true };
}

// ----------------------------------------------------------------------------
// Price curve — today's live Agile half-hourly rates + cheapest window.
// ----------------------------------------------------------------------------
export async function priceCurve(orgId?: string) {
  const region = await regionFor(orgId);
  const slots = USE_REAL_DATA ? await region.fetchPriceWindow() : null;
  if (!slots || !slots.length) {
    return { points: [], data_mode: "synthetic" as const, source: "unavailable" };
  }
  const points = slots.map((s) => ({
    time: new Date(s.valid_from).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    value: s.pence,
  }));
  const pences = slots.map((s) => s.pence);
  const min = Math.min(...pences);
  const max = Math.max(...pences);
  const cheapest = slots.reduce((a, b) => (b.pence < a.pence ? b : a));
  const dearest = slots.reduce((a, b) => (b.pence > a.pence ? b : a));
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return {
    points,
    min_pence: round(min, 2),
    max_pence: round(max, 2),
    avg_pence: round(pences.reduce((s, x) => s + x, 0) / pences.length, 2),
    spread_pence: round(max - min, 2),
    cheapest_at: fmt(cheapest.valid_from),
    dearest_at: fmt(dearest.valid_from),
    data_mode: "live" as const,
    source: region.priceWindowSourceLabel,
  };
}

// ----------------------------------------------------------------------------
// Optimisation — load-shift opportunity × live price spread → £ savings,
// plus per-station peak headroom.
// ----------------------------------------------------------------------------
export async function optimisation(orgId?: string) {
  const net = getNetwork();
  const shift = loadShiftOpportunity(net);
  const [curve, region] = await Promise.all([priceCurve(orgId), regionFor(orgId)]);

  const spreadPence = "spread_pence" in curve && curve.spread_pence != null ? curve.spread_pence : 10;
  const dailySavingGbp = round((shift.shiftableKwh * spreadPence) / 100, 2);

  const stations = net.stations
    .map((st) => optimise(net, forecast(net, st.id, { horizonDays: 7 })))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.headroomPct - b.headroomPct);

  return {
    load_shift: shift,
    price: "cheapest_at" in curve
      ? { cheapest_at: curve.cheapest_at, dearest_at: curve.dearest_at, min_pence: curve.min_pence, max_pence: curve.max_pence, spread_pence: curve.spread_pence }
      : null,
    daily_saving_gbp: dailySavingGbp,
    annual_saving_gbp: Math.round(dailySavingGbp * 365),
    stations,
    data_mode: curve.data_mode,
    data_sources: curve.data_mode === "live" ? [region.pricingSourceId, "ani_engine"] : ["ani_engine"],
  };
}
