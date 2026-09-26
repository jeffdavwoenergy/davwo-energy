import { describe, it, expect } from "vitest";
import { createRng, mulberry32 } from "@/lib/ani/rng";
import { generateNetwork, HOUR_PROFILE, STATION_BLUEPRINTS } from "@/lib/ani/dataGenerator";
import {
  monitor, analyse, forecast, recommend, optimise, networkSummary, loadShiftOpportunity,
} from "@/lib/ani/engine";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    expect(createRng(1).next()).toBe(createRng(1).next());
  });
  it("covers helpers", () => {
    const r = createRng(7);
    expect(r.range(0, 10)).toBeGreaterThanOrEqual(0);
    expect(r.int(1, 1)).toBe(1);
    expect(typeof r.chance(0.5)).toBe("boolean");
    expect(typeof r.normal()).toBe("number");
    expect(["a", "b"]).toContain(r.pick(["a", "b"]));
    expect(typeof mulberry32(3)()).toBe("number");
    expect(typeof createRng().normal()).toBe("number");
  });
});

describe("dataGenerator", () => {
  it("builds a stable network", () => {
    const net = generateNetwork({ seed: 42, days: 30 });
    expect(net.stations.length).toBe(STATION_BLUEPRINTS.length);
    expect(net.readings.length).toBeGreaterThan(0);
    expect(HOUR_PROFILE.length).toBe(24);
    expect(generateNetwork({ seed: 42, days: 30 }).readings.length).toBe(net.readings.length);
  });
  it("uses defaults + endDate", () => {
    expect(generateNetwork({ endDate: new Date("2026-06-01T12:00:00Z") }).rangeDays).toBe(60);
  });
  it("covers weekend + weekday profiles", () => {
    const dows = new Set(generateNetwork({ seed: 1, days: 14 }).readings.map((r) => r.dow));
    expect(dows.has(0)).toBe(true);
    expect(dows.has(6)).toBe(true);
  });
});

describe("engine", () => {
  const net = generateNetwork({ seed: 42, days: 30 });

  it("monitor returns station snapshot", () => {
    const m = monitor(net);
    expect(m.stations.length).toBe(net.stations.length);
    expect(["healthy", "degraded", "down"]).toContain(m.stations[0].status);
  });

  it("analyse emits insights within bounds (both window args)", () => {
    for (const i of analyse(net, { windowDays: 14 })) expect(i.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(analyse(net))).toBe(true);
  });

  it("forecast produces a band + handles defaults and insufficient data", () => {
    const f = forecast(net, "ST-01", { horizonDays: 7 });
    expect(f.points.length).toBe(7);
    expect(f.points[0].upper).toBeGreaterThanOrEqual(f.points[0].lower);
    expect(forecast(net, "ST-01").points.length).toBe(14);
    expect(forecast(generateNetwork({ seed: 1, days: 3 }), "ST-01").method).toBe("insufficient_data");
  });

  it("recommend ranks insights", () => {
    const ins = analyse(net);
    expect(recommend(ins, { top: 3 }).length).toBeLessThanOrEqual(3);
    expect(recommend(ins).length).toBeLessThanOrEqual(5);
  });

  it("optimise: ok, null, and strained branches", () => {
    const o = optimise(net, forecast(net, "ST-01", { horizonDays: 7 }));
    expect(o!.capacityKw).toBeGreaterThan(0);
    expect(optimise(net, { stationId: "NOPE", method: "x", points: [] })).toBeNull();
    expect(optimise(net, { stationId: "ST-01", method: "x", points: [] })).toBeNull();
    const strained = optimise(net, { stationId: "ST-02", method: "x", points: [{ date: "2026-07-01", predicted: 99999, lower: 0, upper: 99999 }] });
    expect(strained!.strained).toBe(true);
    expect(strained!.recommendation).toMatch(/Shift/);
  });

  it("networkSummary + loadShiftOpportunity", () => {
    const s = networkSummary(net, { windowDays: 14 });
    expect(s.busiest.utilisation).toBeGreaterThanOrEqual(s.quietest.utilisation);
    expect(networkSummary(net).windowDays).toBe(14);
    const ls = loadShiftOpportunity(net);
    expect(ls.peakHours.length).toBe(3);
    expect(ls.troughHours.length).toBe(4);
    expect(ls.shiftableKwh).toBeGreaterThanOrEqual(0);
  });
});
