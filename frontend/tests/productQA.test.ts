import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/products", () => ({
  getProduct: vi.fn(),
  getProductDocumentTexts: vi.fn(),
}));
vi.mock("@/lib/server/knowledgeBase", () => ({
  listKnowledgeBaseEntries: vi.fn(),
}));
vi.mock("@/lib/server/marketplace", () => ({
  resolveVendor: vi.fn(async () => ({ id: "v1", name: "Voltway Networks", contact_email: "hello@voltway.example", website: "https://voltway.example" })),
}));

const llmConfigured = { value: false };
const callLLMMock = vi.fn();
vi.mock("@/lib/server/llm", () => ({
  isLLMConfigured: () => llmConfigured.value,
  callLLM: (...args: unknown[]) => callLLMMock(...args),
}));

import * as products from "@/lib/server/products";
import * as kb from "@/lib/server/knowledgeBase";
import { askAboutProducts } from "@/lib/server/productQA";

const p = products as unknown as { getProduct: ReturnType<typeof vi.fn>; getProductDocumentTexts: ReturnType<typeof vi.fn> };
const k = kb as unknown as { listKnowledgeBaseEntries: ReturnType<typeof vi.fn> };

const PRODUCT = {
  id: "prod-1",
  vendorId: "v1",
  name: "Rapid 50",
  category: "ev-chargers",
  summary: "50kW DC rapid charger",
  description: "A rugged 50kW DC rapid charger for depot use.",
  specs: { "Max output": "50 kW" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  llmConfigured.value = false;
  p.getProduct.mockResolvedValue(PRODUCT);
  p.getProductDocumentTexts.mockResolvedValue([]);
  k.listKnowledgeBaseEntries.mockResolvedValue([]);
});

describe("askAboutProducts", () => {
  it("returns a not-found answer when no product ids resolve", async () => {
    p.getProduct.mockResolvedValue(undefined);
    const result = await askAboutProducts(["missing"], "What's the price?");
    expect(result.answer).toMatch(/couldn't find/i);
    expect(result.groundedIn).toEqual([]);
  });

  it("without OPENAI_API_KEY, returns an honest not-configured answer but still reports what it's grounded in", async () => {
    const result = await askAboutProducts(["prod-1"], "What's the max output?");
    expect(result.configured).toBe(false);
    expect(result.answer).toMatch(/isn't configured/i);
    expect(callLLMMock).not.toHaveBeenCalled();
    expect(result.groundedIn).toEqual([{ productId: "prod-1", productName: "Rapid 50", documentCount: 0, knowledgeBaseCount: 0 }]);
  });

  it("with a key configured, calls the LLM with the product context (docs + known issues + vendor contact) and returns its answer", async () => {
    llmConfigured.value = true;
    p.getProductDocumentTexts.mockResolvedValue([{ filename: "manual.pdf", text: "Max output current: 125A." }]);
    k.listKnowledgeBaseEntries.mockResolvedValue([
      { id: "kb-1", productId: "prod-1", issue: "Charger won't start", symptoms: "No LED", resolution: "Check the breaker.", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    callLLMMock.mockImplementation(async (_system: string, user: string) => {
      expect(user).toContain("Rapid 50");
      expect(user).toContain("Max output current: 125A.");
      expect(user).toContain("Charger won't start");
      expect(user).toContain("Check the breaker.");
      expect(user).toContain("hello@voltway.example");
      expect(user).toContain("What's the max output?");
      return "The maximum output is 50kW at up to 125A.";
    });

    const result = await askAboutProducts(["prod-1"], "What's the max output?");
    expect(result.configured).toBe(true);
    expect(result.answer).toBe("The maximum output is 50kW at up to 125A.");
    expect(result.groundedIn[0].documentCount).toBe(1);
    expect(result.groundedIn[0].knowledgeBaseCount).toBe(1);
    expect(callLLMMock.mock.calls[0][2]).toBe(700);
  });

  it("caps at 5 products and de-duplicates repeated ids", async () => {
    llmConfigured.value = true;
    callLLMMock.mockResolvedValue("ok");
    const ids = Array.from({ length: 8 }, (_, i) => `prod-${i}`);
    await askAboutProducts([...ids, "prod-0"], "Compare these");
    expect(p.getProduct).toHaveBeenCalledTimes(5);
  });

  it("falls back to a generic message when the LLM call fails or returns nothing", async () => {
    llmConfigured.value = true;
    callLLMMock.mockResolvedValue(null);
    const result = await askAboutProducts(["prod-1"], "q");
    expect(result.answer).toMatch(/couldn't generate/i);
  });
});
