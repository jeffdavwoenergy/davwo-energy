import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import { saveChatMessage, listChatHistory, clearChatHistory } from "@/lib/server/chatHistory";

describe("chatHistory (in-memory fallback — no DATABASE_URL configured)", () => {
  it("confirms no DB is configured for this test file", () => {
    expect(isDbConfigured()).toBe(false);
  });

  it("saves and lists messages oldest-first, isolated per org+user", async () => {
    const org = `org-chat-${Math.random()}`;
    const user = `user-chat-${Math.random()}`;
    await saveChatMessage(org, user, "user", { text: "How is the network doing?" });
    await saveChatMessage(org, user, "assistant", { blocks: [{ type: "text", text: "All healthy." }], mode: "deterministic" });

    const history = await listChatHistory(org, user);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: { text: "How is the network doing?" } });
    expect(history[1]).toMatchObject({ role: "assistant", content: { mode: "deterministic" } });
    expect(history[0].id).toBeTruthy();
    expect(history[0].createdAt).toBeTruthy();

    // A different user in the same org sees nothing.
    expect(await listChatHistory(org, `other-${Math.random()}`)).toEqual([]);
  });

  it("caps listChatHistory at the requested limit, keeping the most recent", async () => {
    const org = `org-chat-limit-${Math.random()}`;
    const user = `user-chat-limit-${Math.random()}`;
    for (let i = 0; i < 5; i++) await saveChatMessage(org, user, "user", { text: `message ${i}` });

    const capped = await listChatHistory(org, user, 3);
    expect(capped).toHaveLength(3);
    expect(capped.map((m) => m.content.text)).toEqual(["message 2", "message 3", "message 4"]);
  });

  it("clearChatHistory empties the thread without affecting other users", async () => {
    const org = `org-chat-clear-${Math.random()}`;
    const user = `user-chat-clear-${Math.random()}`;
    const other = `other-chat-clear-${Math.random()}`;
    await saveChatMessage(org, user, "user", { text: "hi" });
    await saveChatMessage(org, other, "user", { text: "hi too" });

    await clearChatHistory(org, user);
    expect(await listChatHistory(org, user)).toEqual([]);
    expect(await listChatHistory(org, other)).toHaveLength(1);
  });
});
