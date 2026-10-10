import { NextResponse } from "next/server";
import { streamAnswer, type ChatDevice } from "@/lib/ani/assistant";
import { getAuth } from "@/lib/server/auth";
import { withTenant, currentOrg, tenantJson, UnauthorizedError } from "@/lib/server/context";
import { rateLimit, clientKey } from "@/lib/server/rateLimit";
import { saveChatMessage, listChatHistory, clearChatHistory } from "@/lib/server/chatHistory";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Persisted history for the current user's continuous ANI thread. */
export async function GET(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  return tenantJson(req, async () => ({ items: await listChatHistory(currentOrg(), claims.sub) }));
}

export async function DELETE(req: Request) {
  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  return tenantJson(req, async () => {
    await clearChatHistory(currentOrg(), claims.sub);
    return { ok: true };
  });
}

const enc = new TextEncoder();
const sseEvent = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * Server-Sent Events: the narration streams token-by-token as `intro_delta`
 * events, then a final `done` event carries the complete AssistantAnswer
 * (blocks + mode) for the client to render/persist against. Both the user's
 * question and the finished answer are saved to chat history so the thread
 * survives a reload — see src/lib/server/chatHistory.ts.
 */
export async function POST(req: Request) {
  if (!rateLimit(`ani-chat:${clientKey(req)}`, 20, 5 * 60_000)) {
    return NextResponse.json({ detail: "Too many requests — please slow down." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const message: string = (body?.message ?? "").toString().slice(0, 500).trim();
  const context: string = (body?.context ?? "").toString().slice(0, 100);
  const device = ["ev", "solar", "battery", "fleet"].includes(body?.device) ? (body.device as ChatDevice) : undefined;
  if (!message) return NextResponse.json({ detail: "Empty message" }, { status: 400 });

  const claims = await getAuth(req);
  if (!claims) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await withTenant(req, async () => {
          const orgId = currentOrg();
          await saveChatMessage(orgId, claims.sub, "user", { text: message });
          const answer = await streamAnswer(message, context || undefined, (chunk) => {
            controller.enqueue(sseEvent("intro_delta", { chunk }));
          }, device);
          // The client already has the full answer via streamed deltas — a
          // history-write hiccup here must not discard it or surface as an
          // error, so this is deliberately outside the outer try/catch's reach.
          controller.enqueue(sseEvent("done", answer));
          try {
            await saveChatMessage(orgId, claims.sub, "assistant", { blocks: answer.blocks, mode: answer.mode });
          } catch {
            // Best-effort persistence; the answer was already delivered.
          }
        });
      } catch (err) {
        const detail = err instanceof UnauthorizedError ? "Unauthorized" : "Something went wrong — please try again.";
        controller.enqueue(sseEvent("error", { detail }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
