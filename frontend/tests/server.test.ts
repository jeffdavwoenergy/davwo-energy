import { describe, it, expect, vi } from "vitest";
import { signToken, verifyToken, signSupplierToken, verifySupplierToken } from "@/lib/server/jwt";
import {
  findByEmail, findByRole, findById, checkPassword, publicUser, DEMO_USERS,
  listOrgUsers, inviteUser, EmailInUseError, changePassword, DemoAccountPasswordError,
} from "@/lib/server/users";
import { getTenant, tenantSeed, tenantsForUser, TENANTS } from "@/lib/server/tenants";
import { getAuth, getSupplierAuth, isPlatformAdmin } from "@/lib/server/auth";
import { withTenant, withMutateTenant, tenantJson, currentSeed, currentOrg, UnauthorizedError, ForbiddenError } from "@/lib/server/context";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import { isDbConfigured } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import * as sim from "@/lib/server/simulator";

const bearer = (token: string) =>
  new Request("http://test/api", { headers: { authorization: `Bearer ${token}` } });

/** @types/node marks NODE_ENV readonly; this is the standard escape hatch for tests that toggle it. */
const setNodeEnv = (value: string) => {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
};

describe("jwt", () => {
  it("signs and verifies a token", async () => {
    const token = await signToken({ sub: "u1", email: "a@b.com", role: "admin", org: "davwo" });
    const claims = await verifyToken(token);
    expect(claims.sub).toBe("u1");
    expect(claims.org).toBe("davwo");
  });

  it("falls back to the dev secret outside production when JWT_SECRET is unset", async () => {
    const prevSecret = process.env.JWT_SECRET;
    const prevEnv = process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    setNodeEnv("development");
    try {
      const token = await signToken({ sub: "u2", email: "b@c.com", role: "operator", org: "davwo" });
      expect((await verifyToken(token)).sub).toBe("u2");
    } finally {
      process.env.JWT_SECRET = prevSecret;
      setNodeEnv(prevEnv!);
    }
  });

  it("fails closed when JWT_SECRET is unset in production", async () => {
    const prevSecret = process.env.JWT_SECRET;
    const prevEnv = process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    setNodeEnv("production");
    try {
      await expect(
        signToken({ sub: "u3", email: "c@d.com", role: "admin", org: "davwo" }),
      ).rejects.toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = prevSecret;
      setNodeEnv(prevEnv!);
    }
  });

  it("signs and verifies a supplier token, structurally separate from a customer token", async () => {
    const token = await signSupplierToken({ sub: "supplier-1", email: "vendor@newco.example" });
    const claims = await verifySupplierToken(token);
    expect(claims.sub).toBe("supplier-1");
    expect(claims.kind).toBe("supplier");
  });

  it("verifySupplierToken rejects a genuine customer token (wrong claims shape)", async () => {
    const customerToken = await signToken({ sub: "u-admin", email: "a@b.com", role: "admin", org: "davwo" });
    await expect(verifySupplierToken(customerToken)).rejects.toThrow();
  });

  it("verifyToken rejects a genuine supplier token — real rejection, not just a role/org being undefined", async () => {
    const supplierToken = await signSupplierToken({ sub: "supplier-1", email: "vendor@newco.example" });
    await expect(verifyToken(supplierToken)).rejects.toThrow(/customer token/);
  });
});

describe("getSupplierAuth", () => {
  it("returns null with no/garbage token and the claims with a valid one", async () => {
    expect(await getSupplierAuth(new Request("http://test"))).toBeNull();
    expect(await getSupplierAuth(bearer("garbage"))).toBeNull();
    const token = await signSupplierToken({ sub: "supplier-1", email: "vendor@newco.example" });
    expect((await getSupplierAuth(bearer(token)))!.sub).toBe("supplier-1");
  });

  it("returns null for a customer token presented at a supplier-only route", async () => {
    const customerToken = await signToken({ sub: "u-admin", email: "a@b.com", role: "admin", org: "davwo" });
    expect(await getSupplierAuth(bearer(customerToken))).toBeNull();
  });
});

describe("users (in-memory fallback — no MONGODB_URI configured)", () => {
  it("looks up users and strips passwords", async () => {
    expect(isDbConfigured()).toBe(false);
    expect((await findByEmail("ADMIN@davwo.com "))!.id).toBe("u-admin");
    expect(await findByEmail("nobody@x.com")).toBeUndefined();
    expect((await findByRole("operator"))!.orgId).toBe("davwo");
    expect((await findById("u-pilot"))!.orgId).toBe("pilot-mcr");
    const pub = await publicUser(DEMO_USERS[0]);
    expect("password" in pub).toBe(false);
    expect(pub.orgName).toBe("Davwo Energy");
    expect((await publicUser(DEMO_USERS[0], "pilot-mcr")).orgName).toBe("Northbridge Mobility");
  });

  it("checks the plaintext password for the in-memory fallback", async () => {
    const admin = await findByEmail("admin@davwo.com");
    expect(await checkPassword(admin!, DEMO_USERS[0].password)).toBe(true);
    expect(await checkPassword(admin!, "wrong")).toBe(false);
  });

  it("listOrgUsers scopes to the org and includes invited users", async () => {
    expect((await listOrgUsers("davwo")).map((u) => u.email)).toEqual(
      expect.arrayContaining(["admin@davwo.com", "operator@davwo.com"]),
    );
    const email = `invitee-${Math.random()}@davwo.com`;
    const invited = await inviteUser("davwo", email, "Invitee", "operator");
    expect(invited.user.email).toBe(email);
    expect(invited.emailed).toBe(false); // no RESEND_API_KEY in tests
    expect(invited.tempPassword).toBeTruthy(); // must be relayable, never silently discarded
    expect((await listOrgUsers("davwo")).some((u) => u.email === email)).toBe(true);
  });

  it("inviteUser rejects a duplicate email", async () => {
    await expect(inviteUser("davwo", "admin@davwo.com", "Dup", "admin")).rejects.toThrow(EmailInUseError);
  });

  it("inviteUser rejects re-inviting an already-invited email (in-memory dup check)", async () => {
    const email = `dup-invite-${Math.random()}@davwo.com`;
    await inviteUser("davwo", email, "First", "operator");
    // Second invite of the same address must be caught — invited users live in a
    // separate in-memory array that findByEmail previously ignored.
    await expect(inviteUser("davwo", email, "Second", "operator")).rejects.toThrow(EmailInUseError);
    // And an invited user is now findable by email.
    expect((await findByEmail(email))?.name).toBe("First");
  });

  it("changePassword refuses to mutate shared demo credentials without a DB", async () => {
    await expect(changePassword("u-admin", DEMO_USERS[0].password, "newpass123")).rejects.toThrow(
      DemoAccountPasswordError,
    );
  });
});

describe("password", () => {
  it("hashes and verifies a round trip, rejecting the wrong password", async () => {
    const hash = await hashPassword("Demo@123");
    expect(hash).not.toBe("Demo@123");
    expect(await verifyPassword("Demo@123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("db", () => {
  it("reports configured based on DATABASE_URL presence", () => {
    expect(isDbConfigured()).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgresql://fake");
    expect(isDbConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("tenants", () => {
  it("resolves tenants + seeds + access", async () => {
    expect(getTenant("davwo").seed).toBe(42);
    expect(getTenant("unknown").id).toBe("davwo"); // default
    expect(tenantSeed("pilot-mcr")).toBe(7);
    expect((await tenantsForUser("admin", "davwo")).length).toBe(TENANTS.length);
    expect((await tenantsForUser("operator", "pilot-mcr")).length).toBe(1);
  });

  it("a dynamically-created org's admin sees only their own org, not the demo tenants", async () => {
    const list = await tenantsForUser("admin", "org-does-not-exist");
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("org-does-not-exist");
  });
});

describe("auth", () => {
  it("extracts claims, rejecting missing/invalid tokens", async () => {
    expect(await getAuth(new Request("http://test"))).toBeNull();
    expect(await getAuth(bearer("garbage"))).toBeNull();
    const token = await signToken({ sub: "u-admin", email: "a", role: "admin", org: "davwo" });
    expect((await getAuth(bearer(token)))!.role).toBe("admin");
  });
});

describe("isPlatformAdmin", () => {
  it("is true only for an admin of Davwo Energy's own tenant, not any org's admin", async () => {
    const platformAdmin = await signToken({ sub: "u-admin", email: "a", role: "admin", org: "davwo" });
    expect(isPlatformAdmin((await getAuth(bearer(platformAdmin)))!)).toBe(true);

    // Regression: a customer who self-signs-up is the sole "admin" of their
    // own org — that must NOT unlock platform-wide marketplace moderation.
    const customerAdmin = await signToken({ sub: "u-x", email: "x", role: "admin", org: "some-customer-org" });
    expect(isPlatformAdmin((await getAuth(bearer(customerAdmin)))!)).toBe(false);

    const davwoOperator = await signToken({ sub: "u-operator", email: "o", role: "operator", org: "davwo" });
    expect(isPlatformAdmin((await getAuth(bearer(davwoOperator)))!)).toBe(false);
  });
});

describe("context", () => {
  it("defaults outside a request", () => {
    expect(currentSeed()).toBe(42);
    expect(currentOrg()).toBe("davwo");
  });
  it("scopes seed from the request's org", async () => {
    const token = await signToken({ sub: "u-pilot", email: "p", role: "pilot", org: "pilot-mcr" });
    const seed = await withTenant(bearer(token), () => currentSeed());
    expect(seed).toBe(7);
  });
  it("rejects requests with no valid bearer token", async () => {
    await expect(withTenant(new Request("http://test"), () => currentOrg())).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(withTenant(bearer("garbage"), () => currentOrg())).rejects.toThrow(
      UnauthorizedError,
    );
  });
});

describe("withMutateTenant", () => {
  it("runs the callback for admin and operator roles, same as withTenant", async () => {
    const adminToken = await signToken({ sub: "u-admin", email: "a", role: "admin", org: "davwo" });
    expect(await withMutateTenant(bearer(adminToken), () => currentOrg())).toBe("davwo");

    const operatorToken = await signToken({ sub: "u-operator", email: "o", role: "operator", org: "davwo" });
    expect(await withMutateTenant(bearer(operatorToken), () => currentOrg())).toBe("davwo");
  });

  it("rejects the read-only pilot role with ForbiddenError, not UnauthorizedError", async () => {
    const pilotToken = await signToken({ sub: "u-pilot", email: "p", role: "pilot", org: "pilot-mcr" });
    await expect(withMutateTenant(bearer(pilotToken), () => currentOrg())).rejects.toThrow(ForbiddenError);
  });

  it("still rejects an invalid/missing token with UnauthorizedError (checked before the role gate)", async () => {
    await expect(withMutateTenant(new Request("http://test"), () => currentOrg())).rejects.toThrow(UnauthorizedError);
  });
});

describe("tenantJson", () => {
  it("returns a 200 JSON response for an authenticated request", async () => {
    const token = await signToken({ sub: "u-admin", email: "a", role: "admin", org: "davwo" });
    const res = await tenantJson(bearer(token), () => ({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("returns 401 for an unauthenticated request instead of throwing", async () => {
    const res = await tenantJson(new Request("http://test"), () => ({ ok: true }));
    expect(res.status).toBe(401);
    expect((await res.json()).detail).toBe("Unauthorized");
  });
  it("rethrows a non-auth error instead of masking it as a 401", async () => {
    const token = await signToken({ sub: "u-admin", email: "a", role: "admin", org: "davwo" });
    await expect(
      tenantJson(bearer(token), () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("rateLimit", () => {
  it("allows requests under the limit and blocks once it's hit", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
  });
  it("resets the window once it elapses", async () => {
    const key = `test-window-${Math.random()}`;
    expect(rateLimit(key, 1, 10)).toBe(true);
    expect(rateLimit(key, 1, 10)).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(rateLimit(key, 1, 10)).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers x-forwarded-for, then x-real-ip, then unknown", () => {
    expect(
      clientKey(new Request("http://test", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })),
    ).toBe("1.2.3.4");
    expect(clientKey(new Request("http://test", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe(
      "9.9.9.9",
    );
    expect(clientKey(new Request("http://test"))).toBe("unknown");
  });
});

describe("simulator", () => {
  it("produces all shapes", () => {
    expect(sim.headlineKpis().active_chargers).toBeGreaterThan(0);
    expect(sim.energySeries("day").length).toBe(25);
    expect(sim.energySeries("week").length).toBe(7);
    expect(sim.energySeries("month").length).toBe(4);
    expect(sim.energySeries().length).toBe(25);
    expect(sim.assetTypeBreakdown().length).toBeGreaterThan(0);
    expect(sim.costBreakdown().length).toBeGreaterThan(0);
    expect(sim.recommendation().confidence_pct).toBeGreaterThan(0);
    expect(sim.mapPins().length).toBeGreaterThan(0);
    const alerts = sim.alerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].created_at).toMatch(/T/);
  });
});
