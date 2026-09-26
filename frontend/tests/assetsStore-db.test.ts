import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    userAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // Prisma fills in schema defaults (createdAt: now(), nullable columns
        // not passed at create time) before returning the row — replicate that.
        const now = new Date();
        const row = {
          locationLat: null, locationLng: null,
          manufacturer: null, model: null, serialNumber: null, installedAt: null, productId: null,
          createdAt: now, updatedAt: now, ...data,
        };
        store.push(row);
        return row;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        store.filter((d) => Object.entries(where).every(([k, v]) => d[k] === v)),
      findUnique: async ({ where }: { where: { id: string } }) => store.find((d) => d.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const doc = store.find((d) => d.id === where.id);
        if (!doc) throw new Error("Record to update not found.");
        Object.assign(doc, data, { updatedAt: new Date() });
        return doc;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = store.findIndex((d) => d.id === where.id);
        if (idx < 0) throw new Error("Record to delete does not exist.");
        const [removed] = store.splice(idx, 1);
        return removed;
      },
    },
  }),
}));

describe("assetsStore (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("persists a new asset and lists it back scoped to the org, without leaking orgId", async () => {
    const { listUserAssets, addUserAsset } = await import("@/lib/server/assetsStore");

    const asset = await addUserAsset("org-x", { name: "Solar Array", type: "Solar", site: "Bristol", capacity_kw: 200 });
    expect(asset.name).toBe("Solar Array");
    expect(store).toHaveLength(1);

    const listX = await listUserAssets("org-x");
    expect(listX).toHaveLength(1);
    expect(listX[0]).not.toHaveProperty("orgId");

    expect(await listUserAssets("org-y")).toEqual([]);
  });

  it("getUserAsset/updateUserAsset/removeUserAsset round-trip via Prisma, org-scoped", async () => {
    const { addUserAsset, getUserAsset, updateUserAsset, removeUserAsset } = await import("@/lib/server/assetsStore");

    const asset = await addUserAsset("org-x", {
      name: "Rapid 50", type: "EV Charger", site: "Depot", capacity_kw: 50,
      manufacturer: "Voltway", product_id: "prod-1",
    });

    expect((await getUserAsset("org-x", asset.id))?.manufacturer).toBe("Voltway");
    expect(await getUserAsset("org-y", asset.id)).toBeUndefined(); // wrong org
    expect(await getUserAsset("org-x", "ua-unknown")).toBeUndefined();

    const updated = await updateUserAsset("org-x", asset.id, { status: "degraded", model: "Rapid 50 Mk2" });
    expect(updated?.status).toBe("degraded");
    expect(updated?.model).toBe("Rapid 50 Mk2");

    const updatedAgain = await updateUserAsset("org-x", asset.id, { serial_number: "SN-1", installed_at: "2026-03-01", product_id: "prod-2" });
    expect(updatedAgain?.serial_number).toBe("SN-1");
    expect(updatedAgain?.installed_at).toBe(new Date("2026-03-01").toISOString());
    expect(updatedAgain?.product_id).toBe("prod-2");

    // Regression: clearing installed_at via "" must null it out, not crash on `new Date("")`.
    const cleared = await updateUserAsset("org-x", asset.id, { installed_at: "" });
    expect(cleared?.installed_at).toBeUndefined();

    expect(await updateUserAsset("org-y", asset.id, { status: "down" })).toBeUndefined(); // wrong org
    expect(await updateUserAsset("org-x", "ua-unknown", { status: "down" })).toBeUndefined();

    expect(await removeUserAsset("org-y", asset.id)).toBe(false); // wrong org
    expect(await removeUserAsset("org-x", asset.id)).toBe(true);
    expect(await getUserAsset("org-x", asset.id)).toBeUndefined();
    expect(await removeUserAsset("org-x", "ua-unknown")).toBe(false);
  });
});
