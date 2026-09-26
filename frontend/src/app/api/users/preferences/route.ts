import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { getPreferences, updatePreferences } from "@/lib/server/users";
import { REPORT_PERIODS, REPORT_CATEGORIES } from "@/lib/server/reports";
import type { Preferences, ReportSchedule } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getPreferences(claims.sub));
}

/** period/category fall back to the caller's existing schedule (not a fixed
 * default) when omitted — reportSchedule is stored as one JSON value, not
 * merged field-by-field like the top-level preference toggles, so a client
 * that PATCHes just {enabled: false} must not silently reset the category/
 * cadence the user had already chosen. */
function parseReportSchedule(body: unknown, existing?: ReportSchedule): ReportSchedule | undefined {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return undefined;
  const period = REPORT_PERIODS.includes(b.period as never)
    ? (b.period as ReportSchedule["period"])
    : (existing?.period ?? "weekly");
  const category = REPORT_CATEGORIES.includes(b.category as never)
    ? (b.category as ReportSchedule["category"])
    : (existing?.category ?? "energy");
  return { enabled: b.enabled, period, category };
}

export async function PATCH(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<Preferences> = {};
  if (typeof body?.liveData === "boolean") updates.liveData = body.liveData;
  if (typeof body?.emailAlerts === "boolean") updates.emailAlerts = body.emailAlerts;
  if (typeof body?.autoOptimise === "boolean") updates.autoOptimise = body.autoOptimise;
  if (body?.reportSchedule !== undefined) {
    const current = await getPreferences(claims.sub);
    const schedule = parseReportSchedule(body.reportSchedule, current.reportSchedule);
    if (!schedule) return NextResponse.json({ detail: "reportSchedule.enabled must be a boolean" }, { status: 400 });
    updates.reportSchedule = schedule;
  }

  return NextResponse.json(await updatePreferences(claims.sub, updates));
}
