import { NextResponse } from "next/server";
import { getAuth } from "@/lib/server/auth";
import { resolveVendor, saveLead } from "@/lib/server/marketplace";
import { sendEmail, emailShell, escapeHtml, isEmailConfigured } from "@/lib/server/email";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`marketplace-contact:${clientKey(req)}`, 10, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const vendorId: string = (body?.vendorId ?? "").toString();
  const name: string = (body?.name ?? "").toString().trim().slice(0, 120);
  const email: string = (body?.email ?? "").toString().trim().slice(0, 200);
  const message: string = (body?.message ?? "").toString().trim().slice(0, 1000);

  if (!vendorId || !name || !email || !message) {
    return NextResponse.json({ detail: "name, email and message are required" }, { status: 400 });
  }
  const vendor = await resolveVendor(vendorId);
  if (!vendor) {
    return NextResponse.json({ detail: "Vendor not found" }, { status: 404 });
  }

  const persisted = await saveLead({
    vendorId,
    name,
    email,
    message,
    orgId: claims.org,
    userId: claims.sub,
  });

  // Best-effort — a supplier missing this notification isn't a reason to
  // fail the enquiry itself; the lead is already saved and visible in their
  // portal either way. Same graceful no-op-without-a-key pattern as every
  // other email in this codebase.
  let notified = false;
  if (isEmailConfigured() && vendor.contact_email) {
    const sent = await sendEmail({
      to: vendor.contact_email,
      subject: `New enquiry via Davwo Marketplace`,
      html: emailShell(
        "New enquiry",
        `<p>${escapeHtml(name)} (${escapeHtml(email)}) sent an enquiry about <b>${escapeHtml(vendor.name)}</b>:</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      ),
    });
    notified = sent.sent;
  }

  return NextResponse.json({ ok: true, persisted, notified });
}
