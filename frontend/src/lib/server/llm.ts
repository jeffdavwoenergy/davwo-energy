// Shared OpenAI Chat Completions client — the one place every ANI/product-QA
// call site talks to an LLM, replacing three near-identical raw-fetch copies
// that had grown across assistant.ts (x2) and productQA.ts. Graceful no-key
// degradation (returns null, never throws) is the caller's contract to honour,
// same as every other "works without the key" integration in this codebase.
//
// Model default (OPENAI_MODEL) picked from OpenAI's current lineup as of
// September 2026 — beyond this assistant's training cutoff, so verify against
// your own OpenAI dashboard/API access before relying on it in production.
// gpt-5.6-terra is the mid-tier "balances intelligence and cost" model in
// that lineup (Sol = frontier/most expensive, Luna = cheapest/highest-volume) —
// matches this app's previous choice of a mid-tier Claude model over Opus for
// the same reason: this is short narration + grounded Q&A, not deep multi-step
// reasoning, so the flagship tier would be needless cost for no real quality gain.

const DEFAULT_MODEL = "gpt-5.6-terra";

// Base origin for the OpenAI-compatible Chat Completions endpoint. Defaults to
// OpenAI itself; in this environment it points at the local Emergent LLM shim
// (see /app/backend/server.py) so the Emergent universal key works unchanged.
const LLM_BASE = process.env.LLM_BASE_URL || "https://api.openai.com";
const CHAT_COMPLETIONS_URL = `${LLM_BASE}/v1/chat/completions`;

export function isLLMConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** One-shot completion. Returns null on any failure (missing key, HTTP error,
 * network error, empty response) — callers fall back to their own
 * deterministic template rather than surfacing an error. */
export async function callLLM(system: string, user: string, maxTokens: number): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/** Same request as callLLM, with stream: true — parses OpenAI's own SSE
 * response (chat.completion.chunk events, terminated by a literal "[DONE]"
 * line) and invokes onDelta per text chunk as it arrives, so the caller can
 * forward it to its own client in real time. Returns the full accumulated
 * text (for persistence) once the stream ends, or whatever streamed
 * successfully before a hard failure — never discards partial output, since
 * callers that already forwarded deltas to their own client can't safely
 * fall back to a full template on top of what the user already saw. */
export async function callLLMStream(
  system: string,
  user: string,
  maxTokens: number,
  onDelta: (chunk: string) => void,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  let full = "";
  try {
    const res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        max_completion_tokens: maxTokens,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok || !res.body) return null;

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
        const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const payload = dataLine.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          const delta = evt.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          // A malformed/partial SSE chunk — skip it rather than aborting the stream.
        }
      }
    }
    return full.trim() || null;
  } catch {
    return full.trim() || null;
  }
}
