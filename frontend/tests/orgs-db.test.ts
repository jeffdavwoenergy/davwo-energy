import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    org: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.push(data);
        return data;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const doc = store.find((d) => d.id === where.id);
        // Prisma always hydrates DateTime columns back to Date objects, even
        // though create() accepted an ISO string — replicate that round-trip.
        return doc ? { ...doc, createdAt: new Date(doc.createdAt as string) } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const doc = store.find((d) => d.id === where.id);
        if (!doc) throw new Error("Record to update not found.");
        // Simulates a transient DB failure unrelated to the row existing —
        // updateOrg must let this propagate, not swallow it into "not found".
        if (data.name === "__trigger_db_error__") throw new Error("connection reset");
        Object.assign(doc, data);
        return { ...doc, createdAt: new Date(doc.createdAt as string) };
      },
    },
  }),
}));

describe("orgs (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("persists a new org and finds it back, without hitting the in-memory map", async () => {
    const { createOrg, findOrg } = await import("@/lib/server/orgs");
    const org = await createOrg("Aire Valley Charge Co", "Leeds");
    expect(store).toHaveLength(1);
    expect((await findOrg(org.id))?.name).toBe("Aire Valley Charge Co");
    expect(await findOrg("org-unknown")).toBeUndefined();
  });

  it("updateOrg persists the patch via Prisma and returns undefined for an unknown id", async () => {
    const { createOrg, updateOrg } = await import("@/lib/server/orgs");
    const org = await createOrg("Old Name", "Leeds");
    const updated = await updateOrg(org.id, { name: "New Name" });
    expect(updated?.name).toBe("New Name");
    expect(await updateOrg("org-unknown", { name: "X" })).toBeUndefined();
  });

  it("updateOrg lets a real DB error propagate instead of reporting it as 'not found' (regression: previously .catch(() => null) swallowed every error)", async () => {
    const { createOrg, updateOrg } = await import("@/lib/server/orgs");
    const org = await createOrg("Real Org", "Leeds");
    await expect(updateOrg(org.id, { name: "__trigger_db_error__" })).rejects.toThrow("connection reset");
  });
});
