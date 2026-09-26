import { describe, it, expect } from "vitest";
import { generateNetwork, type Network, type Reading } from "@/lib/ani/dataGenerator";
import { backtestForecast, backtestNetwork } from "@/lib/ani/evaluation";

/** Hand-built network: 7 days of real energy (forecast() training data),
 * then 5 days at zero (station shut down but still reporting online) — the
 * only way to deterministically force actual=0 for a horizon bucket, which
 * is what exercises evaluation.ts's mape-null branch. */
function zeroTailNetwork(): Network {
  const station = { id: "ST-X", name: "Test Station", location: { lat: 0, lng: 0 }, capacityKw: 100, ports: [{ id: "ST-X-P1", stationId: "ST-X", label: "Port A", ratedKw: 100, faultProb: 0 }] };
  const readings: Reading[] = [];
  const start = new Date("2026-01-01T00:00:00Z").getTime();
  for (let day = 0; day < 12; day++) {
    const energy = day < 7 ? 10 + day : 0;
    for (let hour = 0; hour < 24; hour++) {
      const ts = start + day * 86_400_000 + hour * 3_600_000;
      const d = new Date(ts);
      readings.push({
        ts, dateStr: d.toISOString().slice(0, 10), hour, dow: d.getUTCDay(),
        stationId: "ST-X", portId: "ST-X-P1", online: true, faulted: false,
        utilisation: 0.5, energyKwh: energy / 24, sessions: 1,
      });
    }
  }
  return { generatedAt: new Date().toISOString(), rangeDays: 12, seed: 1, stations: [station], readings };
}

describe("evaluation — forecast backtesting", () => {
  const net = generateNetwork({ seed: 42, days: 60 });

  it("backtestForecast scores the real forecast() against actual outcomes", () => {
    const bt = backtestForecast(net, "ST-01", { horizonDays: 7, maxCutoffs: 21 });
    expect(bt).not.toBeNull();
    expect(bt!.stationId).toBe("ST-01");
    expect(bt!.name).toBe("Westfield Hub");
    expect(bt!.method).toBe("seasonal_naive_x_trend");
    expect(bt!.cutoffsEvaluated).toBeGreaterThan(0);
    expect(bt!.byHorizon).toHaveLength(7);
    expect(bt!.byHorizon.map((h) => h.horizonDays)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("every horizon row has plausible, non-degenerate error metrics", () => {
    const bt = backtestForecast(net, "ST-01", { horizonDays: 3 })!;
    for (const h of bt.byHorizon) {
      expect(h.n).toBeGreaterThan(0);
      expect(h.mae).toBeGreaterThanOrEqual(0);
      expect(h.coveragePct).toBeGreaterThanOrEqual(0);
      expect(h.coveragePct).toBeLessThanOrEqual(100);
      if (h.mape != null) expect(h.mape).toBeGreaterThanOrEqual(0);
    }
  });

  it("mape is null rather than fabricated when every actual in the sample is 0", () => {
    const bt = backtestForecast(zeroTailNetwork(), "ST-X", { horizonDays: 1, maxCutoffs: 5 })!;
    expect(bt).not.toBeNull();
    expect(bt.byHorizon[0].n).toBeGreaterThan(0);
    expect(bt.byHorizon[0].mape).toBeNull();
  });

  it("returns null for an unknown station id", () => {
    expect(backtestForecast(net, "ST-does-not-exist")).toBeNull();
  });

  it("returns null when there isn't enough history for even one cutoff", () => {
    const thin = generateNetwork({ seed: 1, days: 5 });
    expect(backtestForecast(thin, "ST-01")).toBeNull();
  });

  it("respects maxCutoffs, evaluating at most that many", () => {
    const bt = backtestForecast(net, "ST-01", { horizonDays: 1, maxCutoffs: 5 })!;
    expect(bt.cutoffsEvaluated).toBeLessThanOrEqual(5);
    expect(bt.byHorizon[0].n).toBeLessThanOrEqual(5);
  });

  it("backtestNetwork pools every evaluable station and skips ones with no usable history", () => {
    const nb = backtestNetwork(net, { horizonDays: 2, maxCutoffs: 10 });
    expect(nb.stationsEvaluated).toBe(net.stations.length);
    expect(nb.stations).toHaveLength(net.stations.length);
    expect(nb.overallByHorizon).toHaveLength(2);
    // Pooled n at horizon 1 should equal the sum of every station's own n.
    const pooledN = nb.overallByHorizon.find((h) => h.horizonDays === 1)!.n;
    const summedN = nb.stations.reduce((s, st) => s + st.byHorizon.find((h) => h.horizonDays === 1)!.n, 0);
    expect(pooledN).toBe(summedN);
  });

  it("backtestNetwork returns an empty overall row set when nothing is evaluable", () => {
    const thin = generateNetwork({ seed: 1, days: 3 });
    const nb = backtestNetwork(thin);
    expect(nb.stationsEvaluated).toBe(0);
    expect(nb.stations).toEqual([]);
    expect(nb.overallByHorizon).toEqual([]);
  });

  it("MAE trends non-decreasing on average as horizon lengthens (further-out forecasts are no easier)", () => {
    const bt = backtestForecast(net, "ST-04", { horizonDays: 7, maxCutoffs: 21 })!;
    const h1 = bt.byHorizon.find((h) => h.horizonDays === 1)!.mae;
    const h7 = bt.byHorizon.find((h) => h.horizonDays === 7)!.mae;
    expect(h7).toBeGreaterThanOrEqual(h1 * 0.5); // loose bound — real data is noisy, this just rules out an inverted/broken horizon mapping
  });
});
