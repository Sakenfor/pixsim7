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
  POST /config/allowed-models -> {"model_ids":[...], "default"?:...} -> updates
                   the allowed set (union with the env baseline) and optionally
                   switches the warm-loaded default. The backend pushes the set +
                   default derived from the enabled asset:embedding instances.

Configuration (env):
  PIXSIM_EMBEDDING_MODEL_ID    - startup/seed default (warm-loaded, pinned). The
                                 live default is otherwise driven by the app's
                                 active embedder via /config/allowed-models.
  PIXSIM_EMBEDDING_MODEL_IDS   - optional manual baseline of extra allowed models
                                 (the set is normally auto-derived from instances)
  PIXSIM_EMBEDDING_MAX_RESIDENT- max models resident in VRAM (default 2; LRU)
  PIXSIM_EMBEDDING_WEDGE_SEC   - in-flight age (s) past which /health reports
                                 'wedged' (default 120)
"""
from __future__ import annotations

import asyncio
import logging
import os
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pixsim7.embedding._daemon import (
    InFlight,
    evaluate_health,
    install_daemon_request_logging,
)
from pixsim7.embedding._siglip import (
    EmbeddingImageLoadError,
    MODEL_ID,
    embed_images,
    empty_cuda_cache,
    load_model,
)

_WEDGE_THRESHOLD_SEC = float(os.environ.get("PIXSIM_EMBEDDING_WEDGE_SEC", "120"))
logger = logging.getLogger("pixsim7.embedding.server")
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}


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


class _ModelRegistry:
    """Lazy-loading, LRU-evicting registry of GPU-resident embedding models.

    `acquire()` loads on first use and evicts the least-recently-used
    *non-default* model once more than `capacity` are resident. The default is
    pinned (warm-loaded at startup, never evicted) so the no-model-id path and
    /health stay ready. Loads run off the event loop and are de-duped per
    model so concurrent first-requests don't double-load."""

    def __init__(self, *, default_model_id: str, allowed: set[str], capacity: int) -> None:
        self.default_model_id = default_model_id
        # The env-configured set is the baseline; the backend can additively push
        # an auto-derived set (from the asset:embedding instances) on top of it.
        self._baseline = set(allowed) | {default_model_id}
        self.allowed = set(self._baseline)
        self.capacity = capacity
        self.load_error: str | None = None  # default-model warmup failure
        self._loaded: "OrderedDict[str, tuple]" = OrderedDict()
        self._reg_lock = asyncio.Lock()
        self._load_locks: dict[str, asyncio.Lock] = {}

    def is_allowed(self, model_id: str) -> bool:
        return model_id in self.allowed

    def set_allowed(self, model_ids: "list[str]") -> None:
        """Replace the auto-derived portion of the allowed set (union with the
        env baseline + current default). Lets the backend keep the hosted set in
        sync with the enabled asset:embedding instances without a daemon restart.
        Atomic rebind — no lock needed (is_allowed reads a single reference)."""
        self.allowed = (
            self._baseline | {self.default_model_id} | {m for m in model_ids if m}
        )

    async def _swap_default(self, model_id: str) -> None:
        """Warm-load `model_id`, then make it the default. Flipping only after
        the load means /health never reports a not-ready default mid-swap; the
        previous default stays pinned until then (and becomes evictable after)."""
        await self.acquire(model_id)
        self.default_model_id = model_id
        self.allowed = self.allowed | {model_id}

    def set_default(self, model_id: str) -> "asyncio.Task | None":
        """Change the warm-loaded/pinned default to `model_id` (the app's active
        embedder). The swap loads in the background so the push returns at once;
        returns the task (or None if it's already the default / empty)."""
        if not model_id or model_id == self.default_model_id:
            return None
        self.allowed = self.allowed | {model_id}  # allow immediately
        return asyncio.create_task(self._swap_default(model_id))

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
# Wedge guard shared with the text daemon (pixsim7.embedding._daemon).
inflight = InFlight()


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
install_daemon_request_logging(
    app,
    daemon_name="PixSim Embedding Daemon",
    logger_name="pixsim7.embedding.server",
)


class EmbedBody(BaseModel):
    paths: list[str]
    # Optional per-instance model selection. Omitted -> the default model. A
    # model_id outside the hosted/allowed set is rejected (409) so the caller
    # fails the analysis cleanly instead of embedding with the wrong model.
    model_id: str | None = None


class AllowedModelsBody(BaseModel):
    model_ids: list[str]
    # Optional: make this the warm-loaded/pinned default (the app's active
    # embedder). Swapped in the background; omit to leave the default unchanged.
    default: str | None = None


def _health_extra() -> dict:
    return {
        "model_id": registry.default_model_id,
        "model_ids": sorted(registry.allowed),
        "loaded_model_ids": registry.loaded_model_ids,
    }


@app.get("/health")
async def health():
    # Shared loading/error/wedged/ok response shape (pixsim7.embedding._daemon).
    # Readiness is computed live from the registry, which owns the dynamic
    # multi-model state; the hosted set (via _health_extra) is reported even
    # while loading/erroring so the UI can always show which models are served.
    code, body = evaluate_health(
        registry.default_ready,
        registry.load_error,
        inflight,
        _WEDGE_THRESHOLD_SEC,
        _health_extra(),
    )
    if code == 200:
        return body
    return JSONResponse(status_code=code, content=body)


@app.post("/config/allowed-models")
async def set_allowed_models(body: AllowedModelsBody):
    """Update the auto-derived hosted set (union with the env baseline).

    Called by the backend to keep the daemon's served models in sync with the
    enabled asset:embedding instances — so a per-instance model is hosted
    without a manual env edit / daemon restart. An optional `default` switches
    the warm-loaded/pinned model (background swap). Returns the resulting set."""
    registry.set_allowed(body.model_ids)
    if body.default:
        registry.set_default(body.default)
    return {"allowed": sorted(registry.allowed), "default": registry.default_model_id}


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

    non_image_paths = [
        path for path in body.paths
        if Path(path).suffix.lower() and Path(path).suffix.lower() not in _IMAGE_EXTENSIONS
    ]
    if non_image_paths:
        logger.warning(
            "embedding_request_contains_non_images model_id=%s path_count=%s non_image_count=%s examples=%s",
            model_id,
            len(body.paths),
            len(non_image_paths),
            non_image_paths[:3],
        )
        return JSONResponse(
            status_code=400,
            content={
                "error": "non_image_paths",
                "model_id": model_id,
                "path_count": len(body.paths),
                "non_image_count": len(non_image_paths),
                "examples": non_image_paths[:3],
            },
        )

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
    # torch inference is blocking — run off the event loop so /health stays
    # responsive (and a genuine hang shows up via the wedge guard, not a frozen
    # server).
    with inflight.track():
        try:
            vectors = await asyncio.to_thread(
                embed_images, model, processor, device, body.paths
            )
        except EmbeddingImageLoadError as exc:
            logger.warning(
                "embedding_image_load_failed model_id=%s path_count=%s detail=%s",
                model_id,
                len(body.paths),
                str(exc),
            )
            return JSONResponse(
                status_code=400,
                content={
                    "error": "image_load_failed",
                    "model_id": model_id,
                    "path_count": len(body.paths),
                    "path": exc.path,
                    "detail": str(exc),
                },
            )

    dim = len(vectors[0]) if vectors else 0
    return {"embeddings": vectors, "dim": dim, "model_id": model_id}
