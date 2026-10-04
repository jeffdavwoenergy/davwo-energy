import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildWorkspace, savePilot, OBJECTIVES, type InfraProfile } from "@/lib/server/pilot";
import { isDbConfigured } from "@/lib/server/prisma";
import { createProduct } from "@/lib/server/products";

const base: InfraProfile = {
  organisation: "Northbridge Mobility",
  region: "Manchester",
  evChargers: 12,
  solarKw: 50,
  batteryKwh: 0,
  smartMeters: 2,
  objectives: ["cut-costs", "reduce-carbon"],
};

describe("pilot workspace generation", () => {
  it("builds a populated workspace with a positive ROI estimate and insights", async () => {
    const ws = await buildWorkspace(base);
    expect(ws.id).toMatch(/^pilot-/);
    expect(ws.organisation).toBe("Northbridge Mobility");
    expect(ws.profileSummary).toContain("12 EV charge points");
    expect(ws.estimated.annualSavingGbp).toBeGreaterThan(0);
    expect(ws.estimated.annualCo2SavingT).toBeGreaterThan(0);
    expect(ws.insights.length).toBeGreaterThan(0);
    expect(ws.dataMode).toBe("simulated");
  });

  it("recommends storage when there is solar but no battery", async () => {
    const ws = await buildWorkspace(base);
    expect(ws.insights.some((i) => /storage/i.test(i.title))).toBe(true);
    expect(ws.recommendedPartners.some((p) => p.category === "battery")).toBe(true);
  });

  it("matches partner categories to assets and objectives", async () => {
    const ws = await buildWorkspace(base);
    const cats = ws.recommendedPartners.map((p) => p.category);
    expect(cats).toContain("ev-chargers"); // has chargers
    expect(cats).toContain("solar");        // has solar
    expect(cats).toContain("energy-services"); // cut-costs / reduce-carbon
    // Each points at a real listing (the demo suppliers' catalogue) or a curated partner.
    ws.recommendedPartners.forEach((p) => expect(p.productId ?? p.vendor).toBeTruthy());
  });

  it("never returns an empty workspace, even with no assets or objectives", async () => {
    const ws = await buildWorkspace({ organisation: "Empty Co", evChargers: 0, solarKw: 0, batteryKwh: 0, smartMeters: 0, objectives: [] });
    expect(ws.insights.length).toBeGreaterThan(0);
    expect(ws.profileSummary).toContain("no assets registered yet");
  });

  it("grow-revenue and compliance objectives surface tailored insights + consulting partner", async () => {
    const ws = await buildWorkspace({ ...base, objectives: ["grow-revenue", "compliance"] });
    expect(ws.insights.some((i) => /revenue|SECR|ESOS/i.test(i.title))).toBe(true);
    expect(ws.recommendedPartners.some((p) => p.category === "consulting")).toBe(true);
  });

  it("OBJECTIVES catalogue is well-formed", () => {
    expect(OBJECTIVES.length).toBe(5);
    expect(OBJECTIVES.every((o) => o.id && o.label)).toBe(true);
  });

  it("recommendedPartners resolves to a real marketplace product when a supplier has listed one in that category", async () => {
    const product = await createProduct({
      vendorId: "v-pilot-test", name: "Rapid 50 DC Charger", category: "ev-chargers",
      summary: "50kW rapid charger", description: "Depot-grade DC rapid charging.",
    });
    const ws = await buildWorkspace(base);
    const evPartner = ws.recommendedPartners.find((p) => p.category === "ev-chargers");
    expect(evPartner?.productId).toBe(product.id);
    expect(evPartner?.productName).toBe("Rapid 50 DC Charger");
    expect(evPartner?.vendor).toBeUndefined(); // real listing takes priority over the static fallback

    // A category with no real listing (consulting) still falls back to the curated vendor.
    const withConsulting = await buildWorkspace({ ...base, objectives: ["compliance"] });
    const consultingPartner = withConsulting.recommendedPartners.find((p) => p.category === "consulting");
    expect(consultingPartner?.productId).toBeUndefined();
    expect(consultingPartner?.vendor).toBeTruthy();
  });
});

describe("savePilot (no DB configured)", () => {
  it("returns false without throwing", async () => {
    expect(isDbConfigured()).toBe(false);
    const ws = await buildWorkspace(base);
    expect(await savePilot(base, ws, "prospect")).toBe(false);
  });
});

describe("savePilot (Postgres-backed)", () => {
  beforeEach(() => vi.resetModules());
  it("persists and returns true", async () => {
    const inserted: Record<string, unknown>[] = [];
    vi.doMock("@/lib/server/prisma", () => ({
      isDbConfigured: () => true,
      getPrisma: () => ({
        pilotProfile: { create: async ({ data }: { data: Record<string, unknown> }) => { inserted.push(data); } },
        product: { findMany: async () => [] },
      }),
    }));
    const mod = await import("@/lib/server/pilot");
    const ws = await mod.buildWorkspace(base);
    expect(await mod.savePilot(base, ws, "davwo")).toBe(true);
    expect(inserted).toHaveLength(1);
    vi.doUnmock("@/lib/server/prisma");
  });
});
