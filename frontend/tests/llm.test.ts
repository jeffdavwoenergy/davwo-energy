import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isLLMConfigured, callLLM, callLLMStream } from "@/lib/server/llm";

/** Builds a fake fetch Response whose body is a ReadableStream emitting the
 * given OpenAI chat.completion.chunk SSE events, chunked mid-event on
 * purpose to exercise the buffering logic in callLLMStream. */
function fakeSseResponse(deltas: string[]): Response {
  const encoder = new TextEncoder();
  const parts = deltas.map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  parts.push("data: [DONE]\n\n");
  const full = parts.join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const mid = Math.floor(full.length / 2);
      controller.enqueue(encoder.encode(full.slice(0, mid)));
      controller.enqueue(encoder.encode(full.slice(mid)));
      controller.close();
    },
  });
  return { ok: true, body: stream } as unknown as Response;
}

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => vi.unstubAllEnvs());

describe("isLLMConfigured", () => {
  it("reflects OPENAI_API_KEY presence", () => {
    expect(isLLMConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-test";
    expect(isLLMConfigured()).toBe(true);
  });
});

describe("callLLM", () => {
  it("returns null without a key, never calling fetch", async () => {
    global.fetch = vi.fn() as typeof fetch;
    expect(await callLLM("system", "user", 200)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts the OpenAI chat.completions shape and returns the message content", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    global.fetch = vi.fn(async (url, init) => {
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const req = init as RequestInit;
      expect((req.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      const body = JSON.parse(req.body as string);
      expect(body.model).toBeTruthy();
      expect(body.max_completion_tokens).toBe(220);
      expect(body.messages).toEqual([
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ]);
      return { ok: true, json: async () => ({ choices: [{ message: { content: "Hello there." } }] }) } as Response;
    }) as typeof fetch;

    expect(await callLLM("sys", "usr", 220)).toBe("Hello there.");
  });

  it("respects OPENAI_MODEL when set", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-custom";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe("gpt-custom");
      return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) } as Response;
    }) as typeof fetch;
    await callLLM("sys", "usr", 100);
    delete process.env.OPENAI_MODEL;
  });

  it("returns null on a non-ok response, empty content, or a thrown error", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response) as typeof fetch;
    expect(await callLLM("sys", "usr", 100)).toBeNull();

    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "" } }] }) }) as Response) as typeof fetch;
    expect(await callLLM("sys", "usr", 100)).toBeNull();

    global.fetch = vi.fn(async () => { throw new Error("net"); }) as typeof fetch;
    expect(await callLLM("sys", "usr", 100)).toBeNull();
  });
});

describe("callLLMStream", () => {
  it("returns null without a key, never calling fetch", async () => {
    global.fetch = vi.fn() as typeof fetch;
    expect(await callLLMStream("system", "user", 200, () => {})).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("streams deltas via onDelta and returns the accumulated text, buffering across chunk boundaries", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    global.fetch = vi.fn(async () => fakeSseResponse(["Here ", "is the ", "live picture."])) as typeof fetch;

    const chunks: string[] = [];
    const result = await callLLMStream("sys", "usr", 220, (c) => chunks.push(c));
    expect(chunks.join("")).toBe("Here is the live picture.");
    expect(result).toBe("Here is the live picture.");
  });

  it("sets stream: true on the request body", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.stream).toBe(true);
      return fakeSseResponse(["ok"]);
    }) as typeof fetch;
    await callLLMStream("sys", "usr", 100, () => {});
  });

  it("returns null when the response isn't ok or has no body", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    global.fetch = vi.fn(async () => ({ ok: false, body: null }) as unknown as Response) as typeof fetch;
    expect(await callLLMStream("sys", "usr", 100, () => {})).toBeNull();

    global.fetch = vi.fn(async () => ({ ok: true, body: null }) as unknown as Response) as typeof fetch;
    expect(await callLLMStream("sys", "usr", 100, () => {})).toBeNull();
  });

  it("returns null when fetch throws before any text streamed", async () => {
    global.fetch = vi.fn(async () => { throw new Error("net"); }) as typeof fetch;
    process.env.OPENAI_API_KEY = "sk-test";
    expect(await callLLMStream("sys", "usr", 100, () => {})).toBeNull();
  });

  it("skips a malformed SSE chunk instead of aborting the stream", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {not valid json\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Recovered." } }] })}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });
    global.fetch = vi.fn(async () => ({ ok: true, body: stream }) as unknown as Response) as typeof fetch;

    const chunks: string[] = [];
    const result = await callLLMStream("sys", "usr", 100, (c) => chunks.push(c));
    expect(chunks.join("")).toBe("Recovered.");
    expect(result).toBe("Recovered.");
  });

  it("preserves partial text already streamed when the connection drops mid-response, instead of returning null", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls === 1) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Partial narration before the drop." } }] })}\n\n`));
          return;
        }
        throw new Error("connection reset");
      },
    });
    global.fetch = vi.fn(async () => ({ ok: true, body: stream }) as unknown as Response) as typeof fetch;

    const chunks: string[] = [];
    const result = await callLLMStream("sys", "usr", 100, (c) => chunks.push(c));
    expect(chunks).toEqual(["Partial narration before the drop."]);
    expect(result).toBe("Partial narration before the drop.");
  });
});
