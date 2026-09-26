import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listUsersWithReportsEnabled } from "@/lib/server/users";
import { buildReport, reportToPdfBuffer } from "@/lib/server/reports";
import { sendEmail, emailShell, isEmailConfigured } from "@/lib/server/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pdfkit needs Node APIs, not the edge runtime

/** Constant-time comparison — this endpoint is publicly reachable and gates
 * a mass report-send, so a naive `!==` would leak the secret one byte at a
 * time via response-timing differences. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Driven by vercel.json's daily cron entry — this deployment has no other
 * background-job mechanism (see PHASE2_BUILD_PLAN.md), so Vercel Cron is the
 * one real "run this on a schedule" primitive available. Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically for scheduled
 * invocations once that env var is set on the project — this route checks
 * it so nobody else can trigger a mass report-send.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const subscribers = await listUsersWithReportsEnabled();
  if (!isEmailConfigured()) {
    return NextResponse.json({ subscribers: subscribers.length, sent: 0, skipped: "email not configured" });
  }

  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isFirstOfMonth = now.getUTCDate() === 1;

  let sent = 0;
  const errors: string[] = [];
  for (const { user, schedule } of subscribers) {
    if (schedule.period === "weekly" && !isMonday) continue;
    if (schedule.period === "monthly" && !isFirstOfMonth) continue;

    try {
      const report = await buildReport(schedule.period, schedule.category, user.orgId);
      const pdf = await reportToPdfBuffer(report);
      const result = await sendEmail({
        to: user.email,
        subject: `Ask ANI™ — your ${schedule.period} ${schedule.category} report`,
        html: emailShell(report.title, `<p>${report.subtitle}</p><p>Your scheduled report is attached as a PDF.</p>`),
        attachments: [{ filename: `davwo-${schedule.category}-${schedule.period}-report.pdf`, content: pdf }],
      });
      if (result.sent) sent++;
      else errors.push(`${user.email}: ${result.reason ?? "send failed"}`);
    } catch (err) {
      errors.push(`${user.email}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ subscribers: subscribers.length, sent, errors });
}
