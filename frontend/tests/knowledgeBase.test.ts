import { describe, it, expect } from "vitest";
import { isDbConfigured } from "@/lib/server/prisma";
import { addKnowledgeBaseEntry, listKnowledgeBaseEntries, removeKnowledgeBaseEntry } from "@/lib/server/knowledgeBase";

describe("knowledgeBase (in-memory fallback — no DATABASE_URL configured)", () => {
  it("confirms no DB is configured for this test file", () => {
    expect(isDbConfigured()).toBe(false);
  });

  it("adds an entry and lists it back, scoped per product", async () => {
    const productId = `prod-${Math.random()}`;
    expect(await listKnowledgeBaseEntries(productId)).toEqual([]);

    const entry = await addKnowledgeBaseEntry(productId, {
      issue: "Charger won't start", symptoms: "No LED, no response to card tap", resolution: "Check the upstream breaker hasn't tripped.",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.productId).toBe(productId);

    const list = await listKnowledgeBaseEntries(productId);
    expect(list).toHaveLength(1);
    expect(list[0].issue).toBe("Charger won't start");

    expect(await listKnowledgeBaseEntries(`prod-other-${Math.random()}`)).toEqual([]);
  });

  it("lists multiple entries oldest-first", async () => {
    const productId = `prod-${Math.random()}`;
    const first = await addKnowledgeBaseEntry(productId, { issue: "Issue A", resolution: "Fix A" });
    await new Promise((r) => setTimeout(r, 2));
    const second = await addKnowledgeBaseEntry(productId, { issue: "Issue B", resolution: "Fix B" });

    const list = await listKnowledgeBaseEntries(productId);
    expect(list.map((e) => e.id)).toEqual([first.id, second.id]);
  });

  it("removeKnowledgeBaseEntry deletes the entry and is safe against an unknown id", async () => {
    const productId = `prod-${Math.random()}`;
    const entry = await addKnowledgeBaseEntry(productId, { issue: "Issue", resolution: "Fix" });

    expect(await removeKnowledgeBaseEntry(productId, entry.id)).toBe(true);
    expect(await listKnowledgeBaseEntries(productId)).toEqual([]);
    expect(await removeKnowledgeBaseEntry(productId, entry.id)).toBe(false);
    expect(await removeKnowledgeBaseEntry(productId, "entry-unknown")).toBe(false);
  });
});
