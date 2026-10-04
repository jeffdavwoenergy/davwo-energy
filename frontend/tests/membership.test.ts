import { describe, it, expect } from "vitest";
import { getMembership } from "@/lib/server/membership";
import {
  registerSupplier, authenticateSupplier, changeSupplierPassword, DEMO_SUPPLIER, DemoSupplierPasswordError,
} from "@/lib/server/suppliers";

describe("membership (in-memory fallback)", () => {
  it("gives admin@davwo.com Full membership via the built-in admin supplier account", async () => {
    expect(await getMembership("Admin@Davwo.com")).toEqual({ email: "admin@davwo.com", tier: "full", ani: true, supplier: true });
  });

  it("the built-in admin supplier signs in with the demo password and is verified", async () => {
    const s = await authenticateSupplier("admin@davwo.com", process.env.DEMO_PASSWORD || "Demo@123");
    expect(s).toMatchObject({ id: DEMO_SUPPLIER.id, companyName: "Davwo Energy Ltd", verified: true });
    await expect(changeSupplierPassword(DEMO_SUPPLIER.id, "Demo@123", "something-new")).rejects.toThrow(DemoSupplierPasswordError);
  });

  it("is ANI-only for an ANI user without a supplier account", async () => {
    expect(await getMembership("operator@davwo.com")).toMatchObject({ tier: "ani", ani: true, supplier: false });
  });

  it("is Supplier-only for a supplier without an ANI account", async () => {
    const email = `only-supplier-${Math.random()}@co.example`;
    await registerSupplier({ email, password: "password123", companyName: "Co", category: "solar" });
    expect(await getMembership(email)).toMatchObject({ tier: "supplier", ani: false, supplier: true });
  });
});

describe("Acme Corp demo admin", () => {
  it("has Full membership: an ANI™ admin account at Acme Corp and a verified supplier account", async () => {
    expect(await getMembership("admin@acmecorp.com")).toMatchObject({ tier: "full", ani: true, supplier: true });
    const s = await authenticateSupplier("admin@acmecorp.com", process.env.DEMO_PASSWORD || "Demo@123");
    expect(s).toMatchObject({ id: "s-acme", companyName: "Acme Corp", verified: true });
  });

  it("demo-logins by account id on both platforms, and refuses non-demo accounts", async () => {
    process.env.ALLOW_DEMO_LOGIN = "true";
    try {
      const { POST: aniDemo } = await import("@/app/api/auth/demo-login/route");
      const { POST: supplierDemo } = await import("@/app/api/supplier/auth/demo-login/route");

      const ani = await aniDemo(new Request("http://x/api/auth/demo-login?account=u-acme-admin", { method: "POST" }));
      expect(ani.status).toBe(200);
      expect((await ani.json()).user).toMatchObject({ email: "admin@acmecorp.com", role: "admin", orgId: "acme", orgName: "Acme Corp" });

      const sup = await supplierDemo(new Request("http://x/api/supplier/auth/demo-login?account=s-acme", { method: "POST" }));
      expect(sup.status).toBe(200);
      expect((await sup.json()).supplier.email).toBe("admin@acmecorp.com");

      expect((await aniDemo(new Request("http://x/api/auth/demo-login?account=u-someone-real", { method: "POST" }))).status).toBe(400);
      expect((await supplierDemo(new Request("http://x/api/supplier/auth/demo-login?account=not-demo", { method: "POST" }))).status).toBe(400);
    } finally {
      delete process.env.ALLOW_DEMO_LOGIN;
    }
  });
});
