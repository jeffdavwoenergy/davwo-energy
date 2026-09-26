// ANI™ engine — rules-based and EXPLAINABLE (every output carries a "why").
// Ported from davwo-ani. The structured Insight Object is the contract the
// dashboard, the assistant, and any future ML all consume.

import { HOUR_PROFILE, type Network, type Reading } from "./dataGenerator";

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const std = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const round = (x: number, n = 2) => +x.toFixed(n);

export type Severity = "high" | "medium" | "low" | "info";
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };
const PEAK_HOURS = [17, 18, 19];

function groupBy<T>(rows: T[], keyFn: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

export interface StationStatus {
  stationId: string;
  name: string;
  portsOnline: number;
  portsTotal: number;
  status: "healthy" | "degraded" | "down";
  currentUtilisation: number;
  currentLoadKw: number;
}
export interface MonitorResult {
  asOf: string;
  stationsOnline: number;
  stationsTotal: number;
  stations: StationStatus[];
}

export function monitor(ds: Network): MonitorResult {
  const latestTs = Math.max(...ds.readings.map((r) => r.ts));
  const latest = ds.readings.filter((r) => r.ts === latestTs);
  const byStation = groupBy(latest, (r) => r.stationId);

  const stations: StationStatus[] = ds.stations.map((st) => {
    const rows = byStation.get(st.id) || [];
    const onlinePorts = rows.filter((r) => r.online).length;
    return {
      stationId: st.id,
      name: st.name,
      portsOnline: onlinePorts,
      portsTotal: st.ports.length,
      status: onlinePorts === st.ports.length ? "healthy" : onlinePorts === 0 ? "down" : "degraded",
      currentUtilisation: round(mean(rows.map((r) => r.utilisation))),
      currentLoadKw: round(sum(rows.map((r) => r.energyKwh))),
    };
  });

  return {
    asOf: new Date(latestTs).toISOString(),
    stationsOnline: stations.filter((s) => s.status !== "down").length,
    stationsTotal: stations.length,
    stations,
  };
}

export interface Insight {
  type: "capacity_risk" | "rising_demand" | "underutilised" | "recurring_fault";
  severity: Severity;
  asset: string;
  metric: { name: string; value: number; window: string };
  recommendation: string;
  confidence: number;
  why: string;
}

export function analyse(ds: Network, opts: { windowDays?: number } = {}): Insight[] {
  const windowDays = opts.windowDays ?? 14;
  const latestTs = Math.max(...ds.readings.map((r) => r.ts));
  const windowStart = latestTs - windowDays * 24 * 3_600_000;
  const win = ds.readings.filter((r) => r.ts >= windowStart);
  const insights: Insight[] = [];

  for (const st of ds.stations) {
    const rows = win.filter((r) => r.stationId === st.id);
    const online = rows.filter((r) => r.online);
    if (!online.length) continue;

    const avgUtil = mean(online.map((r) => r.utilisation));
    const peakUtil = mean(online.filter((r) => PEAK_HOURS.includes(r.hour)).map((r) => r.utilisation));

    const mid = windowStart + (latestTs - windowStart) / 2;
    const firstHalf = mean(online.filter((r) => r.ts < mid).map((r) => r.utilisation));
    const secondHalf = mean(online.filter((r) => r.ts >= mid).map((r) => r.utilisation));
    const trendRatio = firstHalf > 0.01 ? (secondHalf - firstHalf) / firstHalf : 0;

    const dataConf = Math.min(0.95, 0.55 + online.length / 6000);

    if (peakUtil > 0.85) {
      insights.push({
        type: "capacity_risk",
        severity: peakUtil > 0.92 ? "high" : "medium",
        asset: `${st.name} (${st.id})`,
        metric: { name: "peak_utilisation", value: round(peakUtil), window: `${windowDays}d, 17:00–19:00` },
        recommendation: "Add a port or enable dynamic peak pricing — this site is saturated during the evening rush.",
        confidence: round(dataConf, 2),
        why: `Evening-peak utilisation averaged ${pct(peakUtil)} over the last ${windowDays} days, leaving little headroom for new demand.`,
      });
    }
    if (trendRatio > 0.2) {
      insights.push({
        type: "rising_demand",
        severity: trendRatio > 0.4 ? "high" : "medium",
        asset: `${st.name} (${st.id})`,
        metric: { name: "demand_trend", value: round(trendRatio), window: `${windowDays}d` },
        recommendation: "Plan capacity ahead of demand — schedule a capacity review for this site.",
        confidence: round(dataConf, 2),
        why: `Average utilisation rose ${pct(trendRatio)} from the first to the second half of the window — a clear upward trend.`,
      });
    }
    if (avgUtil < 0.15) {
      insights.push({
        type: "underutilised",
        severity: avgUtil < 0.08 ? "medium" : "low",
        asset: `${st.name} (${st.id})`,
        metric: { name: "avg_utilisation", value: round(avgUtil), window: `${windowDays}d` },
        recommendation: "Investigate siting/marketing, or redeploy a unit to a busier location to lift network ROI.",
        confidence: round(dataConf, 2),
        why: `Average utilisation was only ${pct(avgUtil)} over ${windowDays} days — capital is sitting idle here.`,
      });
    }
    for (const port of st.ports) {
      const pr = rows.filter((r) => r.portId === port.id);
      if (!pr.length) continue;
      const faultFrac = pr.filter((r) => r.faulted).length / pr.length;
      if (faultFrac > 0.05) {
        insights.push({
          type: "recurring_fault",
          severity: faultFrac > 0.1 ? "high" : "medium",
          asset: `${st.name} / ${port.label} (${port.id})`,
          metric: { name: "downtime_fraction", value: round(faultFrac), window: `${windowDays}d` },
          recommendation: "Dispatch maintenance — this unit fails far more often than the fleet norm.",
          confidence: round(Math.min(0.95, 0.6 + pr.length / 2000), 2),
          why: `This port was offline ${pct(faultFrac)} of the time, vs <1% across healthy units — a likely hardware fault.`,
        });
      }
    }
  }

  insights.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence);
  return insights;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
}
export interface Forecast {
  stationId: string;
  method: string;
  trendRatio?: number;
  horizonDays?: number;
  points: ForecastPoint[];
}

export function forecast(ds: Network, stationId: string, opts: { horizonDays?: number } = {}): Forecast {
  const horizonDays = opts.horizonDays ?? 14;
  const rows = ds.readings.filter((r) => r.stationId === stationId && r.online);

  const byDate = groupBy(rows, (r) => r.dateStr);
  const daily = [...byDate.entries()]
    .map(([date, rs]) => ({ date, energy: sum(rs.map((r: Reading) => r.energyKwh)), dow: rs[0].dow }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (daily.length < 7) return { stationId, points: [], method: "insufficient_data" };

  const dowAvg: Record<number, number> = {};
  for (let d = 0; d < 7; d++) {
    dowAvg[d] = mean(daily.filter((x) => x.dow === d).map((x) => x.energy));
  }

  const overallMean = mean(daily.map((x) => x.energy));
  const recentMean = mean(daily.slice(-14).map((x) => x.energy));
  const trendRatio = overallMean > 0 ? recentMean / overallMean : 1;
  const dailyStd = std(daily.slice(-21).map((x) => x.energy));
  const lastDate = new Date(daily[daily.length - 1].date + "T00:00:00Z");

  const points: ForecastPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const dt = new Date(lastDate.getTime() + i * 86_400_000);
    const predicted = dowAvg[dt.getUTCDay()] * trendRatio;
    const band = 1.28 * dailyStd;
    points.push({
      date: dt.toISOString().slice(0, 10),
      predicted: round(predicted, 1),
      lower: round(Math.max(0, predicted - band), 1),
      upper: round(predicted + band, 1),
    });
  }

  return { stationId, method: "seasonal_naive_x_trend", trendRatio: round(trendRatio, 3), horizonDays, points };
}

export interface Action {
  rank: number;
  priority: Severity;
  asset: string;
  action: string;
  rationale: string;
  confidence: number;
}

export function recommend(insights: Insight[], opts: { top?: number } = {}): Action[] {
  const top = opts.top ?? 5;
  return insights.slice(0, top).map((ins, i) => ({
    rank: i + 1,
    priority: ins.severity,
    asset: ins.asset,
    action: ins.recommendation,
    rationale: ins.why,
    confidence: ins.confidence,
  }));
}

export function optimise(ds: Network, fc: Forecast) {
  const st = ds.stations.find((s) => s.id === fc.stationId);
  if (!st || !fc.points.length) return null;

  const peakDay = fc.points.reduce((a, b) => (b.predicted > a.predicted ? b : a));
  const peakHourShare = Math.max(...HOUR_PROFILE) / sum(HOUR_PROFILE);
  const estPeakKw = peakDay.predicted * peakHourShare;
  const headroom = 1 - estPeakKw / st.capacityKw;
  const strained = headroom < 0.15;

  return {
    stationId: st.id,
    name: st.name,
    peakDay: peakDay.date,
    estPeakLoadKw: round(estPeakKw, 1),
    capacityKw: st.capacityKw,
    headroomPct: round(headroom * 100, 1),
    strained,
    recommendation: strained
      ? `Shift ~${Math.ceil((0.2 - headroom) * 100)}% of peak-hour sessions to the 14:00–16:00 trough to keep ${st.name} within safe capacity on ${peakDay.date}.`
      : `No action needed — ${st.name} holds ~${pct(headroom)} headroom at the forecast peak on ${peakDay.date}.`,
  };
}

// =====================================================================
// 6. NETWORK SUMMARY — headline aggregates for analytics / the assistant.
// =====================================================================
export interface NetworkSummary {
  windowDays: number;
  totalEnergyMwh: number;
  avgUtilisation: number;
  faultRatePct: number;
  peakHour: number;
  busiest: { name: string; utilisation: number };
  quietest: { name: string; utilisation: number };
  weekendVsWeekday: number;
}

export function networkSummary(ds: Network, opts: { windowDays?: number } = {}): NetworkSummary {
  const windowDays = opts.windowDays ?? 14;
  const latestTs = Math.max(...ds.readings.map((r) => r.ts));
  const win = ds.readings.filter((r) => r.ts >= latestTs - windowDays * 24 * 3_600_000);
  const online = win.filter((r) => r.online);

  const byHour = Array.from({ length: 24 }, (_, h) =>
    mean(online.filter((r) => r.hour === h).map((r) => r.utilisation)),
  );
  const peakHour = byHour.indexOf(Math.max(...byHour));

  const perStation = ds.stations.map((st) => ({
    name: st.name,
    utilisation: round(mean(online.filter((r) => r.stationId === st.id).map((r) => r.utilisation))),
  }));
  const sorted = [...perStation].sort((a, b) => b.utilisation - a.utilisation);

  const wkEnd = mean(online.filter((r) => r.dow === 0 || r.dow === 6).map((r) => r.utilisation));
  const wkDay = mean(online.filter((r) => r.dow > 0 && r.dow < 6).map((r) => r.utilisation));

  return {
    windowDays,
    totalEnergyMwh: round(sum(win.map((r) => r.energyKwh)) / 1000, 1),
    avgUtilisation: round(mean(online.map((r) => r.utilisation))),
    faultRatePct: win.length ? round((win.filter((r) => r.faulted).length / win.length) * 100, 2) : 0,
    peakHour,
    busiest: sorted[0],
    quietest: sorted[sorted.length - 1],
    weekendVsWeekday: wkDay > 0 ? round(wkEnd / wkDay, 2) : 1,
  };
}

// =====================================================================
// 7. LOAD-SHIFT OPPORTUNITY — how much peak-hour energy is flexible.
// Engine-pure (no prices); the provider multiplies shiftable kWh by the
// live price/carbon spread to quantify £ / CO2 savings.
// =====================================================================
export interface LoadShift {
  date: string;
  peakHours: number[];
  troughHours: number[];
  peakKwh: number;
  troughKwh: number;
  shiftableKwh: number;
}

export function loadShiftOpportunity(ds: Network): LoadShift {
  const ranked = HOUR_PROFILE.map((v, h) => ({ h, v }));
  const peakHours = [...ranked].sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.h);
  const troughHours = [...ranked].sort((a, b) => a.v - b.v).slice(0, 4).map((x) => x.h);

  // Rolling 24h so every hour-of-day is represented (avoids a partial "today").
  const latestTs = Math.max(...ds.readings.map((r) => r.ts));
  const win = ds.readings.filter((r) => r.ts > latestTs - 24 * 3_600_000 && r.online);

  const peakKwh = round(sum(win.filter((r) => peakHours.includes(r.hour)).map((r) => r.energyKwh)), 1);
  const troughKwh = round(sum(win.filter((r) => troughHours.includes(r.hour)).map((r) => r.energyKwh)), 1);

  return {
    date: new Date(latestTs).toISOString().slice(0, 10),
    peakHours,
    troughHours,
    peakKwh,
    troughKwh,
    shiftableKwh: round(peakKwh * 0.35, 1), // ~35% of peak load is schedulable
  };
}
