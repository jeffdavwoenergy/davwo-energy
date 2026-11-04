import { describe, it, expect, vi } from "vitest";

// A cold serverless instance of an integrated org, with a database: it must
// answer from the last-synced data in Postgres and defer the provider refresh
// until after the response — never make the request wait on the provider.

const afterCallbacks: (() => unknown)[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => unknown) => { afterCallbacks.push(cb); },
}));
vi.mock("@/lib/server/prisma", () => ({ isDbConfigured: () => true, getPrisma: () => null }));
vi.mock("@/lib/server/integrations/connections", () => ({
  listConnections: async () => [{ id: "c1", orgId: "org-w", provider: "victron_vrm", label: "VRM", status: "active", metadata: {} }],
  createConnection: vi.fn(),
  connectionSecret: async () => "tok",
  recordSync: async () => undefined,
}));
vi.mock("@/lib/server/assetsStore", () => ({
  upsertExternalAssets: vi.fn(),
  listUserAssets: async () => [{
    id: "ua-1", name: "Depot · EV Charger #1", type: "EV Charger", site: "Depot", capacity_kw: 22,
    status: "healthy", utilisation_pct: 30, current_load_kw: 7, location: { lat: 51.5, lng: 0 }, source: "user",
    external: { source: "victron_vrm", id: "9:evcs:1", connection_id: "c1" }, telemetry: { statusText: "Charging" },
    createdAt: "", updatedAt: "",
  }],
}));
vi.mock("@/lib/server/assetReadings", () => ({
  appendSyncedReadings: vi.fn(),
  listReadingsForOrg: async () => [
    { id: "r1", assetId: "ua-1", power_kw: 7, energy_kwh: 7, recorded_at: new Date(Date.now() - 2 * 3_600_000).toISOString() },
    { id: "r2", assetId: "ua-1", power_kw: 7, energy_kwh: 7, recorded_at: new Date(Date.now() - 3_600_000).toISOString() },
  ],
}));

describe("cold-start with a database", () => {
  it("serves last-synced devices from Postgres and refreshes from the provider after the response", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("provider must not be called before the response"); });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { ensureLiveData } = await import("@/lib/server/integrations/sync");

    const snap = await ensureLiveData("org-w");
    expect(snap?.origin).toBe("database");
    expect(snap?.devices.map((d) => d.name)).toEqual(["Depot · EV Charger #1"]);
    expect(snap?.network.stations[0].ports).toHaveLength(1);
    expect(snap?.network.readings).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1); // provider refresh deferred until after the response
  });
});
