import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    supplier: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { region: null, website: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const [key, value] = Object.entries(where)[0];
        return store.find((d) => d[key] === value) ?? null;
      },
      findMany: async () => [...store].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const doc = store.find((d) => d.id === where.id);
        if (!doc) throw new Error("Record to update not found.");
        Object.assign(doc, data);
        return doc;
      },
    },
  }),
}));

describe("suppliers (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("persists a supplier via Prisma and finds it back by id/email", async () => {
    const { registerSupplier, findSupplierById, authenticateSupplier } = await import("@/lib/server/suppliers");
    const supplier = await registerSupplier({
      email: "voltway@newco.example", password: "password123", companyName: "Voltway Networks",
      category: "ev-chargers", region: "Manchester, UK", website: "https://voltway.example",
    });
    expect(store).toHaveLength(1);
    expect((await findSupplierById(supplier.id))?.companyName).toBe("Voltway Networks");

    const authed = await authenticateSupplier("voltway@newco.example", "password123");
    expect(authed.id).toBe(supplier.id);
  });

  it("rejects a duplicate email and a wrong password, via Prisma", async () => {
    const { registerSupplier, authenticateSupplier, SupplierEmailInUseError, WrongSupplierPasswordError } = await import(
      "@/lib/server/suppliers"
    );
    await registerSupplier({ email: "dup@newco.example", password: "password123", companyName: "A", category: "solar" });
    await expect(
      registerSupplier({ email: "dup@newco.example", password: "password456", companyName: "B", category: "battery" }),
    ).rejects.toThrow(SupplierEmailInUseError);
    await expect(authenticateSupplier("dup@newco.example", "totally-wrong")).rejects.toThrow(WrongSupplierPasswordError);
  });

  it("listSuppliers and setSupplierVerified work via Prisma, 404-ing on an unknown id", async () => {
    const { registerSupplier, listSuppliers, setSupplierVerified, findSupplierById } = await import("@/lib/server/suppliers");
    const supplier = await registerSupplier({ email: "verify-me@newco.example", password: "password123", companyName: "Gridstore", category: "battery" });

    const all = await listSuppliers();
    expect(all.some((s) => s.id === supplier.id)).toBe(true);
    expect(all.every((s) => !("passwordHash" in s))).toBe(true);

    const verified = await setSupplierVerified(supplier.id, true);
    expect(verified?.verified).toBe(true);
    expect((await findSupplierById(supplier.id))?.verified).toBe(true);
    expect(await setSupplierVerified("not-a-real-id", true)).toBeUndefined();
  });
});
