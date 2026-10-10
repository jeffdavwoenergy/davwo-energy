import { describe, it, expect } from "vitest";
import { buildReport, reportToCsv, HOME_CHARGE_PENCE, REPORT_CATEGORIES } from "@/lib/server/reports";
import { deviceMonitors } from "@/lib/server/deviceInsights";
import { GET as preview } from "@/app/api/reports/preview/route";
import { GET as exportRoute } from "@/app/api/reports/export/route";
import { signToken } from "@/lib/server/jwt";

const org = () => `org-rep-${Math.random().toString(36).slice(2)}`;

describe("device reports", () => {
  it("fleet report: one row per vehicle with mileage, cost, carbon and open faults", async () => {
    const o = org();
    const r = await buildReport("weekly", "fleet", o);
    const m = await deviceMonitors(o);
    expect(r.title).toBe("Fleet Report");
    expect(r.subtitle).toMatch(/Last 7 days/);
    expect(r.tableRows).toHaveLength(m.fleet.vehicles.length);
    expect(r.tableColumns).toContain("Open faults");
    expect(r.kpis.map((k) => k.label)).toEqual(expect.arrayContaining(["Miles Driven", "Cost per Mile", "Vehicles Off the Road"]));
  });

  it("driver statement: repayments scale with the period at the stated rate, without addresses", async () => {
    const o = org();
    const day = await buildReport("daily", "drivers", o);
    const month = await buildReport("monthly", "drivers", o);
    expect(day.title).toBe("Home-Charging Repayment Statement");
    expect(day.tableTitle).toMatch(/home addresses are not included/);
    for (const row of month.tableRows) {
      const [, , kwh, rate, amount] = row as [string, number, number, number, number];
      expect(rate).toBe(HOME_CHARGE_PENCE);
      expect(amount).toBeCloseTo((kwh * HOME_CHARGE_PENCE) / 100, 2);
    }
    const kwhOf = (rows: (string | number)[][]) => rows.reduce((s, r) => s + (r[2] as number), 0);
    expect(kwhOf(month.tableRows)).toBeGreaterThan(kwhOf(day.tableRows) * 10);
  });

  it("solar and battery reports carry daily rows for the period", async () => {
    const o = org();
    const solar = await buildReport("weekly", "solar", o);
    expect(solar.tableRows).toHaveLength(7);
    expect(solar.tableColumns).toContain("Exported kWh");
    const battery = await buildReport("monthly", "battery", o);
    expect(battery.tableRows).toHaveLength(30);
    expect(battery.kpis[0].label).toBe("Savings");
    expect(reportToCsv(battery)).toMatch(/^# Battery Savings Report/);
  });

  it("every category is exportable and previewable; unknown ones are rejected", async () => {
    expect(REPORT_CATEGORIES).toEqual(expect.arrayContaining(["fleet", "drivers", "solar", "battery"]));
    const token = await signToken({ sub: "u", email: "u@x.com", role: "admin", org: org() });
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const body = await (await preview(new Request("http://x/api/reports/preview?category=solar&period=daily", auth))).json();
    expect(body.title).toBe("Solar Generation Report");
    expect((await preview(new Request("http://x/api/reports/preview?category=nope", auth))).status).toBe(400);
    expect((await preview(new Request("http://x/api/reports/preview?category=fleet"))).status).toBe(401);
    const csv = await exportRoute(new Request("http://x/api/reports/export?category=drivers&period=weekly&format=csv", auth));
    expect(csv.headers.get("Content-Disposition")).toMatch(/davwo-drivers-weekly-report\.csv/);
    expect(await csv.text()).toMatch(/Driver,Sessions,Home energy kWh/);
  });
});
