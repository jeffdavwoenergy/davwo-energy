import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { notifications } from "@/lib/server/providers";
import { sendEmail, emailShell, escapeHtml, isEmailConfigured } from "@/lib/server/email";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const SEV_COLOR = { high: "#ef4444", medium: "#f59e0b", low: "#0ea5e9" } as const;

export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`notif-email:${clientKey(req)}`, 5, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ sent: false, reason: "Email is not configured yet (RESEND_API_KEY not set)." }, { status: 200 });
  }

  const { items, unread } = await notifications(claims.org);
  const rows = items.slice(0, 15).map((n) =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${SEV_COLOR[n.severity]};margin-right:8px"></span>
        <strong>${escapeHtml(n.title)}</strong><br>
        <span style="color:#64748b;font-size:13px">${escapeHtml(n.detail)}${n.status === "acknowledged" ? " · acknowledged" : ""}</span>
      </td>
    </tr>`,
  ).join("");

  const html = emailShell(
    `You have ${unread} unread alert${unread === 1 ? "" : "s"}`,
    items.length
      ? `<table style="width:100%;border-collapse:collapse">${rows}</table>`
      : `<p style="color:#64748b">No active alerts — your network is healthy.</p>`,
  );

  const result = await sendEmail({
    to: claims.email,
    subject: `Ask ANI™ — ${unread} unread alert${unread === 1 ? "" : "s"}`,
    html,
  });
  return NextResponse.json(result, { status: result.sent ? 200 : 502 });
}
