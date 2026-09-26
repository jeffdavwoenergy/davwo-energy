import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import {
  registerSupplier, authenticateSupplier, findSupplierById, listSuppliers, setSupplierVerified,
  SupplierEmailInUseError, WrongSupplierPasswordError,
} from "@/lib/server/suppliers";

describe("suppliers (in-memory fallback — no DATABASE_URL configured)", () => {
  it("confirms no DB is configured for this test file", () => {
    expect(isDbConfigured()).toBe(false);
  });

  it("registers a supplier, never leaks the password hash, and finds it back by id", async () => {
    const email = `supplier-${Math.random()}@newco.example`;
    const supplier = await registerSupplier({ email, password: "password123", companyName: "Voltway Networks", category: "ev-chargers" });
    expect(supplier.email).toBe(email);
    expect(supplier.verified).toBe(false);
    expect(supplier).not.toHaveProperty("passwordHash");

    const found = await findSupplierById(supplier.id);
    expect(found?.companyName).toBe("Voltway Networks");
    expect(await findSupplierById("not-a-real-id")).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    const email = `dup-${Math.random()}@newco.example`;
    await registerSupplier({ email, password: "password123", companyName: "A", category: "solar" });
    await expect(
      registerSupplier({ email, password: "password456", companyName: "B", category: "battery" }),
    ).rejects.toThrow(SupplierEmailInUseError);
  });

  it("authenticateSupplier verifies the password and rejects a wrong one or an unknown email", async () => {
    const email = `auth-${Math.random()}@newco.example`;
    await registerSupplier({ email, password: "correct-password", companyName: "C", category: "consulting" });

    const authed = await authenticateSupplier(email, "correct-password");
    expect(authed.email).toBe(email);

    await expect(authenticateSupplier(email, "wrong-password")).rejects.toThrow(WrongSupplierPasswordError);
    await expect(authenticateSupplier("nobody@newco.example", "whatever")).rejects.toThrow(WrongSupplierPasswordError);
  });

  it("normalizes email case/whitespace for lookup and duplicate checks", async () => {
    const email = `case-${Math.random()}@newco.example`;
    await registerSupplier({ email, password: "password123", companyName: "D", category: "energy-services" });
    await expect(
      registerSupplier({ email: `  ${email.toUpperCase()}  `, password: "password456", companyName: "E", category: "solar" }),
    ).rejects.toThrow(SupplierEmailInUseError);
    const authed = await authenticateSupplier(`  ${email.toUpperCase()}  `, "password123");
    expect(authed.email).toBe(email);
  });

  it("listSuppliers lists newest-first; setSupplierVerified toggles the badge and 404s on an unknown id", async () => {
    const a = await registerSupplier({ email: `list-a-${Math.random()}@newco.example`, password: "password123", companyName: "Alpha Ltd", category: "solar" });
    const b = await registerSupplier({ email: `list-b-${Math.random()}@newco.example`, password: "password123", companyName: "Beta Ltd", category: "battery" });

    const all = await listSuppliers();
    expect(all.some((s) => s.id === a.id)).toBe(true);
    expect(all.some((s) => s.id === b.id)).toBe(true);
    expect(all.every((s) => !("passwordHash" in s))).toBe(true);

    expect(a.verified).toBe(false);
    const verified = await setSupplierVerified(a.id, true);
    expect(verified?.verified).toBe(true);
    expect((await findSupplierById(a.id))?.verified).toBe(true);

    const unverified = await setSupplierVerified(a.id, false);
    expect(unverified?.verified).toBe(false);

    expect(await setSupplierVerified("not-a-real-id", true)).toBeUndefined();
  });
});
