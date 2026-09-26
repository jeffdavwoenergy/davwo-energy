import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/data/regions/uk", () => ({
  fetchCarbonIntensity: vi.fn(),
  fetchCarbonForecast: vi.fn(),
  fetchOctopusAgile: vi.fn(),
  fetchOctopusWindow: vi.fn(),
  fetchWeather: vi.fn(),
  fetchChargePoints: vi.fn(),
  GRID_BASELINE_GCO2: 233,
}));

// Distinct fixture values from the uk mock above so market-dispatch tests can
// tell "got the US provider set" apart from "got UK by accident".
vi.mock("@/lib/data/regions/us", () => ({
  fetchCarbonIntensity: vi.fn(),
  fetchCarbonForecast: vi.fn(),
  fetchPricing: vi.fn(),
  fetchPriceWindow: vi.fn(),
  fetchWeather: vi.fn(),
  fetchChargePoints: vi.fn(),
  GRID_BASELINE_GCO2: 380,
}));

// Just enough of orgs.ts for resolveTenant() (tenants.ts) to resolve a market
// for a dynamically-created test org — no DB, same in-memory shape as the
// real store, controlled per-test via usOrgs.set(...).
const usOrgs = new Map<string, { id: string; name: string; slug: string; market: string }>();
vi.mock("@/lib/server/orgs", () => ({
  findOrg: async (id: string) => usOrgs.get(id),
}));

const sendEmailMock = vi.fn();
let emailConfigured = false;
vi.mock("@/lib/server/email", () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  emailShell: (title: string, body: string) => `<div>${title}${body}</div>`,
  escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
}));

import * as sources from "@/lib/data/regions/uk";
import * as usSources from "@/lib/data/regions/us";
import * as providers from "@/lib/server/providers";
import { createUser, updatePreferences } from "@/lib/server/users";
import { ingestReading } from "@/lib/server/assetReadings";

const m = sources as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mUs = usSources as unknown as Record<string, ReturnType<typeof vi.fn>>;

const window24 = Array.from({ length: 48 }, (_, i) => ({
  valid_from: `2026-06-27T${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00Z`,
  pence: 10 + (i % 24),
}));
const carbon24 = window24.map((w) => ({ from: w.valid_from, gco2: 100 + (Number(w.valid_from.slice(11, 13)) % 12) * 5 }));

beforeEach(() => {
  vi.clearAllMocks();
  usOrgs.clear();
  emailConfigured = false;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true, id: "em_1" });
  m.fetchCarbonIntensity.mockResolvedValue({ intensity_gco2_kwh: 200, index: "high", generation_mix: [{ name: "gas", share: 42 }] });
  m.fetchOctopusAgile.mockResolvedValue({ price_per_kwh: 0.21, currency_symbol: "£", minor_unit_value: 21, minor_unit_symbol: "p", valid_from: "x", product: "AGILE" });
  m.fetchOctopusWindow.mockResolvedValue(window24);
  m.fetchCarbonForecast.mockResolvedValue(carbon24);
  m.fetchWeather.mockResolvedValue({ temp_min_c: 5, temp_max_c: 10, peak_solar_wm2: 400, drivers: ["d1", "d2"] });
  m.fetchChargePoints.mockResolvedValue([{ site: "X", lat: 51, lng: -1, status: "operational", active_sessions: 2 }]);
  mUs.fetchCarbonIntensity.mockResolvedValue({ intensity_gco2_kwh: 350, index: "moderate", generation_mix: [{ name: "natural gas", share: 60 }] });
  mUs.fetchPricing.mockResolvedValue({ price_per_kwh: 0.16, currency_symbol: "$", minor_unit_value: 16, minor_unit_symbol: "¢", valid_from: "2026-08-01", product: "EIA retail (US/RES)" });
  mUs.fetchPriceWindow.mockResolvedValue(null);
  mUs.fetchCarbonForecast.mockResolvedValue(null);
  mUs.fetchWeather.mockResolvedValue({ temp_min_c: 12, temp_max_c: 22, peak_solar_wm2: 500, drivers: ["us-d1"] });
  mUs.fetchChargePoints.mockResolvedValue([{ site: "US Site", lat: 38.9, lng: -77.0, status: "operational", active_sessions: 1 }]);
});

describe("providers — live overlays", () => {
  it("metrics blends live cost + carbon", async () => {
    const r = await providers.metrics();
    expect(r.average_cost_per_kwh).toBe(0.21);
    expect(r.carbon_intensity_gco2_kwh).toBe(200);
    expect(r.data_mode).toBe("live");
    expect(r.data_sources).toContain("octopus_agile");
  });
  it("metrics falls back to synthetic when sources are down", async () => {
    m.fetchCarbonIntensity.mockResolvedValue(null);
    m.fetchOctopusAgile.mockResolvedValue(null);
    const r = await providers.metrics();
    expect(r.data_mode).toBe("synthetic");
    expect(r.carbon_intensity_gco2_kwh).toBeUndefined();
  });
  it("energySeries periods", async () => {
    const org = `org-energy-series-${Math.random()}`;
    expect((await providers.energySeries(org, "day")).length).toBe(24);
    expect((await providers.energySeries(org, "week")).length).toBe(7);
    expect((await providers.energySeries(org, "month")).length).toBe(4);
    expect((await providers.energySeries(org)).length).toBe(24);
  });
  it("energySeries blends real asset readings into the synthetic total for the matching bucket", async () => {
    const { createAsset } = providers;
    const org = `org-energy-real-${Math.random()}`;
    const asset = await createAsset(org, { name: "Real Depot Charger", type: "EV Charger", site: "Leeds", capacity_kw: 50 });

    const before = await providers.energySeries(org, "day");
    const totalBefore = before.reduce((s, p) => s + p.value, 0);

    // A reading "now" (falls in the current/last hourly bucket) with a large,
    // easily-detectable energy value.
    const { ingestReading } = await import("@/lib/server/assetReadings");
    await ingestReading(org, asset.id, { energy_kwh: 5000, recorded_at: new Date().toISOString() });

    const after = await providers.energySeries(org, "day");
    const totalAfter = after.reduce((s, p) => s + p.value, 0);
    expect(totalAfter).toBeGreaterThan(totalBefore);
    expect(totalAfter - totalBefore).toBeCloseTo(5, 1); // 5000 kWh = 5 MWh
  });

  it("energySeries blends real readings into the month view too", async () => {
    const { createAsset } = providers;
    const org = `org-energy-real-month-${Math.random()}`;
    const asset = await createAsset(org, { name: "Real Depot Charger", type: "EV Charger", site: "Leeds", capacity_kw: 50 });

    const before = await providers.energySeries(org, "month");
    const totalBefore = before.reduce((s, p) => s + p.value, 0);

    const { ingestReading } = await import("@/lib/server/assetReadings");
    await ingestReading(org, asset.id, { energy_kwh: 3000, recorded_at: new Date().toISOString() });

    const after = await providers.energySeries(org, "month");
    const totalAfter = after.reduce((s, p) => s + p.value, 0);
    expect(totalAfter).toBeGreaterThan(totalBefore);
    expect(totalAfter - totalBefore).toBeCloseTo(3, 1); // 3000 kWh = 3 MWh
  });

  it("recommendation returns a card", () => {
    const r = providers.recommendation();
    expect(r.title).toMatch(/ANI/);
    expect(r.confidence_pct).toBeGreaterThanOrEqual(0);
  });
  it("mapPins prefers real charge points then engine", async () => {
    expect((await providers.mapPins())[0].site).toBe("X");
    m.fetchChargePoints.mockResolvedValue(null);
    expect((await providers.mapPins()).length).toBeGreaterThan(0);
  });
  it("forecastPayload with + without weather", async () => {
    expect((await providers.forecastPayload("14d")).data_mode).toBe("live");
    m.fetchWeather.mockResolvedValue(null);
    expect((await providers.forecastPayload()).data_mode).toBe("synthetic");
  });
  it("monitoring / insights / assets / summary", async () => {
    expect(providers.monitoring().stations.length).toBeGreaterThan(0);
    expect(Array.isArray(providers.insights())).toBe(true);
    expect((await providers.assets("test-org"))[0].capacity_kw).toBeGreaterThan(0);
    expect(providers.summary().windowDays).toBe(14);
  });
  it("priceCurve live + unavailable", async () => {
    const pc = await providers.priceCurve();
    expect("spread_pence" in pc).toBe(true);
    m.fetchOctopusWindow.mockResolvedValue(null);
    expect((await providers.priceCurve()).data_mode).toBe("synthetic");
  });
  it("optimisation computes savings (and spread fallback)", async () => {
    const o = await providers.optimisation();
    expect(o.daily_saving_gbp).toBeGreaterThanOrEqual(0);
    expect(o.stations.length).toBeGreaterThan(0);
    m.fetchOctopusWindow.mockResolvedValue(null);
    expect((await providers.optimisation()).data_mode).toBe("synthetic");
  });
  it("smartWindow blends price + carbon, and degrades", async () => {
    const sw = await providers.smartWindow();
    expect(sw.available).toBe(true);
    if (sw.available) expect(typeof sw.best_at).toBe("string");
    m.fetchCarbonForecast.mockResolvedValue(null);
    expect((await providers.smartWindow()).available).toBe(false);
    m.fetchCarbonForecast.mockResolvedValue([{ from: "2099-01-01T00:00Z", gco2: 100 }]);
    m.fetchOctopusWindow.mockResolvedValue([{ valid_from: "2026-06-27T13:00:00Z", pence: 10 }]);
    expect((await providers.smartWindow()).available).toBe(false); // no time overlap
  });

  it("checkAutoOptimise no-ops when the window is unavailable or the preference is off", async () => {
    const org = `org-auto-noop-${Math.random()}`;
    const user = await createUser(org, `noauto-${Math.random()}@newco.example`, "No Auto", "admin", "password123");
    expect(await providers.checkAutoOptimise(org, user.id, { available: false })).toEqual({ autoScheduled: false, justExecuted: false });
    expect(await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" })).toEqual({
      autoScheduled: false,
      justExecuted: false,
    }); // autoOptimise defaults to off
  });

  it("checkAutoOptimise schedules once per day, emails the user once, and is idempotent on repeat", async () => {
    emailConfigured = true;
    const org = `org-auto-${Math.random()}`;
    const user = await createUser(org, `auto-${Math.random()}@newco.example`, "Auto User", "admin", "password123");
    await updatePreferences(user.id, { autoOptimise: true });

    const first = await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" });
    expect(first).toEqual({ autoScheduled: true, justExecuted: true });
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock.mock.calls[0][0].to).toBe(user.email);

    const second = await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" });
    expect(second).toEqual({ autoScheduled: true, justExecuted: false });
    expect(sendEmailMock).toHaveBeenCalledOnce(); // no repeat email the same day
  });

  it("checkAutoOptimise still schedules even when the confirmation email itself fails to send", async () => {
    emailConfigured = true;
    sendEmailMock.mockRejectedValueOnce(new Error("provider down"));
    const org = `org-auto-emailfail-${Math.random()}`;
    const user = await createUser(org, `emailfail-${Math.random()}@newco.example`, "Email Fail", "admin", "password123");
    await updatePreferences(user.id, { autoOptimise: true });

    const result = await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" });
    expect(result).toEqual({ autoScheduled: true, justExecuted: true });
  });

  it("checkAutoOptimise re-executes on a fresh day", async () => {
    const org = `org-auto-rollover-${Math.random()}`;
    const user = await createUser(org, `rollover-${Math.random()}@newco.example`, "Rollover User", "admin", "password123");
    await updatePreferences(user.id, { autoOptimise: true });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-25T08:00:00Z"));
      expect((await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" })).justExecuted).toBe(true);
      expect((await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" })).justExecuted).toBe(false);

      vi.setSystemTime(new Date("2026-08-26T08:00:00Z"));
      expect((await providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" })).justExecuted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("checkAutoOptimise is race-safe: two concurrent checks for the same user's first load of the day only execute/email once", async () => {
    emailConfigured = true;
    const org = `org-auto-race-${Math.random()}`;
    const user = await createUser(org, `race-${Math.random()}@newco.example`, "Race User", "admin", "password123");
    await updatePreferences(user.id, { autoOptimise: true });

    const [a, b] = await Promise.all([
      providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" }),
      providers.checkAutoOptimise(org, user.id, { available: true, best_at: "02:00" }),
    ]);
    expect([a.justExecuted, b.justExecuted].filter(Boolean)).toHaveLength(1); // exactly one racing call wins
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });
});

describe("alerts overlay + mutation", () => {
  it("alertsWithState returns alerts unmodified with no state set yet", async () => {
    const list = await providers.alertsWithState("org-fresh-1");
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => a.status === "active")).toBe(true);
  });

  it("updateAlertStatus acknowledges then resolves, and the change is visible via alertsWithState", async () => {
    const org = "org-fresh-2";
    const id = (await providers.alertsWithState(org))[0].id;

    const acked = await providers.updateAlertStatus(org, id, "acknowledged");
    expect(acked.status).toBe("acknowledged");
    expect(acked.acknowledged_at).toBeDefined();
    expect((await providers.alertsWithState(org)).find((a) => a.id === id)?.status).toBe("acknowledged");

    const resolved = await providers.updateAlertStatus(org, id, "resolved");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_at).toBeDefined();
  });

  it("updateAlertStatus rejects an unknown alert id", async () => {
    await expect(providers.updateAlertStatus("org-fresh-3", "not-real", "acknowledged")).rejects.toThrow(
      "Alert not found",
    );
  });

  it("alert state is isolated per org", async () => {
    const id = (await providers.alertsWithState("org-a"))[0].id;
    await providers.updateAlertStatus("org-a", id, "resolved");
    expect((await providers.alertsWithState("org-a")).find((a) => a.id === id)?.status).toBe("resolved");
    expect((await providers.alertsWithState("org-b")).find((a) => a.id === id)?.status).toBe("active");
  });

  it("checkAssetFaultAlerts flags a newly-down asset once, emails only opted-in org members, then is idempotent on repeat", async () => {
    emailConfigured = true;
    const org = `org-proactive-${Math.random()}`;
    const optedIn = await createUser(org, `optedin-${Math.random()}@newco.example`, "Opted In", "admin", "password123");
    const optedOut = await createUser(org, `optedout-${Math.random()}@newco.example`, "Opted Out", "operator", "password123");
    await updatePreferences(optedOut.id, { emailAlerts: false });

    const asset = await providers.createAsset(org, { name: "Depot Rapid", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    await providers.updateAsset(org, asset.id, { status: "down" });

    const first = await providers.checkAssetFaultAlerts(org);
    expect(first.newFaults).toBe(1);
    expect(first.emailed).toEqual([optedIn.email]);
    expect(sendEmailMock).toHaveBeenCalledOnce();

    const second = await providers.checkAssetFaultAlerts(org);
    expect(second.newFaults).toBe(0);
    expect(second.emailed).toEqual([]);
    expect(sendEmailMock).toHaveBeenCalledOnce(); // still just the one call from the first check
  });

  it("checkAssetFaultAlerts resolves on recovery and re-notifies on a fresh fault afterwards", async () => {
    emailConfigured = true;
    const org = `org-proactive-recover-${Math.random()}`;
    await createUser(org, `admin-${Math.random()}@newco.example`, "Admin", "admin", "password123");
    const asset = await providers.createAsset(org, { name: "Rooftop Solar", type: "Solar", site: "Manchester", capacity_kw: 80 });

    await providers.updateAsset(org, asset.id, { status: "degraded" });
    expect((await providers.checkAssetFaultAlerts(org)).newFaults).toBe(1);

    await providers.updateAsset(org, asset.id, { status: "healthy" });
    expect((await providers.checkAssetFaultAlerts(org)).resolved).toBe(1);

    await providers.updateAsset(org, asset.id, { status: "down" });
    expect((await providers.checkAssetFaultAlerts(org)).newFaults).toBe(1); // re-notified after recovery
  });

  it("checkAssetFaultAlerts skips emailing entirely when no email provider is configured", async () => {
    emailConfigured = false;
    const org = `org-proactive-noemail-${Math.random()}`;
    const asset = await providers.createAsset(org, { name: "Depot Battery", type: "Battery", site: "Bristol", capacity_kw: 200 });
    await providers.updateAsset(org, asset.id, { status: "down" });

    const result = await providers.checkAssetFaultAlerts(org);
    expect(result.newFaults).toBe(1);
    expect(result.emailed).toEqual([]);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("checkAssetFaultAlerts is race-safe: two concurrent checks on the same newly-faulted asset only count/email it once", async () => {
    emailConfigured = true;
    const org = `org-proactive-race-${Math.random()}`;
    await createUser(org, `race-${Math.random()}@newco.example`, "Race User", "admin", "password123");
    const asset = await providers.createAsset(org, { name: "Race Rapid", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    await providers.updateAsset(org, asset.id, { status: "down" });

    const [a, b] = await Promise.all([providers.checkAssetFaultAlerts(org), providers.checkAssetFaultAlerts(org)]);
    expect(a.newFaults + b.newFaults).toBe(1); // exactly one of the two racing calls claims it
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  it("alertsWithState surfaces an active asset fault alongside synthetic alerts, and acknowledge/resolve work through the same API", async () => {
    const org = `org-proactive-surface-${Math.random()}`;
    const asset = await providers.createAsset(org, { name: "Central Depot Charger", type: "EV Charger", site: "Birmingham", capacity_kw: 50 });
    await providers.updateAsset(org, asset.id, { status: "down" });
    await providers.checkAssetFaultAlerts(org);

    const alertId = `asset-fault:${asset.id}`;
    const list = await providers.alertsWithState(org);
    const surfaced = list.find((a) => a.id === alertId);
    expect(surfaced).toMatchObject({ severity: "high", status: "active", asset: "Central Depot Charger", site: "Birmingham" });
    expect(surfaced?.title).toContain("offline");

    const acked = await providers.updateAlertStatus(org, alertId, "acknowledged");
    expect(acked.status).toBe("acknowledged");
    expect((await providers.alertsWithState(org)).find((a) => a.id === alertId)?.status).toBe("acknowledged");

    const resolvedAlert = await providers.updateAlertStatus(org, alertId, "resolved");
    expect(resolvedAlert.status).toBe("resolved");
    expect((await providers.alertsWithState(org)).find((a) => a.id === alertId)).toBeUndefined();
  });

  it("updateAlertStatus rejects an asset-fault id whose asset doesn't exist", async () => {
    await expect(providers.updateAlertStatus("org-proactive-missing", "asset-fault:does-not-exist", "acknowledged")).rejects.toThrow(
      "Alert not found",
    );
  });

  it("faultSummary returns a rollup and consistent fault list", async () => {
    const fs = await providers.faultSummary(`org-faults-${Math.random()}`);
    const r = fs.rollup;
    expect(r.healthy + r.degraded + r.down).toBeGreaterThan(0);
    expect(r.ports_online).toBeGreaterThanOrEqual(0);
    expect(r.ports_offline).toBeGreaterThanOrEqual(0);
    // every down/degraded station appears as a fault; faults are typed and ordered
    const downDegraded = r.down + r.degraded;
    expect(fs.faults.length).toBeGreaterThanOrEqual(downDegraded);
    for (const f of fs.faults) {
      expect(["offline", "degraded", "recurring_fault"]).toContain(f.kind);
      expect(f.name).toBeTruthy();
      expect(f.fault_rate_pct).toBeGreaterThanOrEqual(0);
    }
    // offline faults sort before degraded/recurring
    const kinds = fs.faults.map((f) => f.kind);
    const firstDegraded = kinds.indexOf("degraded");
    const lastOffline = kinds.lastIndexOf("offline");
    if (firstDegraded >= 0 && lastOffline >= 0) expect(lastOffline).toBeLessThan(firstDegraded);
  });

  it("faultSummary includes a degraded/down user-registered asset in both the fault list and rollup", async () => {
    const org = `org-faults-user-${Math.random()}`;
    const before = await providers.faultSummary(org);

    const asset = await providers.createAsset(org, { name: "Depot Charger", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    await providers.updateAsset(org, asset.id, { status: "down" });

    const after = await providers.faultSummary(org);
    expect(after.faults.some((f) => f.stationId === asset.id && f.kind === "offline")).toBe(true);
    expect(after.rollup.down).toBe(before.rollup.down + 1);
    expect(after.rollup.ports_offline).toBe(before.rollup.ports_offline + 1);
  });

  it("classifyFault maps status + fault rate to the right fault (or none)", () => {
    const base = { stationId: "s1", name: "Site 1", portsOnline: 0, portsTotal: 4 };
    expect(providers.classifyFault({ ...base, status: "down" }, 0)?.kind).toBe("offline");
    const deg = providers.classifyFault({ ...base, status: "degraded", portsOnline: 2 }, 5);
    expect(deg?.kind).toBe("degraded");
    expect(deg?.detail).toContain("2/4");
    expect(providers.classifyFault({ ...base, status: "healthy", portsOnline: 4 }, 25)?.kind).toBe("recurring_fault");
    expect(providers.classifyFault({ ...base, status: "healthy", portsOnline: 4 }, 3)).toBeNull();
  });

  it("compareFaults orders by kind then fault rate", () => {
    const mk = (kind: "offline" | "degraded" | "recurring_fault", rate: number) =>
      ({ stationId: "x", name: "x", kind, detail: "", fault_rate_pct: rate });
    const sorted = [mk("recurring_fault", 5), mk("offline", 0), mk("degraded", 50), mk("degraded", 90)].sort(providers.compareFaults);
    expect(sorted.map((f) => f.kind)).toEqual(["offline", "degraded", "degraded", "recurring_fault"]);
    expect(sorted[1].fault_rate_pct).toBe(90); // higher rate first within same kind
  });

  it("comparisonSummary returns current vs previous windows with deltas (live)", async () => {
    const r = await providers.comparisonSummary("week");
    expect(r.period).toBe("week");
    expect(r.window_days).toBe(7);
    expect(r.current.energy_mwh).toBeGreaterThan(0);
    expect(r.previous.energy_mwh).toBeGreaterThan(0);
    expect(typeof r.deltas.energy).toBe("number");
    expect(r.data_mode).toBe("live"); // mocked sources are up in this suite
    expect(r.current.cost_gbp).toBeGreaterThan(0);
  });

  it("comparisonSummary handles each period and defaults invalid input to week", async () => {
    expect((await providers.comparisonSummary("day")).window_days).toBe(1);
    expect((await providers.comparisonSummary("month")).window_days).toBe(28);
    expect((await providers.comparisonSummary("bogus")).period).toBe("week");
  });

  it("comparisonSummary falls back to synthetic when live sources are down", async () => {
    m.fetchCarbonIntensity.mockResolvedValue(null);
    m.fetchOctopusAgile.mockResolvedValue(null);
    const r = await providers.comparisonSummary("day");
    expect(r.data_mode).toBe("synthetic");
    expect(r.current.co2_avoided_t).toBeGreaterThanOrEqual(0);
  });

  it("comparisonSummary reports the resolved range for a preset period", async () => {
    const r = await providers.comparisonSummary("week");
    expect(new Date(r.range.to).getTime()).toBeGreaterThan(new Date(r.range.from).getTime());
    expect(Math.round((new Date(r.range.to).getTime() - new Date(r.range.from).getTime()) / (24 * 3_600_000))).toBe(7);
  });

  it("comparisonSummary honours an explicit from/to range and blends real per-org readings into it", async () => {
    const org = `org-cmp-real-${Math.random()}`;
    const asset = await providers.createAsset(org, { name: "Depot Rapid", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    await ingestReading(org, asset.id, { energy_kwh: 40, recorded_at: "2026-01-15T10:00:00Z" });

    const r = await providers.comparisonSummary("week", { orgId: org, from: "2026-01-14T00:00:00Z", to: "2026-01-16T00:00:00Z" });
    expect(r.window_days).toBe(2);
    expect(r.range).toEqual({ from: new Date("2026-01-14T00:00:00Z").toISOString(), to: new Date("2026-01-16T00:00:00Z").toISOString() });
    // Jan 2026 is well outside the synthetic engine's rolling window, so this is purely the real reading.
    expect(r.current.energy_mwh).toBeCloseTo(0.04, 3);

    // The previous period (Jan 12-14) has no real readings and no synthetic overlap either.
    expect(r.previous.energy_mwh).toBe(0);
  });

  it("comparisonSummary doesn't double-count a real reading recorded exactly at the current/previous boundary", async () => {
    const org = `org-cmp-boundary-${Math.random()}`;
    const asset = await providers.createAsset(org, { name: "Boundary Rapid", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    // recorded_at is exactly curFromMs (== prevToMs) for the range below.
    await ingestReading(org, asset.id, { energy_kwh: 40, recorded_at: "2026-01-14T00:00:00.000Z" });

    const r = await providers.comparisonSummary("week", { orgId: org, from: "2026-01-14T00:00:00Z", to: "2026-01-16T00:00:00Z" });
    expect(r.current.energy_mwh).toBeCloseTo(0.04, 3);
    expect(r.previous.energy_mwh).toBe(0);
  });

  it("comparisonSummary ignores a partial from/to (only one side given) and falls back to the preset", async () => {
    const r = await providers.comparisonSummary("day", { from: "2026-01-14T00:00:00Z" });
    expect(r.window_days).toBe(1);
  });

  it("comparisonSummary blends a real reading dated 'now' into the default (preset) window, not just a custom range", async () => {
    // Regression coverage: the synthetic engine's latestTs is hour-aligned, so
    // a real reading timestamped a few minutes past it must not be silently
    // excluded by the current-window upper bound.
    const org = `org-cmp-preset-real-${Math.random()}`;
    const asset = await providers.createAsset(org, { name: "Preset Real Rapid", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    await ingestReading(org, asset.id, { energy_kwh: 500, recorded_at: new Date().toISOString() });

    const withReal = await providers.comparisonSummary("day", { orgId: org });
    const withoutOrg = await providers.comparisonSummary("day");
    expect(withReal.current.energy_mwh).toBeCloseTo(withoutOrg.current.energy_mwh + 0.5, 2);
  });

  it("comparisonSummary without an orgId never blends real data (backward-compatible default)", async () => {
    const org = `org-cmp-noreal-${Math.random()}`;
    const asset = await providers.createAsset(org, { name: "Untracked Rapid", type: "EV Charger", site: "Leeds", capacity_kw: 50 });
    await ingestReading(org, asset.id, { energy_kwh: 999, recorded_at: new Date().toISOString() });
    const r = await providers.comparisonSummary("day"); // no orgId passed
    expect(r.current.energy_mwh).toBeLessThan(999);
  });

  it("notifications reflect live alert state; acknowledge/resolve reduce unread", async () => {
    const org = "org-notif-1";
    const base = await providers.notifications(org);
    expect(base.items.length).toBeGreaterThan(0);
    expect(base.unread).toBe(base.items.length); // all active initially
    const id = base.items[0].id;

    await providers.updateAlertStatus(org, id, "acknowledged");
    const acked = await providers.notifications(org);
    expect(acked.unread).toBe(base.unread - 1); // acknowledged no longer unread
    expect(acked.items.some((n) => n.id === id)).toBe(true); // but still listed

    await providers.updateAlertStatus(org, id, "resolved");
    const resolved = await providers.notifications(org);
    expect(resolved.items.some((n) => n.id === id)).toBe(false); // resolved drops off
  });
});

describe("assets registry (engine + preview + user-registered)", () => {
  it("includes engine EV chargers and the Battery/Solar previews", async () => {
    const list = await providers.assets("org-assets-1");
    expect(list.some((a) => a.type === "EV Charger" && a.source === "engine")).toBe(true);
    expect(list.some((a) => a.type === "Battery" && a.source === "preview")).toBe(true);
    expect(list.some((a) => a.type === "Solar" && a.source === "preview")).toBe(true);
  });

  it("createAsset adds a user asset visible in subsequent listings, scoped per org", async () => {
    const created = await providers.createAsset("org-assets-2", {
      name: "Depot Charger 9",
      type: "EV Charger",
      site: "Cardiff Depot",
      capacity_kw: 150,
    });
    expect(created.source).toBe("user");

    const listSameOrg = await providers.assets("org-assets-2");
    expect(listSameOrg.some((a) => a.id === created.id)).toBe(true);

    const listOtherOrg = await providers.assets("org-assets-3");
    expect(listOtherOrg.some((a) => a.id === created.id)).toBe(false);
  });

  it("getAsset finds a known asset and returns undefined for an unknown id", async () => {
    const list = await providers.assets("org-assets-4");
    const first = list[0];
    expect((await providers.getAsset("org-assets-4", first.id))?.name).toBe(first.name);
    expect(await providers.getAsset("org-assets-4", "not-a-real-id")).toBeUndefined();
  });

  it("updateAsset patches a user asset's status/technical info; deleteAsset removes it — both no-op on engine/preview ids", async () => {
    const created = await providers.createAsset("org-assets-5", {
      name: "Depot Charger 10", type: "EV Charger", site: "Leeds Depot", capacity_kw: 100,
    });

    const updated = await providers.updateAsset("org-assets-5", created.id, { status: "degraded", manufacturer: "Voltway", product_id: "prod-9" });
    expect(updated?.status).toBe("degraded");
    expect(updated?.manufacturer).toBe("Voltway");
    expect(updated?.product_id).toBe("prod-9");

    // Engine-modelled assets aren't in the DB-backed store, so editing/deleting one 404s (returns undefined/false), not a silent success.
    const engineAsset = (await providers.assets("org-assets-5")).find((a) => a.source === "engine")!;
    expect(await providers.updateAsset("org-assets-5", engineAsset.id, { status: "down" })).toBeUndefined();
    expect(await providers.deleteAsset("org-assets-5", engineAsset.id)).toBe(false);

    expect(await providers.deleteAsset("org-assets-5", created.id)).toBe(true);
    expect(await providers.getAsset("org-assets-5", created.id)).toBeUndefined();
  });

  it("importAssets bulk-creates user assets scoped to the org", async () => {
    const created = await providers.importAssets("org-import-1", [
      { name: "Bulk 1", type: "EV Charger", site: "Site A", capacity_kw: 50 },
      { name: "Bulk 2", type: "Solar", site: "Site A", capacity_kw: 30 },
    ]);
    expect(created).toHaveLength(2);
    expect(created.every((a) => a.source === "user")).toBe(true);
    const list = await providers.assets("org-import-1");
    expect(list.filter((a) => a.source === "user")).toHaveLength(2);
    expect((await providers.assets("org-import-2")).filter((a) => a.source === "user")).toHaveLength(0);
  });
});

describe("providers — forecastAccuracy", () => {
  it("backtests the synthetic engine's forecast model and returns network-wide results", () => {
    const r = providers.forecastAccuracy();
    expect(r.stationsEvaluated).toBeGreaterThan(0);
    expect(r.overallByHorizon.length).toBeGreaterThan(0);
  });
});

describe("providers — market dispatch (an org's market picks its region's data)", () => {
  const usOrgId = "org-us-market-1";
  beforeEach(() => {
    usOrgs.set(usOrgId, { id: usOrgId, name: "Sunbelt Charging Co", slug: "sunbelt-charging", market: "us" });
  });

  it("metrics: a US-market org draws carbon/price from the US provider set, not UK's", async () => {
    const r = await providers.metrics(usOrgId);
    expect(r.average_cost_per_kwh).toBe(0.16);
    expect(r.carbon_intensity_gco2_kwh).toBe(350);
    expect(r.data_sources).toEqual(["eia_retail_price", "eia_fuel_mix"]);
    // The UK mock's fixture values must never leak into a US org's response.
    expect(r.average_cost_per_kwh).not.toBe(0.21);
  });

  it("metrics: an org with no id (or an unrecognised one) still defaults to UK, unchanged", async () => {
    const r = await providers.metrics();
    expect(r.data_sources).toEqual(["octopus_agile", "carbon_intensity"]);
  });

  it("comparisonSummary: opts.orgId's market selects the region for carbon/pricing too", async () => {
    const r = await providers.comparisonSummary("week", { orgId: usOrgId });
    expect(r.data_sources).toEqual(["eia_retail_price", "eia_fuel_mix"]);
  });

  it("mapPins: a US org's charge points come from the US (OpenChargeMap/US) fetcher", async () => {
    const pins = await providers.mapPins(usOrgId);
    expect(pins[0]?.site).toBe("US Site");
  });

  it("forecastPayload: a US org's weather drivers come from the US fetcher", async () => {
    const f = await providers.forecastPayload("14d", usOrgId);
    expect(f.drivers).toEqual(["us-d1"]);
  });

  it("smartWindow: honestly unavailable for a US org (EIA has no sub-hourly price/forecast series)", async () => {
    const r = await providers.smartWindow(usOrgId);
    expect(r.available).toBe(false);
  });

  it("priceCurve: honestly unavailable for a US org, same reason", async () => {
    const r = await providers.priceCurve(usOrgId);
    expect(r.data_mode).toBe("synthetic");
    expect(r.source).toBe("unavailable");
  });

  it("optimisation: a US org's data_sources reflect its own region once live pricing exists", async () => {
    const r = await providers.optimisation(usOrgId);
    // priceCurve is synthetic for US today (no EIA price window), so this
    // stays ani_engine-only — proves the US path doesn't fabricate an
    // "eia_retail_price" source it can't actually back with live data yet.
    expect(r.data_sources).toEqual(["ani_engine"]);
  });
});
