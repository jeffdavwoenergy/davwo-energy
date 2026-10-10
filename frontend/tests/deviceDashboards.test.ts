import { describe, it, expect } from "vitest";
import { GET as fleet } from "@/app/api/monitoring/fleet/route";
import { GET as solar } from "@/app/api/monitoring/solar/route";
import { GET as battery } from "@/app/api/monitoring/battery/route";
import { POST as createAsset } from "@/app/api/assets/route";
import { PATCH as patchAsset } from "@/app/api/assets/[id]/route";
import { signToken } from "@/lib/server/jwt";
import { parseSpecs } from "@/lib/assetSpecs";
import type { FleetMonitor, SolarMonitor, BatteryMonitor, VehicleComponent } from "@/lib/deviceMonitoringTypes";

const COMPONENTS: VehicleComponent[] = [
  "battery", "motor", "charge_port", "onboard_charger", "tyre_fl", "tyre_fr", "tyre_rl", "tyre_rr",
  "brakes", "aux_battery", "cooling", "hvac", "telematics",
];

async function tokenFor(org: string, role = "admin") {
  return signToken({ sub: `u-${org}`, email: `${org}@example.com`, role, org });
}
const get = (token: string) => new Request("http://x/api", { headers: { Authorization: `Bearer ${token}` } });
const send = (method: string, token: string, body: object) =>
  new Request("http://x/api", {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const newOrg = () => `org-dev-${Math.random().toString(36).slice(2)}`;

describe("parseSpecs", () => {
  it("keeps known fields, coerces numbers, and drops unknown keys", () => {
    const { specs, error } = parseSpecs("Vehicle", { vehicleType: "bus", reg: " LX24 BUS ", batteryKwh: "350", hack: "x" });
    expect(error).toBeUndefined();
    expect(specs).toEqual({ vehicleType: "bus", reg: "LX24 BUS", batteryKwh: 350 });
  });

  it("rejects missing required fields, bad options and out-of-range numbers", () => {
    expect(parseSpecs("Vehicle", { vehicleType: "van", batteryKwh: 75 }).error).toMatch(/Registration/);
    expect(parseSpecs("Vehicle", { vehicleType: "rocket", reg: "A", batteryKwh: 75 }).error).toMatch(/Vehicle type/);
    expect(parseSpecs("Solar", { tiltDeg: 120 }).error).toMatch(/Tilt/);
    // partial (PATCH) skips the required check
    expect(parseSpecs("Vehicle", { driver: "Sam" }, { partial: true }).error).toBeUndefined();
  });
});

describe("fleet dashboard data", () => {
  it("demo fleet: mixed vehicle types, map positions, privacy and consistent faults", async () => {
    const token = await tokenFor(newOrg());
    const data: FleetMonitor = await (await fleet(get(token))).json();

    expect(data.source).toBe("demo");
    expect(data.vehicles.length).toBeGreaterThanOrEqual(6);
    const kinds = new Set(data.vehicles.map((v) => v.kind));
    for (const k of ["car", "bus", "truck"]) expect(kinds.has(k as never)).toBe(true);

    for (const v of data.vehicles) {
      if (v.privateTrip) {
        expect(v.position).toBeNull();
        expect(v.locationArea).toMatch(/hidden/);
      } else {
        expect(v.position).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
      }
      for (const f of v.faults) {
        expect(COMPONENTS).toContain(f.component);
        expect(f.code).toMatch(/^[PBCU][0-9A-F]{4}$/);
        expect(f.detail.length).toBeGreaterThan(10);
        expect(f.action.length).toBeGreaterThan(10);
      }
      // A critical fault always takes the vehicle off the road.
      if (v.faults.some((f) => f.severity === "critical")) {
        expect(v.status).toBe("fault");
        expect(v.readyByDeparture).toBe(false);
      }
    }
    const counted = data.vehicles.flatMap((v) => v.faults).length;
    expect(data.faultCounts.critical + data.faultCounts.warning + data.faultCounts.info).toBe(counted);
    expect(data.depots.length).toBeGreaterThan(0);
  });

  it("is stable per org — registrations and faults don't change between refreshes", async () => {
    const token = await tokenFor(newOrg());
    const a: FleetMonitor = await (await fleet(get(token))).json();
    const b: FleetMonitor = await (await fleet(get(token))).json();
    expect(b.vehicles.map((v) => v.reg)).toEqual(a.vehicles.map((v) => v.reg));
    expect(b.vehicles.map((v) => v.faults.map((f) => f.code))).toEqual(a.vehicles.map((v) => v.faults.map((f) => f.code)));
  });

  it("registered vehicles replace the demo fleet, carrying their own details", async () => {
    const token = await tokenFor(newOrg());
    const res = await createAsset(send("POST", token, {
      name: "Route 7 Bus", type: "Vehicle", site: "Riverside Yard", capacity_kw: 150,
      specs: { vehicleType: "bus", reg: "LX24 BUS", batteryKwh: 350, driver: "Sam Okafor" },
    }));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.specs).toMatchObject({ vehicleType: "bus", reg: "LX24 BUS", batteryKwh: 350 });

    const data: FleetMonitor = await (await fleet(get(token))).json();
    expect(data.source).toBe("assets");
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0]).toMatchObject({
      name: "Route 7 Bus", reg: "LX24 BUS", kind: "bus", batteryKwh: 350,
      depot: "Riverside Yard", driverId: "Sam Okafor", assetId: created.id,
    });
  });

  it("validates vehicle fields on create and merges + re-validates them on edit", async () => {
    const token = await tokenFor(newOrg());
    const bad = await createAsset(send("POST", token, {
      name: "Van", type: "Vehicle", site: "North Depot", capacity_kw: 11, specs: { vehicleType: "van", batteryKwh: 75 },
    }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).detail).toMatch(/Registration/);

    const ok = await createAsset(send("POST", token, {
      name: "Van", type: "Vehicle", site: "North Depot", capacity_kw: 11, specs: { vehicleType: "van", reg: "AB12 CDE", batteryKwh: 75 },
    }));
    const { id } = await ok.json();
    const params = { params: Promise.resolve({ id }) };

    const merged = await patchAsset(send("PATCH", token, { specs: { driver: "Priya" } }), params);
    expect(merged.status).toBe(200);
    expect((await merged.json()).specs).toEqual({ vehicleType: "van", reg: "AB12 CDE", batteryKwh: 75, driver: "Priya" });

    const outOfRange = await patchAsset(send("PATCH", token, { specs: { batteryKwh: 99999 } }), params);
    expect(outOfRange.status).toBe(400);
  });

  it("a pilot (read-only) account can't register vehicles", async () => {
    const token = await tokenFor(newOrg(), "pilot");
    const res = await createAsset(send("POST", token, {
      name: "Van", type: "Vehicle", site: "North Depot", capacity_kw: 11, specs: { vehicleType: "van", reg: "AB12 CDE", batteryKwh: 75 },
    }));
    expect(res.status).toBe(403);
  });
});

describe("solar and battery dashboards follow registered assets too", () => {
  it("demo data until assets are added, then sized from them", async () => {
    const token = await tokenFor(newOrg());
    expect(((await (await solar(get(token))).json()) as SolarMonitor).source).toBe("demo");

    await createAsset(send("POST", token, { name: "Warehouse roof", type: "Solar", site: "East Hub", capacity_kw: 120, specs: { panelCount: 300 } }));
    await createAsset(send("POST", token, { name: "Depot battery", type: "Battery", site: "East Hub", capacity_kw: 100, specs: { capacityKwh: 215, chemistry: "LFP" } }));

    const s: SolarMonitor = await (await solar(get(token))).json();
    expect(s.source).toBe("assets");
    expect(s.capacityKwp).toBe(120);
    expect(s.inverters.map((i) => i.name)).toEqual(["Warehouse roof"]);
    expect(s.inverters[0].site).toBe("East Hub");

    const b: BatteryMonitor = await (await battery(get(token))).json();
    expect(b.source).toBe("assets");
    expect(b.totalCapacityKwh).toBe(215);
    expect(b.units[0]).toMatchObject({ name: "Depot battery", capacityKwh: 215 });
  });

  it("requires a session", async () => {
    expect((await fleet(new Request("http://x/api"))).status).toBe(401);
  });
});

describe("simulations follow the time of day", () => {
  it("batteries charge at midday, discharge in the evening and idle overnight; vehicles go out and come back", async () => {
    const { vi } = await import("vitest");
    const { asTenant } = await import("@/lib/server/context");
    const { batteryMonitoring, fleetMonitoring } = await import("@/lib/server/deviceMonitoring");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const flows = new Set<string>();
      const statuses = new Set<string>();
      for (const h of [2, 7, 9, 12, 15, 18, 21]) {
        vi.setSystemTime(new Date(2026, 9, 10, h, 30));
        for (const org of ["davwo", "acme", "pilot-mcr", "growth-leeds"]) {
          const b = await asTenant(org, () => batteryMonitoring());
          flows.add(b.flow);
          const f = await asTenant(org, () => fleetMonitoring());
          f.vehicles.forEach((v) => statuses.add(v.status));
        }
      }
      expect([...flows].sort()).toEqual(["charging", "discharging", "idle"]);
      for (const s of ["in_use", "charging", "ready"]) expect(statuses).toContain(s);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a depot name the map doesn't know still gets a stable spot", async () => {
    const { siteLocation } = await import("@/lib/server/deviceMonitoring");
    const a = siteLocation("Somewhere New Yard");
    expect(a).toEqual(siteLocation("  somewhere new yard "));
    expect(a).not.toEqual(siteLocation("North Depot"));
  });
});
