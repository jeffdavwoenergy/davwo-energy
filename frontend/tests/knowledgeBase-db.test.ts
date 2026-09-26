import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    knowledgeBaseEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { symptoms: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.push(row);
        return row;
      },
      findMany: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { createdAt: string } }) => {
        let rows = store.filter((d) => Object.entries(where).every(([k, v]) => d[k] === v));
        rows = [...rows].sort((a, b) =>
          orderBy?.createdAt === "desc"
            ? (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()
            : (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
        );
        return rows;
      },
      findUnique: async ({ where }: { where: { id: string } }) => store.find((d) => d.id === where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = store.findIndex((d) => d.id === where.id);
        if (idx < 0) throw new Error("Record to delete does not exist.");
        const [removed] = store.splice(idx, 1);
        return removed;
      },
    },
  }),
}));

describe("knowledgeBase (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("persists an entry via Prisma and lists it back scoped to the product", async () => {
    const { addKnowledgeBaseEntry, listKnowledgeBaseEntries } = await import("@/lib/server/knowledgeBase");
    const entry = await addKnowledgeBaseEntry("prod-1", { issue: "Won't start", symptoms: "No LED", resolution: "Check the breaker." });
    expect(store).toHaveLength(1);

    const list = await listKnowledgeBaseEntries("prod-1");
    expect(list).toHaveLength(1);
    expect(list[0].issue).toBe("Won't start");
    expect(list[0].symptoms).toBe("No LED");
    expect(entry.id).toBe(list[0].id);

    expect(await listKnowledgeBaseEntries("prod-other")).toEqual([]);
  });

  it("removeKnowledgeBaseEntry deletes via Prisma, org/product-scoped, and rejects a mismatched product id", async () => {
    const { addKnowledgeBaseEntry, removeKnowledgeBaseEntry, listKnowledgeBaseEntries } = await import("@/lib/server/knowledgeBase");
    const entry = await addKnowledgeBaseEntry("prod-1", { issue: "Issue", resolution: "Fix" });

    expect(await removeKnowledgeBaseEntry("prod-other", entry.id)).toBe(false); // wrong product
    expect(await removeKnowledgeBaseEntry("prod-1", entry.id)).toBe(true);
    expect(await listKnowledgeBaseEntries("prod-1")).toEqual([]);
    expect(await removeKnowledgeBaseEntry("prod-1", "entry-unknown")).toBe(false);
  });
});
