import { Resend } from "resend";

/**
 * Email delivery via Resend. Provider-isolated behind sendEmail() so the rest
 * of the app never imports the SDK directly (swap providers here if ever needed).
 * Degrades gracefully: with no RESEND_API_KEY it's a logged no-op that returns
 * { sent: false } — the same "works without the key" pattern as the ANI/data
 * layers, so features that email never crash when email isn't configured yet.
 */
export interface SendResult { sent: boolean; reason?: string; id?: string }

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface EmailAttachment { filename: string; content: Buffer }

export async function sendEmail(opts: {
  to: string; subject: string; html: string; text?: string; attachments?: EmailAttachment[];
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email is not configured (RESEND_API_KEY not set)." };

  // Resend's shared sender works for testing without domain verification;
  // set EMAIL_FROM to a verified address for production deliverability.
  const from = process.env.EMAIL_FROM || "DAVWO ANI <onboarding@resend.dev>";
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text,
      attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true, id: data?.id };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Email send failed." };
  }
}

/** Escapes user-supplied text before it's interpolated into an email's HTML
 * body — emailShell's bodyHtml is otherwise-trusted markup built by the
 * caller, but any raw user input embedded within it (a name, message, free-
 * text field) must go through this first, or a submitter can inject markup/
 * links into an email delivered to someone else's inbox. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Small branded wrapper so every ANI email looks consistent. */
export function emailShell(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
    <div style="background:#0a0f1c;padding:20px 24px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-size:18px;font-weight:700">DAVWO</span>
      <span style="color:#10b981;font-size:12px;margin-left:8px">Ask ANI&#8482;</span>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="font-size:17px;margin:0 0 12px">${title}</h2>
      ${bodyHtml}
      <p style="color:#64748b;font-size:12px;margin-top:20px">Sent by Ask ANI&#8482; · DAVWO Energy Ltd</p>
    </div>
  </div>`;
}
