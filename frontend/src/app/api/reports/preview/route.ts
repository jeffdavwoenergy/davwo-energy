import { NextResponse } from "next/server";
import { tenantJson, currentOrg } from "@/lib/server/context";
import { buildReport, REPORT_CATEGORIES, REPORT_PERIODS, type ReportCategory, type ReportPeriod } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** The same report the PDF/CSV export produces, as JSON for the on-page preview. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const category = (sp.get("category") || "energy") as ReportCategory;
  const period = (sp.get("period") || "weekly") as ReportPeriod;
  if (!REPORT_CATEGORIES.includes(category) || !REPORT_PERIODS.includes(period)) {
    return NextResponse.json({ detail: "Unknown category or period" }, { status: 400 });
  }
  return tenantJson(req, () => buildReport(period, category, currentOrg()));
}
