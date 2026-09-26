import { describe, it, expect } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/data/regions/uk", () => ({
  fetchCarbonIntensity: vi.fn().mockResolvedValue(null),
  fetchCarbonForecast: vi.fn().mockResolvedValue(null),
  fetchOctopusAgile: vi.fn().mockResolvedValue(null),
  fetchOctopusWindow: vi.fn().mockResolvedValue(null),
  fetchWeather: vi.fn().mockResolvedValue(null),
  fetchChargePoints: vi.fn().mockResolvedValue(null),
  GRID_BASELINE_GCO2: 233,
}));

import {
  buildReport,
  reportToCsv,
  reportToPdfBuffer,
  REPORT_CATEGORIES,
  REPORT_PERIODS,
} from "@/lib/server/reports";

describe("buildReport", () => {
  it("builds a report for every category/period combination", async () => {
    for (const category of REPORT_CATEGORIES) {
      for (const period of REPORT_PERIODS) {
        const r = await buildReport(period, category, "test-org");
        expect(r.title).toBeTruthy();
        expect(r.kpis.length).toBeGreaterThan(0);
        expect(r.tableColumns.length).toBeGreaterThan(0);
      }
    }
  });

  it("asset report reflects the synthetic fleet", async () => {
    const r = await buildReport("daily", "asset", "test-org");
    expect(r.tableRows.length).toBeGreaterThan(0);
    expect(r.tableColumns).toContain("Utilisation %");
  });

  it("ani report reflects insights", async () => {
    const r = await buildReport("weekly", "ani", "test-org");
    expect(r.tableColumns).toContain("Recommendation");
  });

  it("energy and carbon reports fall back to synthetic data mode with no live sources", async () => {
    const energy = await buildReport("daily", "energy", "test-org");
    const carbon = await buildReport("daily", "carbon", "test-org");
    expect(energy.dataMode).toBe("synthetic");
    expect(carbon.dataMode).toBe("synthetic");
  });
});

describe("reportToCsv", () => {
  it("produces a CSV with a title header and a Metric,Value section", async () => {
    const r = await buildReport("daily", "energy", "test-org");
    const csv = reportToCsv(r);
    expect(csv.split("\n")[0]).toBe(`# ${r.title}`);
    expect(csv).toContain("Metric,Value");
    expect(csv).toContain(r.tableColumns.join(","));
  });

  it("escapes values containing commas and quotes", () => {
    const csv = reportToCsv({
      title: "T",
      subtitle: "S",
      generatedAt: "now",
      kpis: [{ label: "L, with comma", value: 'has "quotes"' }],
      tableTitle: "Tbl",
      tableColumns: ["A"],
      tableRows: [["x,y"]],
      dataMode: "synthetic",
    });
    expect(csv).toContain('"L, with comma"');
    expect(csv).toContain('"has ""quotes"""');
    expect(csv).toContain('"x,y"');
  });

  it("neutralises spreadsheet formula injection in user-supplied string cells", () => {
    const csv = reportToCsv({
      title: "T",
      subtitle: "S",
      generatedAt: "now",
      kpis: [],
      tableTitle: "Tbl",
      tableColumns: ["Asset"],
      tableRows: [
        ['=HYPERLINK("http://evil","x")'],
        ["+1+1"],
        ["-2"],
        ["@SUM(A1)"],
      ],
    dataMode: "synthetic",
    });
    // Each dangerous leading char is prefixed with ' so it's parsed as text.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@SUM(A1)");
  });

  it("does not prefix legitimate numeric cells", () => {
    const csv = reportToCsv({
      title: "T",
      subtitle: "S",
      generatedAt: "now",
      kpis: [],
      tableTitle: "Tbl",
      tableColumns: ["Load"],
      tableRows: [[-5], [42]],
      dataMode: "synthetic",
    });
    expect(csv).toContain("\n-5");
    expect(csv).toContain("\n42");
    expect(csv).not.toContain("'-5");
  });
});

describe("reportToPdfBuffer", () => {
  it("produces a non-empty PDF buffer with the correct magic bytes", async () => {
    const r = await buildReport("monthly", "carbon", "test-org");
    const buf = await reportToPdfBuffer(r);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("paginates without throwing when the table has many rows", async () => {
    const r = await buildReport("daily", "energy", "test-org");
    const bigReport = { ...r, tableRows: Array.from({ length: 100 }, (_, i) => [`row-${i}`, i]) };
    const buf = await reportToPdfBuffer(bigReport);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
