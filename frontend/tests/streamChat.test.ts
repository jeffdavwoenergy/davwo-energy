import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ getToken: () => "test-token" }));

import { streamChat } from "@/lib/ani/streamChat";

/** Builds a fake fetch Response whose body is a ReadableStream emitting the
 * given /api/ani/chat SSE events, chunked mid-event on purpose to exercise
 * the buffering logic in streamChat. */
function fakeSseResponse(events: { event: string; data: unknown }[]): Response {
  const encoder = new TextEncoder();
  const full = events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
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
  vi.restoreAllMocks();
});

describe("streamChat", () => {
  it("posts to /api/ani/chat with the bearer token, message and context", async () => {
    global.fetch = vi.fn(async (url, init) => {
      expect(url).toBe("/api/ani/chat");
      const req = init as RequestInit;
      expect((req.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      expect(JSON.parse(req.body as string)).toEqual({ message: "hello", context: "/dashboard" });
      return fakeSseResponse([{ event: "done", data: { blocks: [], mode: "deterministic" } }]);
    }) as typeof fetch;

    const onDone = vi.fn();
    await streamChat("hello", "/dashboard", () => {}, onDone, () => {});
    expect(onDone).toHaveBeenCalledWith({ blocks: [], mode: "deterministic" });
  });

  it("streams intro_delta chunks via onDelta, buffering across chunk boundaries", async () => {
    global.fetch = vi.fn(async () =>
      fakeSseResponse([
        { event: "intro_delta", data: { chunk: "Here " } },
        { event: "intro_delta", data: { chunk: "is the answer." } },
        { event: "done", data: { blocks: [{ type: "text", text: "Here is the answer." }], mode: "live-llm" } },
      ]),
    ) as typeof fetch;

    const chunks: string[] = [];
    const onDone = vi.fn();
    await streamChat("q", "/dashboard", (c) => chunks.push(c), onDone, () => {});
    expect(chunks.join("")).toBe("Here is the answer.");
    expect(onDone).toHaveBeenCalledWith({ blocks: [{ type: "text", text: "Here is the answer." }], mode: "live-llm" });
  });

  it("calls onError when the response isn't ok or has no body", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, body: null }) as unknown as Response) as typeof fetch;
    const onError = vi.fn();
    await streamChat("q", "/dashboard", () => {}, () => {}, onError);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/couldn't reach/i));

    global.fetch = vi.fn(async () => ({ ok: true, body: null }) as unknown as Response) as typeof fetch;
    const onError2 = vi.fn();
    await streamChat("q", "/dashboard", () => {}, () => {}, onError2);
    expect(onError2).toHaveBeenCalledWith(expect.stringMatching(/couldn't reach/i));
  });

  it("surfaces a server-sent error event via onError", async () => {
    global.fetch = vi.fn(async () => fakeSseResponse([{ event: "error", data: { detail: "Unauthorized" } }])) as typeof fetch;
    const onError = vi.fn();
    await streamChat("q", "/dashboard", () => {}, () => {}, onError);
    expect(onError).toHaveBeenCalledWith("Unauthorized");
  });

  it("skips a malformed SSE chunk instead of aborting the stream", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`event: intro_delta\ndata: {not valid json\n\n`));
        controller.enqueue(encoder.encode(`event: intro_delta\ndata: ${JSON.stringify({ chunk: "Recovered." })}\n\n`));
        controller.close();
      },
    });
    global.fetch = vi.fn(async () => ({ ok: true, body: stream }) as unknown as Response) as typeof fetch;

    const chunks: string[] = [];
    await streamChat("q", "/dashboard", (c) => chunks.push(c), () => {}, () => {});
    expect(chunks.join("")).toBe("Recovered.");
  });

  it("ignores a line with an event but no data, or data but no event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`event: intro_delta\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: "ignored" })}\n\n`));
        controller.enqueue(encoder.encode(`event: intro_delta\ndata: ${JSON.stringify({ chunk: "ok" })}\n\n`));
        controller.close();
      },
    });
    global.fetch = vi.fn(async () => ({ ok: true, body: stream }) as unknown as Response) as typeof fetch;

    const chunks: string[] = [];
    await streamChat("q", "/dashboard", (c) => chunks.push(c), () => {}, () => {});
    expect(chunks.join("")).toBe("ok");
  });
});
