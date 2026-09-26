import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/server/providers", () => ({
  optimisation: vi.fn().mockResolvedValue({ daily_saving_gbp: 180, load_shift: { shiftableKwh: 500 }, price: { spread_pence: 12 } }),
  smartWindow: vi.fn().mockResolvedValue({ available: true, best_at: "13:30", carbon_gco2: 150, vs_avg_carbon_pct: -20 }),
  comparisonSummary: vi.fn().mockResolvedValue({ current: { energy_mwh: 48 }, deltas: { energy: 12, sessions: 8 } }),
  faultSummary: vi.fn().mockReturnValue({ faults: [{ name: "Bristol Rapid", kind: "offline", detail: "All 3 ports offline", fault_rate_pct: 0 }], rollup: {} }),
  insights: vi.fn().mockReturnValue([{ type: "underutilised", asset: "Riverside", why: "low weekday demand", recommendation: "promote off-peak", confidence: 0.8 }]),
}));
vi.mock("@/lib/ani/network", () => ({ getNetwork: () => ({ rangeDays: 60, stations: [{}, {}, {}, {}, {}, {}] }) }));

import { buildBriefing } from "@/lib/ani/briefing";

describe("buildBriefing (proactive)", () => {
  it("returns a greeting, learning line and structured priority items", async () => {
    const b = await buildBriefing();
    expect(b.greeting).toMatch(/Good (morning|afternoon|evening)\./);
    expect(b.learning_line).toMatch(/60 days/);
    expect(b.items.length).toBeGreaterThan(0);
    expect(b.items.length).toBeLessThanOrEqual(4);

    // Every item carries the explainable-AI structure.
    for (const it of b.items) {
      expect(it.observation).toBeTruthy();
      expect(it.explanation).toBeTruthy();
      expect(it.recommendation).toBeTruthy();
      expect(it.impact.confidence_pct).toBeGreaterThan(0);
    }
    // The offline fault is surfaced as a high-severity priority first.
    expect(b.items[0].severity).toBe("high");
    expect(b.items[0].observation).toMatch(/Bristol Rapid/);
    // Optimisation opportunity carries a £ impact.
    expect(b.items.some((i) => (i.impact.savings_gbp ?? 0) > 0)).toBe(true);
  });
});
