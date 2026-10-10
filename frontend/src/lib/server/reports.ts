import PDFDocument from "pdfkit";
import { metrics, energySeries, assets, insights } from "@/lib/server/providers";
import { deviceMonitors } from "@/lib/server/deviceInsights";
import { fleetAnalytics, solarAnalytics, batteryAnalytics, type AnalyticsPeriod } from "@/lib/server/deviceAnalytics";

export type ReportPeriod = "daily" | "weekly" | "monthly";
export type ReportCategory = "energy" | "asset" | "carbon" | "ani" | "fleet" | "drivers" | "solar" | "battery";

export const REPORT_PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];
export const REPORT_CATEGORIES: ReportCategory[] = ["energy", "asset", "carbon", "ani", "fleet", "drivers", "solar", "battery"];

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  daily: "Last 24 hours",
  weekly: "Last 7 days",
  monthly: "Last 4 weeks",
};
const PERIOD_TO_SERIES: Record<ReportPeriod, "day" | "week" | "month"> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};
const CATEGORY_LABEL: Record<ReportCategory, string> = {
  energy: "Energy Report",
  asset: "Asset Report",
  carbon: "Carbon Report",
  ani: "ANI Report",
  fleet: "Fleet Report",
  drivers: "Home-Charging Repayment Statement",
  solar: "Solar Generation Report",
  battery: "Battery Savings Report",
};
const PERIOD_TO_ANALYTICS: Record<ReportPeriod, AnalyticsPeriod> = { daily: "day", weekly: "week", monthly: "month" };
const DAYS: Record<ReportPeriod, number> = { daily: 1, weekly: 7, monthly: 28 };
/** Home charging is repaid at this rate per kWh (matches the fleet dashboard). */
export const HOME_CHARGE_PENCE = 29;
const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-GB");

/** Fleet, driver repayment, solar and battery reports — built from the same
 * simulations and analytics as their pages, so the numbers agree. */
async function buildDeviceReport(
  period: ReportPeriod, category: "fleet" | "drivers" | "solar" | "battery", orgId: string, base: { title: string; subtitle: string; generatedAt: string },
): Promise<ReportData> {
  const m = await deviceMonitors(orgId);
  const ap = PERIOD_TO_ANALYTICS[period];

  if (category === "fleet") {
    const a = fleetAnalytics(m.fleet, ap);
    const faults = new Map(m.fleet.vehicles.map((v) => [v.id, v.faults.length]));
    return {
      ...base,
      kpis: [
        { label: "Miles Driven", value: `${num(a.totals.miles)} mi` },
        { label: "Energy Used", value: `${num(a.totals.kwh)} kWh` },
        { label: "Energy Cost", value: gbp(a.totals.costGbp) },
        { label: "Cost per Mile", value: `£${a.totals.costPerMileGbp.toFixed(3)}` },
        { label: "CO₂ Saved vs Diesel", value: `${num(a.totals.co2SavedKg)} kg` },
        { label: "Open Faults", value: String(m.fleet.faultCounts.critical + m.fleet.faultCounts.warning + m.fleet.faultCounts.info) },
        { label: "Vehicles Off the Road", value: String(m.fleet.vehicles.filter((v) => v.status === "fault").length) },
      ],
      tableTitle: "Vehicles",
      tableColumns: ["Vehicle", "Registration", "Miles", "kWh", "mi/kWh", "£/mile", "Days in use %", "CO₂ saved kg", "Open faults"],
      tableRows: a.vehicles.map((v) => [v.name, v.reg, v.miles, v.kwh, v.miPerKwh, v.costPerMileGbp, v.utilisationPct, v.co2SavedKg, faults.get(v.id) ?? 0]),
      dataMode: "synthetic",
    };
  }

  if (category === "drivers") {
    // The dashboard's per-driver figures are a typical working day; scale to the period.
    const factor = (DAYS[period] * 5) / 7;
    const rows = m.fleet.reimbursements.map((d) => {
      const kwh = Math.round(d.homeEnergyKwh * factor * 10) / 10;
      return { driver: d.driverId, sessions: Math.max(1, Math.round(d.sessions * factor)), kwh, amount: Math.round(kwh * HOME_CHARGE_PENCE) / 100 };
    });
    return {
      ...base,
      kpis: [
        { label: "Drivers", value: String(rows.length) },
        { label: "Home Energy", value: `${num(Math.round(rows.reduce((s, r) => s + r.kwh, 0)))} kWh` },
        { label: "Total to Repay", value: gbp(rows.reduce((s, r) => s + r.amount, 0)) },
        { label: "Rate", value: `${HOME_CHARGE_PENCE}p per kWh` },
      ],
      tableTitle: "Repayment per Driver (home addresses are not included)",
      tableColumns: ["Driver", "Sessions", "Home energy kWh", "Rate p/kWh", "Amount £"],
      tableRows: rows.map((r) => [r.driver, r.sessions, r.kwh, HOME_CHARGE_PENCE, r.amount]),
      dataMode: "synthetic",
    };
  }

  if (category === "solar") {
    const a = solarAnalytics(m.solar, ap);
    return {
      ...base,
      kpis: [
        { label: "Generated", value: `${num(a.totals.kwh)} kWh` },
        { label: "Exported", value: `${num(a.days.reduce((s, d) => s + d.exportKwh, 0))} kWh` },
        { label: "Export Earnings", value: gbp(a.totals.exportEarningsGbp) },
        { label: "Used On Site", value: `${a.totals.selfUsePct}%` },
        { label: "Performance", value: `${a.totals.avgPerformancePct}%` },
        { label: "CO₂ Avoided", value: `${num(a.totals.co2AvoidedKg)} kg` },
      ],
      tableTitle: "Daily Generation & Export (for Smart Export Guarantee records)",
      tableColumns: ["Date", "Generated kWh", "Expected kWh", "Used on site kWh", "Exported kWh", "Performance %"],
      tableRows: a.days.map((d) => [d.date, d.kwh, d.expectedKwh, d.selfUseKwh, d.exportKwh, d.performancePct]),
      dataMode: "synthetic",
    };
  }

  const a = batteryAnalytics(m.battery, ap);
  return {
    ...base,
    kpis: [
      { label: "Savings", value: gbp(a.totals.savingsGbp) },
      { label: "Cycles", value: String(a.totals.cycles) },
      { label: "Energy Delivered", value: `${num(a.totals.dischargedKwh)} kWh` },
      { label: "Round-trip Efficiency", value: `${a.totals.roundTripPct}%` },
      { label: "Battery Health", value: `${m.battery.healthPct}%` },
    ],
    tableTitle: "Daily Battery Activity",
    tableColumns: ["Date", "Cycles", "Charged kWh", "Delivered kWh", "Saved £"],
    tableRows: a.days.map((d) => [d.date, d.cycles, d.chargedKwh, d.dischargedKwh, d.savingsGbp]),
    dataMode: "synthetic",
  };
}

export interface ReportData {
  title: string;
  subtitle: string;
  generatedAt: string;
  kpis: { label: string; value: string }[];
  tableTitle: string;
  tableColumns: string[];
  tableRows: (string | number)[][];
  dataMode: string;
}

export async function buildReport(period: ReportPeriod, category: ReportCategory, orgId: string): Promise<ReportData> {
  const generatedAt = new Date().toISOString();
  const subtitle = `${PERIOD_LABEL[period]} · Generated ${new Date(generatedAt).toLocaleString("en-GB")}`;

  if (category === "fleet" || category === "drivers" || category === "solar" || category === "battery") {
    return buildDeviceReport(period, category, orgId, { title: CATEGORY_LABEL[category], subtitle, generatedAt });
  }

  if (category === "asset") {
    const list = await assets(orgId);
    const avgUtil = list.length ? Math.round(list.reduce((s, a) => s + a.utilisation_pct, 0) / list.length) : 0;
    return {
      title: CATEGORY_LABEL.asset,
      subtitle,
      generatedAt,
      kpis: [
        { label: "Total Assets", value: String(list.length) },
        { label: "Healthy", value: String(list.filter((a) => a.status === "healthy").length) },
        { label: "Avg Utilisation", value: `${avgUtil}%` },
      ],
      tableTitle: "Asset Register",
      tableColumns: ["Asset", "Type", "Status", "Utilisation %", "Capacity kW", "Load kW"],
      tableRows: list.map((a) => [a.name, a.type, a.status, a.utilisation_pct, a.capacity_kw, a.current_load_kw]),
      dataMode: "synthetic",
    };
  }

  if (category === "ani") {
    const list = insights();
    return {
      title: CATEGORY_LABEL.ani,
      subtitle,
      generatedAt,
      kpis: [
        { label: "Total Findings", value: String(list.length) },
        { label: "High Severity", value: String(list.filter((i) => i.severity === "high").length) },
      ],
      tableTitle: "ANI Findings",
      tableColumns: ["Asset", "Type", "Severity", "Recommendation", "Confidence %"],
      tableRows: list.map((i) => [i.asset, i.type, i.severity, i.recommendation, Math.round(i.confidence * 100)]),
      dataMode: "synthetic",
    };
  }

  const m = await metrics(orgId);
  const series = await energySeries(orgId, PERIOD_TO_SERIES[period]);

  if (category === "carbon") {
    return {
      title: CATEGORY_LABEL.carbon,
      subtitle,
      generatedAt,
      kpis: [
        { label: "CO₂ Avoided", value: `${m.today_summary.co2_avoided_tco2} tCO₂` },
        { label: "Grid Carbon", value: m.carbon_intensity_gco2_kwh != null ? `${m.carbon_intensity_gco2_kwh} gCO₂/kWh` : "—" },
        { label: "Data Mode", value: m.data_mode },
      ],
      tableTitle: "Energy Series (context for carbon impact)",
      tableColumns: ["Period", "Energy (MWh)"],
      tableRows: series.map((p) => [p.time, p.value]),
      dataMode: m.data_mode,
    };
  }

  return {
    title: CATEGORY_LABEL.energy,
    subtitle,
    generatedAt,
    kpis: [
      { label: "Energy Delivered", value: `${m.energy_consumption_mwh} MWh` },
      { label: "Avg Cost / kWh", value: `£${m.average_cost_per_kwh}` },
      { label: "Sessions", value: String(m.charging_sessions) },
      { label: "Revenue", value: `£${m.today_summary.total_revenue_gbp}` },
    ],
    tableTitle: "Energy Series",
    tableColumns: ["Period", "Energy (MWh)"],
    tableRows: series.map((p) => [p.time, p.value]),
    dataMode: m.data_mode,
  };
}

function csvEscape(v: string | number): string {
  // Numbers are never formula-injection vectors and shouldn't be quote-prefixed.
  if (typeof v === "number") return String(v);
  let s = v;
  // Neutralise CSV/spreadsheet formula injection: a cell beginning with
  // =, +, -, @, tab or CR is executed as a formula by Excel/Sheets. Asset
  // names and sites are user-supplied (via /api/assets) and flow into the
  // asset report, so prefix a single quote to force text interpretation.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportToCsv(report: ReportData): string {
  const lines: string[] = [`# ${report.title}`, `# ${report.subtitle}`, "", "Metric,Value"];
  for (const k of report.kpis) lines.push(`${csvEscape(k.label)},${csvEscape(k.value)}`);
  lines.push("", report.tableColumns.map(csvEscape).join(","));
  for (const row of report.tableRows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\n");
}

export function reportToPdfBuffer(report: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor("#0f172a").text("DAVWO / ANI");
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor("#0f172a").text(report.title);
    doc.fontSize(9).fillColor("#64748b").text(report.subtitle);
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#0f172a");
    for (const k of report.kpis) {
      doc.text(`${k.label}:  `, { continued: true }).fillColor("#059669").text(k.value);
      doc.fillColor("#0f172a");
    }
    doc.moveDown(1);

    doc.fontSize(12).fillColor("#0f172a").text(report.tableTitle);
    doc.moveDown(0.4);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - left - doc.page.margins.right;
    const colWidth = usableWidth / report.tableColumns.length;

    doc.fontSize(9).fillColor("#475569");
    let y = doc.y;
    report.tableColumns.forEach((col, i) => doc.text(col, left + i * colWidth, y, { width: colWidth }));
    y += 14;
    doc.moveTo(left, y - 4).lineTo(left + usableWidth, y - 4).strokeColor("#e2e8f0").stroke();

    for (const row of report.tableRows) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      row.forEach((cell, i) => doc.fillColor("#0f172a").text(String(cell), left + i * colWidth, y, { width: colWidth }));
      y += 16;
    }

    doc.end();
  });
}
