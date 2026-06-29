"""Standalone HTTP text embedding daemon (local BGE text model).

Run by the launcher as the ``text-embedding-daemon`` service:

    python -m uvicorn pixsim7.embedding.text_server:app --host 0.0.0.0 --port 8003

Loads the local text model (``BAAI/bge-base-en-v1.5`` by default) ONCE and
serves ``/embed_texts`` over HTTP, so prompt/block text embedding shares one
warm model instead of spawning a fresh subprocess that reloads the model
(~15-25s) on every call — the cause of the composer's "find similar prompts"
30s timeout. The backend reaches it via ``http_client.HttpTextEmbeddingService``;
when the daemon is down the backend falls back to the one-shot
``CommandEmbeddingProvider`` so text embedding still works (just slow).

Single pinned model — no GPU LRU / allowed-set machinery (that's the image
daemon's concern, driven by per-instance ``asset:embedding`` model selection).
The shared lifespan + ``/health`` contract comes from ``_daemon``.

Configuration (env):
  PIXSIM_TEXT_EMBED_MODEL       - HF model id to load (default BAAI/bge-base-en-v1.5;
                                  see cli.text_local for pooling / max-token knobs)
  PIXSIM_TEXT_EMBEDDING_WEDGE_SEC - in-flight age (s) past which /health reports
                                  'wedged' (default 120)
"""
from __future__ import annotations

import asyncio
import os

from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pixsim7.embedding._daemon import (
    DaemonState,
    InFlight,
    ModelSlot,
    attach_config_route,
    build_daemon_app,
)
from pixsim7.embedding.cli.text_local import (
    MODEL_ID,
    embed_texts as _embed_texts,
    load_model,
)

_WEDGE_THRESHOLD_SEC = float(os.environ.get("PIXSIM_TEXT_EMBEDDING_WEDGE_SEC", "120"))

state = DaemonState()
inflight = InFlight()
# Holds the served model with no-downtime warm-swap. `state` (managed by
# build_daemon_app) tracks initial-load readiness for /health; the slot is the
# live model the embed path reads and the /config route swaps.
slot = ModelSlot(load=load_model)


async def _warmup() -> None:
    await slot.swap(MODEL_ID)


def _health_extra() -> dict:
    # Report the model the slot actually serves (reflects a /config swap), not
    # the startup default.
    return {"model_id": slot.key or MODEL_ID}


app = build_daemon_app(
    title="PixSim Text Embedding Daemon",
    warmup=_warmup,
    state=state,
    inflight=inflight,
    wedge_threshold_sec=_WEDGE_THRESHOLD_SEC,
    health_extra=_health_extra,
)

# POST /config {"model": "<hf-id>"} — backend keeps the served model in sync with
# the active embedder without a daemon restart (warm-swap; old model stays live
# until the new one is ready).
attach_config_route(app, slot)


class EmbedTextsBody(BaseModel):
    texts: list[str]
    # Accepted for request-shape parity with the provider contract; this daemon
    # serves exactly one model, so it's informational only.
    model: str | None = None


@app.post("/embed_texts")
async def embed_texts(body: EmbedTextsBody):
    if not body.texts:
        return {"embeddings": [], "dim": 0, "model_id": slot.key or MODEL_ID}

    # The model is warm-loaded in the background; until it's ready (or if the
    # initial load errored) reply 503 so the caller retries / falls back
    # gracefully — same contract as the image daemon's load-failure path.
    if slot.load_error:
        return JSONResponse(
            status_code=503,
            content={"error": "model_load_failed", "detail": slot.load_error},
        )
    if not slot.ready:
        return JSONResponse(status_code=503, content={"error": "model_loading"})

    model, tokenizer, device = slot.get()
    # torch inference is blocking — run off the event loop so /health stays
    # responsive and a genuine hang surfaces via the wedge guard.
    with inflight.track():
        vectors = await asyncio.to_thread(
            _embed_texts, model, tokenizer, device, list(body.texts)
        )

    dim = len(vectors[0]) if vectors else 0
    return {"embeddings": vectors, "dim": dim, "model_id": slot.key}
