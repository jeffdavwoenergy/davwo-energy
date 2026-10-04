import { describe, it, expect, vi, beforeEach } from "vitest";

const tokens: { ani: string | null; supplier: string | null } = { ani: null, supplier: null };
vi.mock("@/lib/api", () => ({ getToken: () => tokens.ani }));
vi.mock("@/lib/supplierApi", () => ({ getSupplierToken: () => tokens.supplier }));

const { switchTarget, tokenEmail, hasMatchingSession } = await import("@/lib/portalSwitch");

/** Unsigned JWT-shaped token carrying just an email claim (the switcher only reads the payload). */
function fakeToken(email: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ email, sub: "x" })}.sig`;
}

describe("portal switching", () => {
  beforeEach(() => {
    tokens.ani = null;
    tokens.supplier = null;
  });

  it("reads the email claim from a token, case-insensitively, and tolerates junk", () => {
    expect(tokenEmail(fakeToken("Admin@Davwo.com"))).toBe("admin@davwo.com");
    expect(tokenEmail("not-a-token")).toBeUndefined();
    expect(tokenEmail(null)).toBeUndefined();
  });

  it("does NOT reuse another person's ANI™ session — the reported bug", () => {
    tokens.supplier = fakeToken("test-supplier@example.com");
    tokens.ani = fakeToken("admin@davwo.com");
    expect(hasMatchingSession("supplier", "ani")).toBe(false);
    // test-supplier has no ANI™ account → sign-up, not admin's dashboard
    expect(switchTarget("supplier", "ani", false)).toBe("/signup");
    // and if they did have one, they'd be asked to sign in as themselves
    expect(switchTarget("supplier", "ani", true)).toBe("/login?switch=1&email=test-supplier%40example.com");
  });

  it("goes straight to the other dashboard when signed in there as the same email", () => {
    tokens.supplier = fakeToken("admin@davwo.com");
    tokens.ani = fakeToken("admin@davwo.com");
    expect(switchTarget("supplier", "ani", true)).toBe("/dashboard");
    expect(switchTarget("ani", "supplier", true)).toBe("/supplier/dashboard");
  });

  it("goes to the other platform's sign-in when there's no session there yet", () => {
    tokens.ani = fakeToken("admin@davwo.com");
    expect(switchTarget("ani", "supplier", true)).toBe("/supplier/login?switch=1&email=admin%40davwo.com");
  });
});
