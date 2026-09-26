import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendEmail, isEmailConfigured, emailShell, escapeHtml } from "@/lib/server/email";

describe("email (no key configured)", () => {
  beforeEach(() => { vi.unstubAllEnvs(); sendMock.mockReset(); });
  afterEach(() => vi.unstubAllEnvs());

  it("isEmailConfigured reflects RESEND_API_KEY presence", () => {
    expect(isEmailConfigured()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(isEmailConfigured()).toBe(true);
  });

  it("sendEmail is a graceful no-op without a key (never calls the SDK)", async () => {
    const r = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>x</p>" });
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/not configured/i);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("email (key configured)", () => {
  beforeEach(() => { vi.unstubAllEnvs(); sendMock.mockReset(); vi.stubEnv("RESEND_API_KEY", "re_test"); });
  afterEach(() => vi.unstubAllEnvs());

  it("sends and returns the id on success", async () => {
    sendMock.mockResolvedValue({ data: { id: "em_123" }, error: null });
    const r = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>x</p>" });
    expect(r.sent).toBe(true);
    expect(r.id).toBe("em_123");
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("reports provider errors without throwing", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const r = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>x</p>" });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("domain not verified");
  });

  it("catches thrown SDK errors", async () => {
    sendMock.mockRejectedValue(new Error("network down"));
    const r = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>x</p>" });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("network down");
  });

  it("forwards attachments to the SDK", async () => {
    sendMock.mockResolvedValue({ data: { id: "em_att" }, error: null });
    const pdf = Buffer.from("fake-pdf-bytes");
    const r = await sendEmail({
      to: "a@b.com", subject: "Report", html: "<p>x</p>",
      attachments: [{ filename: "report.pdf", content: pdf }],
    });
    expect(r.sent).toBe(true);
    expect(sendMock.mock.calls[0][0].attachments).toEqual([{ filename: "report.pdf", content: pdf }]);
  });
});

describe("emailShell", () => {
  it("wraps content with DAVWO branding and the title", () => {
    const html = emailShell("My Title", "<p>body</p>");
    expect(html).toContain("DAVWO");
    expect(html).toContain("My Title");
    expect(html).toContain("<p>body</p>");
  });
});

describe("escapeHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<script>alert('x')</script> & "quoted"`)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Depot Rapid 1 — Leeds")).toBe("Depot Rapid 1 — Leeds");
  });

  it("neutralises a stored-HTML-injection attempt in a user-supplied field", () => {
    const malicious = `<img src=x onerror=alert(document.cookie)>`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;img");
  });
});
