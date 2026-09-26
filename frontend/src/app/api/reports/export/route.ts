import { NextResponse } from "next/server";
import { withTenant, currentOrg, UnauthorizedError } from "@/lib/server/context";
import {
  buildReport,
  reportToCsv,
  reportToPdfBuffer,
  REPORT_CATEGORIES,
  REPORT_PERIODS,
  type ReportCategory,
  type ReportPeriod,
} from "@/lib/server/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pdfkit needs Node APIs, not the edge runtime

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const category = (sp.get("category") || "energy") as ReportCategory;
  const period = (sp.get("period") || "daily") as ReportPeriod;
  const format = sp.get("format") || "csv";

  if (!REPORT_CATEGORIES.includes(category)) {
    return NextResponse.json({ detail: "Unknown category" }, { status: 400 });
  }
  if (!REPORT_PERIODS.includes(period)) {
    return NextResponse.json({ detail: "Unknown period" }, { status: 400 });
  }
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ detail: "Unknown format" }, { status: 400 });
  }

  try {
    const report = await withTenant(req, () => buildReport(period, category, currentOrg()));
    const filename = `davwo-${category}-${period}-report.${format}`;

    if (format === "csv") {
      return new NextResponse(reportToCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const buffer = await reportToPdfBuffer(report);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
