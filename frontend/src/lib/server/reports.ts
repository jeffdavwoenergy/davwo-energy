import PDFDocument from "pdfkit";
import { metrics, energySeries, assets, insights } from "@/lib/server/providers";

export type ReportPeriod = "daily" | "weekly" | "monthly";
export type ReportCategory = "energy" | "asset" | "carbon" | "ani";

export const REPORT_PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];
export const REPORT_CATEGORIES: ReportCategory[] = ["energy", "asset", "carbon", "ani"];

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
};

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
