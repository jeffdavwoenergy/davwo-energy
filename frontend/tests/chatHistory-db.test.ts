import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown>[] = [];

vi.mock("@/lib/server/prisma", () => ({
  isDbConfigured: () => true,
  getPrisma: () => ({
    chatMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `cm-${store.length}`, createdAt: new Date(), ...data };
        store.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take }: { where: { orgId: string; userId: string }; orderBy: { createdAt: string }; take: number }) => {
        let rows = store.filter((r) => r.orgId === where.orgId && r.userId === where.userId);
        rows = orderBy.createdAt === "desc" ? [...rows].reverse() : rows;
        return rows.slice(0, take);
      },
      deleteMany: async ({ where }: { where: { orgId: string; userId: string } }) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (store[i].orgId === where.orgId && store[i].userId === where.userId) store.splice(i, 1);
        }
        return { count: before - store.length };
      },
    },
  }),
}));

describe("chatHistory (Postgres-backed)", () => {
  beforeEach(() => {
    store.length = 0;
    vi.resetModules();
  });

  it("persists messages via Prisma and lists them back oldest-first", async () => {
    const { saveChatMessage, listChatHistory } = await import("@/lib/server/chatHistory");
    await saveChatMessage("org-x", "user-1", "user", { text: "hello" });
    await saveChatMessage("org-x", "user-1", "assistant", { blocks: [{ type: "text", text: "hi" }], mode: "live-llm" });

    expect(store).toHaveLength(2);
    const history = await listChatHistory("org-x", "user-1");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history[1].content).toEqual({ blocks: [{ type: "text", text: "hi" }], mode: "live-llm" });
  });

  it("clearChatHistory deletes only this org+user's rows via Prisma", async () => {
    const { saveChatMessage, listChatHistory, clearChatHistory } = await import("@/lib/server/chatHistory");
    await saveChatMessage("org-x", "user-1", "user", { text: "a" });
    await saveChatMessage("org-y", "user-1", "user", { text: "b" });

    await clearChatHistory("org-x", "user-1");
    expect(await listChatHistory("org-x", "user-1")).toEqual([]);
    expect(await listChatHistory("org-y", "user-1")).toHaveLength(1);
  });
});
