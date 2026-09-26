"""
Davwo / ANI environment bridge.

This FastAPI service runs on :8001 (managed by supervisor). In this environment
the Kubernetes ingress routes every request whose path starts with `/api` to
:8001, and everything else to :3000 (where the Next.js app is served by the
`frontend` supervisor program via `next dev`).

Because the Next.js app serves BOTH its pages and its own `/api/*` route
handlers on :3000, this service simply reverse-proxies all `/api/*` traffic
(incl. SSE streaming) to the Next server on localhost:3000 so the original
same-origin `/api` contract keeps working unchanged.

It also exposes an OpenAI-compatible LLM shim at `/llm/v1/chat/completions`
backed by the Emergent universal LLM key (via emergentintegrations), so the
app's server-side `src/lib/server/llm.ts` (which speaks raw OpenAI Chat
Completions) stays "connected" without a real OpenAI key.
"""

import os
import json
import uuid
import time
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, Response, JSONResponse
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("davwo-bridge")

NEXT_ORIGIN = os.environ.get("NEXT_ORIGIN", "http://localhost:3000")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Hop-by-hop headers that must not be forwarded verbatim.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
    "content-encoding", "host",
}

app = FastAPI(title="Davwo bridge")

# A single long-lived client; no timeout so SSE streams (ANI chat) stay open.
_client = httpx.AsyncClient(timeout=None)


# ---------------------------------------------------------------------------
# OpenAI-compatible LLM shim (Emergent universal key via emergentintegrations)
# ---------------------------------------------------------------------------
def _map_model(requested: str | None):
    """Map an incoming OpenAI-style model name to an Emergent provider+model.
    The app only needs short narration / grounded Q&A, so a fast mid-tier
    model is plenty. Unknown names fall back to a sensible default."""
    m = (requested or "").lower()
    if m.startswith("claude"):
        return "anthropic", "claude-sonnet-4-6"
    if m.startswith("gemini"):
        return "gemini", "gemini-2.5-flash"
    # everything else (gpt-*, unknown) -> a fast, cheap OpenAI model
    return "openai", "gpt-4.1-mini"


@app.post("/llm/v1/chat/completions")
async def llm_chat_completions(request: Request):
    if not EMERGENT_LLM_KEY:
        return JSONResponse({"error": "LLM not configured"}, status_code=503)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)

    messages = body.get("messages", []) or []
    system_msg = "\n\n".join(
        str(m.get("content", "")) for m in messages if m.get("role") == "system"
    )
    user_msg = "\n\n".join(
        str(m.get("content", "")) for m in messages
        if m.get("role") in ("user", "assistant")
    ) or " "
    stream = bool(body.get("stream"))
    provider, model = _map_model(body.get("model"))

    try:
        from emergentintegrations.llm.chat import (
            LlmChat, UserMessage, TextDelta, StreamDone,
        )
    except Exception as e:  # library missing -> behave like an unreachable LLM
        logger.error("emergentintegrations import failed: %s", e)
        return JSONResponse({"error": "llm unavailable"}, status_code=502)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=str(uuid.uuid4()),
        system_message=system_msg or "You are a helpful assistant.",
    ).with_model(provider, model)

    created = int(time.time())
    cid = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    if not stream:
        try:
            text = await chat.send_message(UserMessage(text=user_msg))
        except Exception as e:
            logger.error("LLM send_message failed: %s", e)
            return JSONResponse({"error": "llm error"}, status_code=502)
        if not isinstance(text, str):
            text = str(text) if text is not None else ""
        return JSONResponse({
            "id": cid,
            "object": "chat.completion",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }],
        })

    async def event_stream():
        try:
            first = {
                "id": cid, "object": "chat.completion.chunk", "created": created,
                "model": model,
                "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
            }
            yield f"data: {json.dumps(first)}\n\n"
            async for ev in chat.stream_message(UserMessage(text=user_msg)):
                if isinstance(ev, TextDelta) and ev.content:
                    chunk = {
                        "id": cid, "object": "chat.completion.chunk", "created": created,
                        "model": model,
                        "choices": [{"index": 0, "delta": {"content": ev.content}, "finish_reason": None}],
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"
                elif isinstance(ev, StreamDone):
                    break
            done = {
                "id": cid, "object": "chat.completion.chunk", "created": created,
                "model": model,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            yield f"data: {json.dumps(done)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error("LLM stream failed: %s", e)
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Reverse proxy: /api/* -> Next.js on :3000 (streaming, method/header/body safe)
# ---------------------------------------------------------------------------
@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy_api(path: str, request: Request):
    target = f"{NEXT_ORIGIN}/api/{path}"
    if request.url.query:
        target += f"?{request.url.query}"

    fwd_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP
    }
    body = await request.body()

    req = _client.build_request(
        request.method, target, headers=fwd_headers, content=body,
    )
    try:
        upstream = await _client.send(req, stream=True)
    except Exception as e:
        logger.error("proxy send failed for %s: %s", target, e)
        return JSONResponse({"error": "upstream unavailable"}, status_code=502)

    resp_headers = {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in HOP_BY_HOP
    }

    async def body_iter():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()

    return StreamingResponse(
        body_iter(),
        status_code=upstream.status_code,
        headers=resp_headers,
    )


@app.get("/healthz")
async def healthz():
    return {"ok": True, "next_origin": NEXT_ORIGIN}
