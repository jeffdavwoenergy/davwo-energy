// Model evaluation — Week 6 of the technical directive ("ANI™ Intelligence
// Foundation") names this as one of six required focus areas, and today
// nothing in this codebase measures whether ANI's forecast is actually
// accurate: `confidence` on both Insight and Forecast is a function of
// sample size (see engine.ts), never of measured predictive accuracy. This
// module closes that specific gap for the forecast model — the one output
// with an unambiguous ground truth (a day's actual energy either matches the
// prediction or it doesn't) — via honest walk-forward backtesting against
// the exact production `forecast()` function, not a reimplementation of it.
//
// Deliberately NOT covered here: calibrating Insight.confidence (capacity
// risk / rising demand / underutilised / recurring fault). Those don't have
// an automatic, unambiguous "did it happen" signal in this synthetic
// dataset — scoring them would mean inventing a success criterion, which
// this codebase's data sources (see src/lib/data/regions/us.ts's honest
// nulls) deliberately avoid doing. That's real Week 6/7 architecture work
// for Jeff/Amirreza, not something to fabricate here.

import { forecast } from "./engine";
import type { Network, Reading } from "./dataGenerator";

const round = (x: number, n = 2) => +x.toFixed(n);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

interface DailyTotal {
  date: string;
  energy: number;
}

function dailyTotals(readings: Reading[], stationId: string): DailyTotal[] {
  const byDate = new Map<string, number>();
  for (const r of readings) {
    if (r.stationId !== stationId || !r.online) continue;
    byDate.set(r.dateStr, (byDate.get(r.dateStr) ?? 0) + r.energyKwh);
  }
  return [...byDate.entries()].map(([date, energy]) => ({ date, energy })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface HorizonAccuracy {
  /** Days ahead of the cutoff this forecast point was for (1 = next day). */
  horizonDays: number;
  /** How many cutoff/actual pairs contributed to this row. */
  n: number;
  /** Mean absolute error, kWh. */
  mae: number;
  /** Mean absolute percentage error — null when every actual in the sample was 0 (undefined %). */
  mape: number | null;
  /** % of actuals that fell within the forecast's own [lower, upper] band —
   * the real test of whether the band means what it claims. */
  coveragePct: number;
}

export interface StationBacktest {
  stationId: string;
  name: string;
  method: string;
  cutoffsEvaluated: number;
  byHorizon: HorizonAccuracy[];
}

interface RawPoint { horizonDays: number; predicted: number; actual: number; lower: number; upper: number; method: string }

/** Walks backward through a station's history and, at each usable cutoff
 * date, calls the real `forecast()` seeing only data up to that date —
 * scoring its predictions against what the (un-truncated) network shows
 * actually happened next. This is the one shared implementation both
 * per-station and network-wide backtests build on, so there's exactly one
 * place that knows how to run the walk-forward simulation. */
function walkForward(ds: Network, stationId: string, horizonDays: number, maxCutoffs: number): RawPoint[] {
  const daily = dailyTotals(ds.readings, stationId);
  // A cutoff at index i needs >=7 prior days (forecast()'s own minimum) and
  // `horizonDays` further actual days after it to score against.
  const firstUsable = 6;
  const lastUsable = daily.length - 1 - horizonDays;
  if (lastUsable < firstUsable) return [];

  const cutoffIdxs: number[] = [];
  for (let i = firstUsable; i <= lastUsable; i++) cutoffIdxs.push(i);
  const chosen = cutoffIdxs.slice(-maxCutoffs);

  const raw: RawPoint[] = [];
  for (const i of chosen) {
    const cutoffDate = daily[i].date;
    // Exclusive-of-future-days snapshot: only readings on or before the
    // cutoff date are visible to forecast() for this walk-forward step.
    const cutoffTs = Math.max(...ds.readings.filter((r) => r.dateStr === cutoffDate).map((r) => r.ts));
    const snapshot: Network = { ...ds, readings: ds.readings.filter((r) => r.ts <= cutoffTs) };
    const fc = forecast(snapshot, stationId, { horizonDays });
    if (!fc.points.length) continue;
    for (const [h, point] of fc.points.entries()) {
      const actualRow = daily.find((d) => d.date === point.date);
      if (!actualRow) continue;
      raw.push({ horizonDays: h + 1, predicted: point.predicted, actual: actualRow.energy, lower: point.lower, upper: point.upper, method: fc.method });
    }
  }
  return raw;
}

function rollUp(points: RawPoint[]): HorizonAccuracy[] {
  const byH = new Map<number, RawPoint[]>();
  for (const p of points) {
    if (!byH.has(p.horizonDays)) byH.set(p.horizonDays, []);
    byH.get(p.horizonDays)!.push(p);
  }
  return [...byH.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([horizonDays, rows]) => {
      const abs = rows.map((r) => Math.abs(r.predicted - r.actual));
      const pctRows = rows.filter((r) => r.actual > 0).map((r) => Math.abs(r.predicted - r.actual) / r.actual);
      const inBand = rows.filter((r) => r.actual >= r.lower && r.actual <= r.upper).length;
      return {
        horizonDays,
        n: rows.length,
        mae: round(mean(abs), 1),
        mape: pctRows.length ? round(mean(pctRows) * 100, 1) : null,
        coveragePct: round((inBand / rows.length) * 100, 1),
      };
    });
}

/** Walk-forward backtest for one station. Returns null when there isn't
 * enough history to evaluate at least one cutoff. */
export function backtestForecast(
  ds: Network,
  stationId: string,
  opts: { horizonDays?: number; maxCutoffs?: number } = {},
): StationBacktest | null {
  const horizonDays = opts.horizonDays ?? 7;
  const maxCutoffs = opts.maxCutoffs ?? 21;
  const station = ds.stations.find((s) => s.id === stationId);
  if (!station) return null;

  const raw = walkForward(ds, stationId, horizonDays, maxCutoffs);
  if (!raw.length) return null;

  return {
    stationId,
    name: station.name,
    method: raw[0].method,
    cutoffsEvaluated: raw.filter((r) => r.horizonDays === 1).length,
    byHorizon: rollUp(raw),
  };
}

export interface NetworkBacktest {
  stationsEvaluated: number;
  stations: StationBacktest[];
  /** Pooled across every station's raw predictions — the headline "how good
   * is ANI's forecast" number, not an average of per-station averages (which
   * would let a thinly-evaluated station skew the network figure as much as
   * a thoroughly-evaluated one). */
  overallByHorizon: HorizonAccuracy[];
}

export function backtestNetwork(ds: Network, opts: { horizonDays?: number; maxCutoffs?: number } = {}): NetworkBacktest {
  const horizonDays = opts.horizonDays ?? 7;
  const maxCutoffs = opts.maxCutoffs ?? 21;

  const stations: StationBacktest[] = [];
  const pooled: RawPoint[] = [];
  for (const st of ds.stations) {
    const raw = walkForward(ds, st.id, horizonDays, maxCutoffs);
    if (raw.length) {
      stations.push({
        stationId: st.id,
        name: st.name,
        method: raw[0].method,
        cutoffsEvaluated: raw.filter((r) => r.horizonDays === 1).length,
        byHorizon: rollUp(raw),
      });
      pooled.push(...raw);
    }
  }

  return {
    stationsEvaluated: stations.length,
    stations,
    overallByHorizon: pooled.length ? rollUp(pooled) : [],
  };
}
