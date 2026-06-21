"""Standalone HTTP embedding service (SigLIP-2 image daemon).

Run by the launcher as the `embedding-daemon` service:

    python -m uvicorn pixsim7.embedding.server:app --host 0.0.0.0 --port 8002

Hosts a bounded *set* of image-embedding models GPU-resident and serves
embeddings over HTTP, so every worker / backend shares them instead of each
spawning its own stdio child. The backend reaches it via
`http_client.HttpEmbeddingService`.

Multi-model hosting:
  The daemon serves an allowed set of models (a per-analyzer-instance model_id
  that isn't in the set is rejected 409). A `default` model is warm-loaded at
  startup and used when a request omits model_id; the rest load lazily on first
  use. At most `capacity` models stay resident — the least-recently-used
  non-default model is evicted past that (the default is pinned so /health and
  the no-model-id path stay warm).

Endpoints:
  GET  /health  -> 503 while the default model is still loading / errored, or if
                   inference is wedged (an in-flight request stuck past the
                   threshold); 200 once the default is ready. The launcher's
                   HealthManager probes this. Reports `model_id` (default),
                   `model_ids` (allowed set), and `loaded_model_ids` (resident).
  POST /embed   -> {"paths":[...], "model_id"?:...} ->
                   {"embeddings":[[...]],"dim":N,"model_id":...}
                   `model_id` omitted -> the default model. A model_id not in the
                   allowed set returns 409 {"error":"model_not_served",...}.

Configuration (env):
  PIXSIM_EMBEDDING_MODEL_ID    - default/primary model (warm-loaded, pinned)
  PIXSIM_EMBEDDING_MODEL_IDS   - comma-separated *additional* allowed models
                                 (the hosted set = default ∪ these)
  PIXSIM_EMBEDDING_MAX_RESIDENT- max models resident in VRAM (default 2; LRU)
  PIXSIM_EMBEDDING_WEDGE_SEC   - in-flight age (s) past which /health reports
                                 'wedged' (default 120)
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import OrderedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pixsim7.embedding._siglip import (
    MODEL_ID,
    embed_images,
    empty_cuda_cache,
    load_model,
)

_WEDGE_THRESHOLD_SEC = float(os.environ.get("PIXSIM_EMBEDDING_WEDGE_SEC", "120"))


def _parse_config() -> tuple[str, set[str], int]:
    """(default_model_id, allowed_set, capacity) from the environment."""
    default = os.environ.get("PIXSIM_EMBEDDING_MODEL_ID", MODEL_ID)
    allowed = {default}
    for raw in os.environ.get("PIXSIM_EMBEDDING_MODEL_IDS", "").split(","):
        mid = raw.strip()
        if mid:
            allowed.add(mid)
    try:
        capacity = max(1, int(os.environ.get("PIXSIM_EMBEDDING_MAX_RESIDENT", "2")))
    except ValueError:
        capacity = 2
    return default, allowed, capacity


class _InFlight:
    """In-flight inference bookkeeping for the wedge guard.

    Only *inference* time is tracked — model loads are deliberately excluded so
    a cold lazy-load doesn't masquerade as a wedge."""

    def __init__(self) -> None:
        self.starts: list[float] = []

    @property
    def count(self) -> int:
        return len(self.starts)

    def oldest_age(self) -> float | None:
        if not self.starts:
            return None
        return time.monotonic() - min(self.starts)


class _ModelRegistry:
    """Lazy-loading, LRU-evicting registry of GPU-resident embedding models.

    `acquire()` loads on first use and evicts the least-recently-used
    *non-default* model once more than `capacity` are resident. The default is
    pinned (warm-loaded at startup, never evicted) so the no-model-id path and
    /health stay ready. Loads run off the event loop and are de-duped per
    model so concurrent first-requests don't double-load."""

    def __init__(self, *, default_model_id: str, allowed: set[str], capacity: int) -> None:
        self.default_model_id = default_model_id
        self.allowed = allowed
        self.capacity = capacity
        self.load_error: str | None = None  # default-model warmup failure
        self._loaded: "OrderedDict[str, tuple]" = OrderedDict()
        self._reg_lock = asyncio.Lock()
        self._load_locks: dict[str, asyncio.Lock] = {}

    def is_allowed(self, model_id: str) -> bool:
        return model_id in self.allowed

    @property
    def default_ready(self) -> bool:
        return self.default_model_id in self._loaded

    @property
    def loaded_model_ids(self) -> list[str]:
        return list(self._loaded.keys())

    async def acquire(self, model_id: str) -> tuple:
        """Return (model, processor, device) for `model_id`, loading if needed."""
        async with self._reg_lock:
            entry = self._loaded.get(model_id)
            if entry is not None:
                self._loaded.move_to_end(model_id)
                return entry
            load_lock = self._load_locks.setdefault(model_id, asyncio.Lock())

        async with load_lock:
            # Another waiter may have loaded it while we queued on the lock.
            async with self._reg_lock:
                entry = self._loaded.get(model_id)
                if entry is not None:
                    self._loaded.move_to_end(model_id)
                    return entry

            loaded = await asyncio.to_thread(load_model, model_id)

            async with self._reg_lock:
                self._loaded[model_id] = loaded
                self._loaded.move_to_end(model_id)
                self._evict_locked()
            return loaded

    def _evict_locked(self) -> None:
        """Evict LRU non-default models past capacity. Caller holds _reg_lock."""
        while len(self._loaded) > self.capacity:
            victim = next(
                (mid for mid in self._loaded if mid != self.default_model_id),
                None,
            )
            if victim is None:
                break  # only the pinned default is resident
            evicted = self._loaded.pop(victim)
            del evicted
            empty_cuda_cache()

    async def ensure_default(self) -> None:
        """Warm-load the default model; record (don't raise) any failure."""
        try:
            await self.acquire(self.default_model_id)
            self.load_error = None
        except Exception as exc:  # surfaced via /health, not a hard crash
            self.load_error = str(exc)


def _build_registry() -> _ModelRegistry:
    default, allowed, capacity = _parse_config()
    return _ModelRegistry(default_model_id=default, allowed=allowed, capacity=capacity)


registry = _build_registry()
inflight = _InFlight()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm-load the default in the background so the server starts listening
    # immediately and /health can report 'loading' (launcher shows STARTING)
    # during warm-up.
    task = asyncio.create_task(registry.ensure_default())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="PixSim Embedding Daemon", lifespan=lifespan)


class EmbedBody(BaseModel):
    paths: list[str]
    # Optional per-instance model selection. Omitted -> the default model. A
    # model_id outside the hosted/allowed set is rejected (409) so the caller
    # fails the analysis cleanly instead of embedding with the wrong model.
    model_id: str | None = None


def _health_extra() -> dict:
    return {
        "model_id": registry.default_model_id,
        "model_ids": sorted(registry.allowed),
        "loaded_model_ids": registry.loaded_model_ids,
    }


@app.get("/health")
async def health():
    # The hosted set is known even while loading/erroring, so callers (the UI's
    # daemon-status surface) can always show which models are served.
    if registry.load_error:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "error": registry.load_error, **_health_extra()},
        )
    if not registry.default_ready:
        return JSONResponse(
            status_code=503,
            content={"status": "loading", "model_loaded": False, **_health_extra()},
        )
    age = inflight.oldest_age()
    if age is not None and age > _WEDGE_THRESHOLD_SEC:
        return JSONResponse(
            status_code=503,
            content={
                "status": "wedged",
                "in_flight": inflight.count,
                "oldest_age_sec": round(age, 1),
                **_health_extra(),
            },
        )
    return {
        "status": "ok",
        "model_loaded": True,
        "in_flight": inflight.count,
        **_health_extra(),
    }


@app.post("/embed")
async def embed(body: EmbedBody):
    model_id = body.model_id or registry.default_model_id

    if not registry.is_allowed(model_id):
        # Reject a model this daemon isn't configured to host. The allowed set
        # is the launcher's hosted-set; add the model there to serve it.
        return JSONResponse(
            status_code=409,
            content={
                "error": "model_not_served",
                "requested_model_id": model_id,
                "served_model_ids": sorted(registry.allowed),
            },
        )

    if not body.paths:
        return {"embeddings": [], "dim": 0, "model_id": model_id}

    try:
        model, processor, device = await registry.acquire(model_id)
    except Exception as exc:
        # A model in the allowed set that nonetheless fails to load -> 503 so the
        # caller retries later (graceful), same as an unreachable daemon.
        return JSONResponse(
            status_code=503,
            content={"error": "model_load_failed", "model_id": model_id, "detail": str(exc)},
        )

    # Bracket the wedge guard around inference only (not the load above).
    start = time.monotonic()
    inflight.starts.append(start)
    try:
        # torch inference is blocking — run off the event loop so /health stays
        # responsive (and a genuine hang shows up via the wedge guard, not a
        # frozen server).
        vectors = await asyncio.to_thread(
            embed_images, model, processor, device, body.paths
        )
    finally:
        inflight.starts.remove(start)

    dim = len(vectors[0]) if vectors else 0
    return {"embeddings": vectors, "dim": dim, "model_id": model_id}
