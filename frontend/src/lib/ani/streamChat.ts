import { getToken } from "@/lib/api";
import type { Block } from "@/lib/ani/blocks";

export type ChatAnswer = { blocks: Block[]; mode: "live-llm" | "deterministic" };

/** Reads the /api/ani/chat SSE stream and applies each event to the
 * in-progress assistant message: intro text arrives token-by-token (or as
 * one chunk without an LLM key), then `done` carries the final structured
 * answer. Shared by every ANI chat surface (the full-page assistant and the
 * floating widget) so there's one place this protocol is understood, not two
 * copies that can drift out of sync with the server. */
export async function streamChat(
  message: string,
  context: string,
  onDelta: (chunk: string) => void,
  onDone: (answer: ChatAnswer) => void,
  onError: (detail: string) => void,
) {
  const res = await fetch("/api/ani/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
    body: JSON.stringify({ message, context }),
  });
  if (!res.ok || !res.body) {
    onError("Sorry — I couldn't reach the data services just now. Please try again.");
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const raw of events) {
      const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(7);
      // Mirrors narrateStream's own guard server-side: skip a malformed/
      // partial SSE chunk rather than letting one bad event throw out of the
      // read loop and discard everything already streamed to the user.
      let data: { chunk?: string; detail?: string; blocks?: Block[]; mode?: "live-llm" | "deterministic" };
      try {
        data = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (event === "intro_delta" && data.chunk) onDelta(data.chunk);
      else if (event === "done") onDone(data as ChatAnswer);
      else if (event === "error") onError(data.detail ?? "Something went wrong.");
    }
  }
}
