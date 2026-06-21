"""Standalone HTTP embedding service (SigLIP-2 image daemon).

Run by the launcher as the `embedding-daemon` service:

    python -m uvicorn pixsim7.embedding.server:app --host 0.0.0.0 --port 8002

Loads the SigLIP-2 model once and serves embeddings over HTTP so every worker /
backend shares a single GPU-resident model instead of each spawning its own
stdio child. The backend reaches it via `http_client.HttpEmbeddingService`.

Endpoints:
  GET  /health  -> 503 while the model is still loading or if inference is
                   wedged (an in-flight request stuck past the threshold);
                   200 {"status":"ok","model_loaded":true} once ready. The
                   launcher's HealthManager probes this — so a wedge surfaces
                   as an unhealthy card instead of a silent hang.
  POST /embed   -> {"paths":[...], "model_id"?:...} ->
                   {"embeddings":[[...]],"dim":N,"model_id":...}
                   An optional request "model_id" must match the loaded model;
                   a mismatch returns 409 {"error":"model_not_served",...}.

Configuration (env):
  PIXSIM_EMBEDDING_MODEL_ID  - model identifier (default SigLIP-2 large)
  PIXSIM_EMBEDDING_WEDGE_SEC - in-flight age (s) past which /health reports
                               'wedged' (default 120)
"""
from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pixsim7.embedding._siglip import MODEL_ID, embed_images, load_model

_WEDGE_THRESHOLD_SEC = float(os.environ.get("PIXSIM_EMBEDDING_WEDGE_SEC", "120"))


class _ServiceState:
    """Process-wide model + in-flight bookkeeping for the wedge guard."""

    def __init__(self) -> None:
        self.model = None
        self.processor = None
        self.device: str | None = None
        self.model_id: str = os.environ.get("PIXSIM_EMBEDDING_MODEL_ID", MODEL_ID)
        self.loaded: bool = False
        self.load_error: str | None = None
        # monotonic start times of in-flight embed calls; oldest drives the wedge guard
        self.in_flight_starts: list[float] = []

    @property
    def in_flight(self) -> int:
        return len(self.in_flight_starts)

    def oldest_age(self) -> float | None:
        if not self.in_flight_starts:
            return None
        return time.monotonic() - min(self.in_flight_starts)


state = _ServiceState()


async def _load_model() -> None:
    try:
        state.model, state.processor, state.device = await asyncio.to_thread(
            load_model, state.model_id
        )
        state.loaded = True
    except Exception as exc:  # surfaced via /health, not a hard crash
        state.load_error = str(exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load in the background so the server starts listening immediately and
    # /health can report 'loading' (launcher shows STARTING) during warm-up.
    task = asyncio.create_task(_load_model())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="PixSim Embedding Daemon", lifespan=lifespan)


class EmbedBody(BaseModel):
    paths: list[str]
    # Optional per-instance model selection. When set it must match the model
    # this daemon has loaded; a mismatch is rejected (409) so the caller fails
    # the analysis cleanly instead of embedding with the wrong model.
    model_id: str | None = None


@app.get("/health")
async def health():
    if state.load_error:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "error": state.load_error},
        )
    if not state.loaded:
        return JSONResponse(
            status_code=503,
            content={"status": "loading", "model_loaded": False},
        )
    age = state.oldest_age()
    if age is not None and age > _WEDGE_THRESHOLD_SEC:
        return JSONResponse(
            status_code=503,
            content={
                "status": "wedged",
                "in_flight": state.in_flight,
                "oldest_age_sec": round(age, 1),
            },
        )
    return {"status": "ok", "model_loaded": True, "in_flight": state.in_flight}


@app.post("/embed")
async def embed(body: EmbedBody):
    if not state.loaded:
        return JSONResponse(status_code=503, content={"error": "model not loaded"})
    if body.model_id is not None and body.model_id != state.model_id:
        # Reject rather than silently embed with the wrong model. Until the
        # daemon hosts multiple models (c3), the requested model must match the
        # one this daemon loaded.
        return JSONResponse(
            status_code=409,
            content={
                "error": "model_not_served",
                "requested_model_id": body.model_id,
                "served_model_id": state.model_id,
            },
        )
    if not body.paths:
        return {"embeddings": [], "dim": 0, "model_id": state.model_id}

    start = time.monotonic()
    state.in_flight_starts.append(start)
    try:
        # torch inference is blocking — run off the event loop so /health stays
        # responsive (and a genuine hang shows up via the wedge guard, not a
        # frozen server).
        vectors = await asyncio.to_thread(
            embed_images, state.model, state.processor, state.device, body.paths
        )
    finally:
        state.in_flight_starts.remove(start)

    dim = len(vectors[0]) if vectors else 0
    return {"embeddings": vectors, "dim": dim, "model_id": state.model_id}
