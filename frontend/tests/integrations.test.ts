import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A fake Victron VRM API: one EV site (3 chargers: charging, faulted, idle)
// and one ESS site (battery + solar). Shapes copied from real VRM responses.
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 4, 12, 30); // 12:30 UTC
const START = Math.floor((NOW - 30 * 24 * HOUR) / HOUR) * HOUR;
const hours = Array.from({ length: 30 * 24 }, (_, i) => START + i * HOUR);

function vrmFetch(url: string, init?: RequestInit): Response {
  const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
  const auth = (init?.headers as Record<string, string> | undefined)?.["X-Authorization"] ?? "";
  if (url.endsWith("/auth/loginAsDemo")) return json({ token: "demo-jwt" });
  if (auth === "Token bad") return json({ success: false, errors: "Invalid token", error_code: "invalid_token" }, 401);
  if (url.endsWith("/users/me")) return json({ success: true, user: { id: 22, name: "Demo User" } });
  if (url.includes("/users/22/installations")) {
    return json({
      success: true,
      records: [
        { idSite: 1, name: "Depot A", extended: [
          { code: "lt", rawValue: 51.5 }, { code: "lg", rawValue: -0.1 }, { code: "bs", rawValue: 60 },
          { code: "bv", rawValue: 50 }, { code: "bc", rawValue: 10 }, { code: "consumption", rawValue: 9000 },
          { code: "from_to_grid", rawValue: 8000 }, { code: "solar_yield", rawValue: 1500 },
        ] },
        { idSite: 2, name: "Marina", extended: [] }, // filtered out by siteIds in the demo
      ],
    });
  }
  if (url.includes("/installations/1/system-overview")) {
    return json({ success: true, records: { devices: [
      { name: "VE.Bus System", productName: "MultiPlus-II 48/5000/70-50", instance: 276 },
      { name: "Battery Monitor", productName: "Lynx Shunt 1000A VE.Can", instance: 1 },
      { name: "Solar Charger", productName: "SmartSolar MPPT 250/100", instance: 278 },
      { name: "EV Charging Station", productName: "EV Charging Station 32A", instance: 10 },
      { name: "EV Charging Station", productName: "EV Charging Station 32A", instance: 11 },
      { name: "EV Charging Station", productName: "EV Charging Station 32A", instance: 12 },
    ] } });
  }
  if (url.includes("widgets/EvChargerSummary")) {
    const inst = Number(new URL(url).searchParams.get("instance"));
    const evs = inst === 10 ? "Charging" : inst === 11 ? "CP input test error (shorted)" : "EV Disconnected";
    return json({ success: true, records: { data: {
      1: { code: "evs", formattedValue: evs, rawValue: evs },
      2: { code: "evi", rawValue: inst === 10 ? 32 : 0 },
      3: { code: "evmi", rawValue: 32 },
      secondsAgo: { value: 1_000_000 }, // VRM reports this identically for every charger — must be ignored
    } } });
  }
  if (url.includes("attributeCodes[]=evp")) {
    return json({ success: true, records: [10, 11, 12].map((instance) => ({
      instance,
      stats: {
        // Charger 10 starts a session at 18:00 every day and runs 3 h at 7 kW.
        evp: hours.map((t) => [t, instance === 10 && [18, 19, 20].includes(new Date(t).getUTCHours()) ? 7000 : 0]),
        evs: hours.map((t) => [t, instance === 11 ? 10 : instance === 10 && [18, 19, 20].includes(new Date(t).getUTCHours()) ? 2 : 0]),
      },
    })) });
  }
  if (url.includes("/installations/1/stats?type=kwh")) {
    const day = (t: number) => new Date(t).getUTCHours();
    return json({ success: true, records: {
      Pb: hours.filter((t) => day(t) >= 9 && day(t) < 13).map((t) => [t, 2.5]), // PV → battery, 10 kWh/day
      Pc: hours.filter((t) => day(t) >= 9 && day(t) < 15).map((t) => [t, 1]),
      Pg: hours.filter((t) => day(t) >= 11 && day(t) < 13).map((t) => [t, 0.5]),
      Bc: hours.filter((t) => day(t) >= 18 && day(t) < 23).map((t) => [t, 2]),
    } });
  }
  if (url.includes("/installations/1/") && url.includes("attributeCodes[]=bs")) {
    // SoC rises 25 points/day over the 4 charging hours (10 kWh) → ~40 kWh pack.
    return json({ success: true, records: { bs: hours.map((t) => {
      const h = new Date(t).getUTCHours();
      const soc = h < 9 ? 40 : h < 13 ? 40 + (h - 8) * 6.25 : h < 18 ? 65 : h < 23 ? 65 - (h - 17) * 5 : 40;
      return [t, soc, soc, soc];
    }) } });
  }
  return json({ success: false, errors: `unmocked ${url}` }, 404);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => vrmFetch(String(url), init)) as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("victron mapping", () => {
  it("maps VRM's display text back to EV charger status codes (longest label wins)", async () => {
    const { evcsStatusCode, isEvcsFault } = await import("@/lib/server/integrations/victron");
    expect(evcsStatusCode("EV Disconnected")).toBe(0);
    expect(evcsStatusCode("Charging")).toBe(2);
    expect(evcsStatusCode("Charging limit")).toBe(20);
    expect(evcsStatusCode("CP input test error (shorted)")).toBe(10);
    expect(isEvcsFault(10)).toBe(true);
    expect(isEvcsFault(2)).toBe(false);
    expect(evcsStatusCode(null)).toBeNull();
  });

  it("reads inverter ratings from Victron product names", async () => {
    const { inverterKw } = await import("@/lib/server/integrations/victron");
    expect(inverterKw("MultiPlus-II 48/3000/35-32")).toBe(3);
    expect(inverterKw("Quattro 48/10000/140-2x100")).toBe(10);
    expect(inverterKw("Multi RS Smart 48V/6000VA/100A")).toBe(6);
    expect(inverterKw("Lynx Shunt")).toBeNull();
  });

  it("discovers chargers, battery and solar per site with real status and history", async () => {
    const { discoverVrm } = await import("@/lib/server/integrations/victron");
    const devices = await discoverVrm({ mode: "demo" }, { siteIds: [1] });
    expect(devices.map((d) => d.type).sort()).toEqual(["Battery", "EV Charger", "EV Charger", "EV Charger", "Solar"]);
    const faulted = devices.find((d) => d.externalId === "1:evcs:11")!;
    expect(faulted.status).toBe("down");
    expect(faulted.telemetry.statusText).toBe("CP input test error (shorted)");
    // secondsAgo is ignored: an idle-but-reporting charger is not "offline".
    expect(devices.find((d) => d.externalId === "1:evcs:12")!.status).toBe("healthy");
    // Only complete hours are kept, so no partial current-hour bucket.
    expect(Math.max(...faulted.history.map((h) => h.ts)) + HOUR).toBeLessThanOrEqual(NOW);
    const battery = devices.find((d) => d.type === "Battery")!;
    expect(battery.capacityKw).toBe(5); // MultiPlus-II 48/5000
    expect(battery.telemetry.powerKw).toBe(0.5); // 50 V × 10 A, charging
    const solar = devices.find((d) => d.type === "Solar")!;
    expect(solar.telemetry.currentKw).toBe(1.5);
    expect(solar.telemetry.todayExportKwh).toBe(0.5); // Pg 11:00 (12:00 is the incomplete current hour)
  });
});

describe("credential handling", () => {
  it("encrypts and decrypts with AES-GCM, and rejects tampering", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/server/integrations/crypto");
    const enc = encryptSecret("vrm-token-123");
    expect(enc).not.toContain("vrm-token-123");
    expect(decryptSecret(enc)).toBe("vrm-token-123");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("refuses to store credentials in production without Davwo's key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "");
    const { encryptSecret } = await import("@/lib/server/integrations/crypto");
    expect(() => encryptSecret("x")).toThrow(/INTEGRATIONS_ENCRYPTION_KEY/);
    vi.unstubAllEnvs();
  });

  it("never returns credentials from the connection store", async () => {
    const { createConnection, listConnections, connectionSecret } = await import("@/lib/server/integrations/connections");
    const c = await createConnection("org-cred", { provider: "victron_vrm", label: "x", secret: "s3cret" });
    expect(JSON.stringify(c)).not.toContain("s3cret");
    expect(JSON.stringify(await listConnections("org-cred"))).not.toContain("s3cret");
    expect(c.hasCredentials).toBe(true);
    expect(await connectionSecret("org-cred", c.id)).toBe("s3cret");
    expect(await connectionSecret("other-org", c.id)).toBeNull();
  });
});

describe("connect flow", () => {
  it("rejects a bad token before storing anything", async () => {
    const { connectIntegration } = await import("@/lib/server/integrations/service");
    const { listConnections } = await import("@/lib/server/integrations/connections");
    await expect(connectIntegration("org-bad", { provider: "victron_vrm", token: "bad" })).rejects.toThrow(/rejected that token/);
    expect(await listConnections("org-bad")).toEqual([]);
  });

  it("refuses providers that aren't live yet", async () => {
    const { connectIntegration } = await import("@/lib/server/integrations/service");
    await expect(connectIntegration("org-x", { provider: "solaredge", token: "k" })).rejects.toThrow(/isn't connectable yet/);
  });

  it("connects, syncs real devices into the register, and disconnects cleanly", async () => {
    const { connectIntegration, disconnectIntegration } = await import("@/lib/server/integrations/service");
    const { listUserAssets } = await import("@/lib/server/assetsStore");
    const { listReadingsForOrg } = await import("@/lib/server/assetReadings");
    const { connection, devices } = await connectIntegration("org-real", { provider: "victron_vrm", token: "good" });
    expect(devices).toBe(5);
    const assets = await listUserAssets("org-real");
    expect(assets).toHaveLength(5);
    expect(assets.every((a) => a.external?.source === "victron_vrm")).toBe(true);
    const readings = await listReadingsForOrg("org-real", 0, NOW);
    expect(readings.length).toBeGreaterThan(1000);

    // A re-sync updates the same rows and never duplicates readings.
    const { ensureLiveData } = await import("@/lib/server/integrations/sync");
    await ensureLiveData("org-real", { force: true });
    expect(await listUserAssets("org-real")).toHaveLength(5);
    expect((await listReadingsForOrg("org-real", 0, NOW)).length).toBe(readings.length);

    expect(await disconnectIntegration("org-real", connection.id)).toBe(true);
    expect(await listUserAssets("org-real")).toEqual([]);
    expect(await listReadingsForOrg("org-real", 0, NOW)).toEqual([]);
  });
});

describe("live network and monitors", () => {
  it("builds an engine network where faults, sessions and peak hours come from the data", async () => {
    const { discoverVrm } = await import("@/lib/server/integrations/victron");
    const { buildLiveNetwork } = await import("@/lib/server/integrations/liveNetwork");
    const { monitor, analyse, loadShiftOpportunity, hourProfile } = await import("@/lib/ani/engine");
    const devices = (await discoverVrm({ mode: "demo" }, { siteIds: [1] })).map((d, i) => ({ ...d, assetId: `a${i}` }));
    const net = buildLiveNetwork(devices);
    expect(net.stations).toHaveLength(1);
    expect(net.stations[0].ports.map((p) => p.id)).toEqual(["LIVE-01-10", "LIVE-01-11", "LIVE-01-12"]);
    const m = monitor(net);
    expect(m.stations[0]).toMatchObject({ portsOnline: 2, portsTotal: 3, status: "degraded" });
    // One session per day on charger 10 (a 3-hour block = one start).
    const sessions = net.readings.filter((r) => r.portId === "LIVE-01-10").reduce((s, r) => s + r.sessions, 0);
    expect(sessions).toBe(30);
    expect(analyse(net).some((i) => i.type === "recurring_fault" && i.asset.includes("EV Charger #11"))).toBe(true);
    // Peak hours are the real 18–20:00 block, not the synthetic profile's.
    expect(loadShiftOpportunity(net).peakHours.sort()).toEqual([18, 19, 20]);
    expect(hourProfile(net)[3]).toBe(0);
  });

  it("an org with no chargers gets a safe, empty network", async () => {
    const { buildLiveNetwork } = await import("@/lib/server/integrations/liveNetwork");
    const { monitor, networkSummary, loadShiftOpportunity } = await import("@/lib/ani/engine");
    const net = buildLiveNetwork([]);
    expect(monitor(net).stationsTotal).toBe(0);
    expect(() => new Date(monitor(net).asOf).toISOString()).not.toThrow();
    expect(networkSummary(net).busiest.name).toBe("—");
    expect(loadShiftOpportunity(net).peakKwh).toBe(0);
  });

  it("estimates battery capacity from charge energy vs SoC gained, and reports unknowns as null", async () => {
    const { discoverVrm } = await import("@/lib/server/integrations/victron");
    const { liveBatteryMonitor, liveSolarMonitor } = await import("@/lib/server/integrations/liveDevices");
    const devices = (await discoverVrm({ mode: "demo" }, { siteIds: [1] })).map((d, i) => ({ ...d, assetId: `a${i}`, connectionId: "c", provider: "victron_vrm" }));
    const b = liveBatteryMonitor(devices.filter((d) => d.type === "Battery"));
    expect(b.source).toBe("live");
    expect(b.totalCapacityKwh).toBeGreaterThan(36);
    expect(b.totalCapacityKwh).toBeLessThan(44);
    expect(b.healthPct).toBeNull();
    expect(b.totalCycles).toBeNull();
    expect(b.backupReservePct).toBe(40); // lowest SoC seen
    const s = liveSolarMonitor(devices.filter((d) => d.type === "Solar"));
    expect(s.source).toBe("live");
    expect(s.energyLifetimeKwh).toBeNull();
    expect(s.inverters[0].dcVoltage).toBeNull();
  });
});

describe("live vs demo isolation", () => {
  it("a live org sees only its real devices and alerts; demo orgs are unchanged", async () => {
    const { connectIntegration } = await import("@/lib/server/integrations/service");
    const { asTenant } = await import("@/lib/server/context");
    const { assets, alertsWithState, checkAssetFaultAlerts } = await import("@/lib/server/providers");
    await connectIntegration("org-live", { provider: "victron_vrm", token: "good" });

    const live = await asTenant("org-live", () => assets("org-live"));
    expect(live.every((a) => a.source === "user")).toBe(true);
    expect(live.some((a) => a.id.startsWith("preview-"))).toBe(false);

    await asTenant("org-live", () => checkAssetFaultAlerts("org-live"));
    const alerts = await asTenant("org-live", () => alertsWithState("org-live"));
    expect(alerts.map((a) => a.id).some((id) => id.startsWith("al-"))).toBe(false); // no synthetic alerts
    expect(alerts.some((a) => a.title.includes("CP input test error"))).toBe(true);

    const demo = await asTenant("acme", () => assets("acme"));
    expect(demo.some((a) => a.source === "engine")).toBe(true);
    expect(demo.some((a) => a.id.startsWith("preview-"))).toBe(true);
  });
});
