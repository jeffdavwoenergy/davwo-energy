import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/providers", () => ({
  assets: vi.fn(), forecastPayload: vi.fn(), forecastAccuracy: vi.fn(), metrics: vi.fn(), monitoring: vi.fn(),
  insights: vi.fn(), optimisation: vi.fn(), priceCurve: vi.fn(), smartWindow: vi.fn(),
}));
vi.mock("@/lib/data/regions/uk", () => ({ fetchCarbonIntensity: vi.fn(), fetchOctopusAgile: vi.fn() }));

const llmConfigured = { value: false };
const callLLMMock = vi.fn();
const callLLMStreamMock = vi.fn();
vi.mock("@/lib/server/llm", () => ({
  isLLMConfigured: () => llmConfigured.value,
  callLLM: (...args: unknown[]) => callLLMMock(...args),
  callLLMStream: (...args: unknown[]) => callLLMStreamMock(...args),
}));

import * as providers from "@/lib/server/providers";
import * as sources from "@/lib/data/regions/uk";
import { answer, streamAnswer } from "@/lib/ani/assistant";

const p = providers as unknown as Record<string, ReturnType<typeof vi.fn>>;
const s = sources as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  llmConfigured.value = false;
  s.fetchCarbonIntensity.mockResolvedValue({ intensity_gco2_kwh: 200, index: "high", generation_mix: [{ name: "gas", share: 42 }, { name: "coal", share: 0 }] });
  s.fetchOctopusAgile.mockResolvedValue({ price_per_kwh: 0.21, currency_symbol: "£", minor_unit_value: 21, minor_unit_symbol: "p", product: "AGILE" });
  p.forecastPayload.mockResolvedValue({ points: [{ time: "2026-06-28", value: 5, lower: 3, upper: 7 }], peak_mwh: 5, peak_time: "2026-06-28", confidence: 87, drivers: ["d1"], weather: {}, data_mode: "live", data_sources: [] });
  p.forecastAccuracy.mockReturnValue({
    stationsEvaluated: 6,
    stations: [],
    overallByHorizon: [
      { horizonDays: 1, n: 40, mae: 62, mape: 4, coveragePct: 97.6 },
      { horizonDays: 7, n: 40, mae: 99.8, mape: 9, coveragePct: 92.9 },
    ],
  });
  p.monitoring.mockReturnValue({ stationsOnline: 6, stationsTotal: 6, asOf: "now", stations: [{ stationId: "ST-01", name: "Westfield Hub", status: "healthy", portsOnline: 4, portsTotal: 4, currentUtilisation: 0.5, currentLoadKw: 20 }] });
  p.assets.mockReturnValue([{ id: "ST-01", name: "Westfield Hub", status: "healthy", ports: 4, capacity_kw: 400, utilisation_pct: 50, current_load_kw: 20 }]);
  p.insights.mockReturnValue([{ type: "capacity_risk", severity: "high", asset: "Westfield Hub (ST-01)", metric: { name: "x", value: 1, window: "14d" }, recommendation: "Add a port", confidence: 0.9, why: "saturated" }]);
  p.metrics.mockResolvedValue({ energy_consumption_mwh: 7.5, average_cost_per_kwh: 0.21, charging_sessions: 200, carbon_intensity_gco2_kwh: 200, today_summary: { co2_avoided_tco2: 0.2 }, data_mode: "live" });
  p.optimisation.mockResolvedValue({ daily_saving_gbp: 200, annual_saving_gbp: 73000, price: { cheapest_at: "13:30" }, load_shift: { shiftableKwh: 600 }, data_mode: "live" });
  p.priceCurve.mockResolvedValue({ points: [{ time: "13:00", value: 18 }], data_mode: "live" });
  p.smartWindow.mockResolvedValue({ available: true, best_at: "13:30", price_pence: 17, carbon_gco2: 150, vs_avg_price_pct: -20, vs_avg_carbon_pct: -30 });
});

describe("assistant capability routing (deterministic)", () => {
  it("carbon", async () => {
    const r = await answer("what is the grid carbon right now");
    expect(r.mode).toBe("deterministic");
    expect(r.blocks.some((b) => b.type === "kpis")).toBe(true);
  });
  it("carbon unavailable", async () => {
    s.fetchCarbonIntensity.mockResolvedValue(null);
    const r = await answer("carbon intensity");
    expect(JSON.stringify(r.blocks)).toMatch(/unavailable/);
  });
  it("pricing + unavailable", async () => {
    expect((await answer("electricity price")).capabilities).toContain("pricing");
    s.fetchOctopusAgile.mockResolvedValue(null);
    expect(JSON.stringify((await answer("tariff cost")).blocks)).toMatch(/unavailable/);
  });
  it("generation mix + empty", async () => {
    expect((await answer("what is powering the grid generation")).blocks.some((b) => b.type === "chart")).toBe(true);
    s.fetchCarbonIntensity.mockResolvedValue({ intensity_gco2_kwh: 200, index: "x", generation_mix: [] });
    expect(JSON.stringify((await answer("fuel mix")).blocks)).toMatch(/unavailable/);
  });
  it("forecast_accuracy: backtested error/coverage, and honest no-history fallback", async () => {
    const r = await answer("how accurate is the forecast, can I trust it");
    expect(r.capabilities).toContain("forecast_accuracy");
    expect(r.blocks.some((b) => b.type === "chart")).toBe(true);
    expect(JSON.stringify(r.blocks)).toMatch(/4%/);

    p.forecastAccuracy.mockReturnValue({ stationsEvaluated: 0, stations: [], overallByHorizon: [] });
    expect(JSON.stringify((await answer("is the forecast reliable")).blocks)).toMatch(/enough history/);
  });
  it("forecast, monitoring, assets, insights", async () => {
    expect((await answer("demand forecast")).capabilities).toContain("forecast");
    expect((await answer("station utilisation status")).capabilities).toContain("monitoring");
    expect((await answer("asset register inventory")).capabilities).toContain("assets");
    expect((await answer("any problems or issues")).capabilities).toContain("insights");
  });
  it("insights empty branch", async () => {
    p.insights.mockReturnValue([]);
    expect(JSON.stringify((await answer("issues")).blocks)).toMatch(/healthy/);
  });
  it("optimise (with smart window) + summary default", async () => {
    const opt = await answer("cheapest time to charge to save");
    expect(opt.capabilities).toContain("optimise");
    expect(JSON.stringify(opt.blocks)).toMatch(/smartest/);
    // no keyword match -> summary
    expect((await answer("zzz")).capabilities).toContain("summary");
  });
  it("optimise without smart window", async () => {
    p.smartWindow.mockResolvedValue({ available: false });
    p.priceCurve.mockResolvedValue({ data_mode: "synthetic" });
    const r = await answer("optimise savings");
    expect(r.capabilities).toContain("optimise");
  });
});

describe("assistant narration (LLM)", () => {
  it("uses the LLM when configured", async () => {
    llmConfigured.value = true;
    callLLMMock.mockResolvedValue("Here is the live picture.");
    const r = await answer("network overview");
    expect(r.mode).toBe("live-llm");
    expect(r.blocks[0]).toMatchObject({ type: "text", text: "Here is the live picture." });
    expect(callLLMMock).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("network overview"), 220);
  });
  it("falls back to the deterministic template when the LLM returns null", async () => {
    llmConfigured.value = true;
    callLLMMock.mockResolvedValue(null);
    expect((await answer("overview")).mode).toBe("deterministic");
  });
  it("never calls the LLM when not configured", async () => {
    const r = await answer("overview");
    expect(r.mode).toBe("deterministic");
    expect(callLLMMock).not.toHaveBeenCalled();
  });
});

describe("streamAnswer (streaming narration)", () => {
  it("streams narration deltas and returns the accumulated text as the final intro", async () => {
    llmConfigured.value = true;
    callLLMStreamMock.mockImplementation(async (_sys: string, _usr: string, _max: number, onDelta: (c: string) => void) => {
      onDelta("Here ");
      onDelta("is the live picture.");
      return "Here is the live picture.";
    });

    const chunks: string[] = [];
    const r = await streamAnswer("network overview", undefined, (c) => chunks.push(c));

    expect(chunks.join("")).toBe("Here is the live picture.");
    expect(r.mode).toBe("live-llm");
    expect(r.blocks[0]).toMatchObject({ type: "text", text: "Here is the live picture." });
  });

  it("falls back to the deterministic intro via onDelta when no key is configured", async () => {
    const chunks: string[] = [];
    const r = await streamAnswer("network overview", undefined, (c) => chunks.push(c));
    expect(r.mode).toBe("deterministic");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(r.blocks[0].type === "text" ? r.blocks[0].text : "");
    expect(callLLMStreamMock).not.toHaveBeenCalled();
  });

  it("falls back to deterministic (sending the template via onDelta) when the stream returns null", async () => {
    llmConfigured.value = true;
    callLLMStreamMock.mockResolvedValue(null);
    const chunks: string[] = [];
    const r = await streamAnswer("overview", undefined, (c) => chunks.push(c));
    expect(r.mode).toBe("deterministic");
    expect(chunks).toHaveLength(1);
  });

  it("preserves partial narration already streamed when the stream ends early, instead of re-sending the full deterministic template on top of it", async () => {
    llmConfigured.value = true;
    callLLMStreamMock.mockImplementation(async (_sys: string, _usr: string, _max: number, onDelta: (c: string) => void) => {
      onDelta("Partial narration before the drop.");
      return "Partial narration before the drop.";
    });

    const chunks: string[] = [];
    const r = await streamAnswer("overview", undefined, (c) => chunks.push(c));

    // The partial text streamed once via onDelta before the drop...
    expect(chunks).toEqual(["Partial narration before the drop."]);
    // ...and the deterministic template must NOT be sent as a second,
    // duplicate delta on top of it.
    expect(r.mode).toBe("live-llm");
    expect(r.blocks[0]).toMatchObject({ type: "text", text: "Partial narration before the drop." });
  });
});

describe("context-aware routing", () => {
  it("biases a vague question to the page's capability", async () => {
    // "tell me about this" matches no keywords → context decides.
    expect((await answer("tell me about this", "/forecasting")).capabilities).toContain("forecast");
    expect((await answer("what's going on", "/assets")).capabilities).toContain("assets");
    expect((await answer("anything?", "/monitoring")).capabilities).toContain("monitoring");
  });
  it("explicit keywords still win over context", async () => {
    expect((await answer("what is the grid carbon", "/assets")).capabilities).toContain("carbon");
  });
  it("defaults to summary with no keyword and no context", async () => {
    expect((await answer("hello there")).capabilities).toContain("summary");
  });
  it("contextCapabilityId maps known routes", async () => {
    const { contextCapabilityId } = await import("@/lib/ani/assistant");
    expect(contextCapabilityId("/forecasting")).toBe("forecast");
    expect(contextCapabilityId("/marketplace/vendor-x")).toBe("insights");
    expect(contextCapabilityId("/unknown")).toBeUndefined();
    expect(contextCapabilityId(undefined)).toBeUndefined();
  });
});
