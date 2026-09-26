import { describe, it, expect, vi } from "vitest";

// Force the engine to surface no insights so recommendation() takes its
// defensive "healthy — no action" fallback (unreachable with the normal
// always-populated synthetic network).
vi.mock("@/lib/ani/engine", async (orig) => {
  const actual = await orig<typeof import("@/lib/ani/engine")>();
  return { ...actual, recommend: () => [] };
});

describe("recommendation fallback", () => {
  it("returns a healthy no-action card when there are no insights", async () => {
    const { recommendation } = await import("@/lib/server/providers");
    const r = recommendation();
    expect(r.action).toMatch(/no action/i);
    expect(r.estimated_savings_gbp).toBe(0);
  });
});
