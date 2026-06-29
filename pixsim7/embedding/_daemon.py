"""Thin shared base for the embedding daemons (image SigLIP, text BGE).

Factors out the *modality-agnostic* daemon contract that the launcher's
``InferenceConverter`` + ``HealthManager`` couple to:

- a background warm-load in ``lifespan`` so the server starts listening at once
  and ``/health`` reports ``loading`` during warm-up,
- the ``/health`` state machine: loading(503) -> error(503) -> wedged(503) ->
  ok(200),
- an in-flight wedge guard so a stuck inference surfaces as an unhealthy card
  instead of a silent hang.

Model loading, the inference endpoint(s), and any multi-model registry stay in
the concrete daemon module (``server.py`` for images, ``text_server.py`` for
text) — only this contract is shared. The image daemon predates this base and is
migrated onto it separately; new daemons build on it directly.
"""
from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager, contextmanager
from typing import Awaitable, Callable, Iterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class DaemonState:
    """Readiness of the daemon's pinned model, surfaced via ``/health``.

    ``ready`` flips True once the warm-load succeeds; ``load_error`` records a
    warm-load failure (reported as 503 ``error`` rather than crashing the
    process so the launcher shows an unhealthy card)."""

    __slots__ = ("ready", "load_error")

    def __init__(self) -> None:
        self.ready = False
        self.load_error: str | None = None


class InFlight:
    """Inference bookkeeping for the wedge guard.

    Only *inference* time is tracked — model loads are deliberately excluded so
    a cold lazy-load doesn't masquerade as a wedge. Bracket each inference in
    ``with inflight.track(): ...``."""

    __slots__ = ("starts",)

    def __init__(self) -> None:
        self.starts: list[float] = []

    @contextmanager
    def track(self) -> Iterator[None]:
        start = time.monotonic()
        self.starts.append(start)
        try:
            yield
        finally:
            self.starts.remove(start)

    @property
    def count(self) -> int:
        return len(self.starts)

    def oldest_age(self) -> float | None:
        if not self.starts:
            return None
        return time.monotonic() - min(self.starts)


def _request_header(request: Request, name: str) -> str | None:
    value = request.headers.get(name)
    if not value:
        return None
    value = value.strip()
    return value or None


def install_daemon_request_logging(
    app: FastAPI,
    *,
    daemon_name: str,
    logger_name: str = "pixsim7.embedding.daemon",
) -> None:
    """Install shared request logging for embedding daemons.

    Backend clients can set ``X-PixSim-Caller`` and ``X-PixSim-Context`` to make
    daemon logs identify the code path/job that initiated an inference request.
    When those headers are absent, the log still records peer/forwarded IP and
    user-agent. Health probes are logged at debug level because launcher probes
    are frequent and usually not actionable.
    """
    request_logger = logging.getLogger(logger_name)

    @app.middleware("http")
    async def _log_request(request: Request, call_next):
        start = time.perf_counter()
        path = request.url.path
        caller = _request_header(request, "x-pixsim-caller") or "unknown"
        caller_context = _request_header(request, "x-pixsim-context")
        request_id = (
            _request_header(request, "x-pixsim-request-id")
            or _request_header(request, "x-request-id")
            or _request_header(request, "x-correlation-id")
        )
        forwarded_for = _request_header(request, "x-forwarded-for")
        user_agent = _request_header(request, "user-agent")
        client = request.client.host if request.client else None

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            request_logger.exception(
                "daemon_request_failed daemon=%s caller=%s method=%s path=%s "
                "duration_ms=%s client=%s forwarded_for=%s user_agent=%s "
                "request_id=%s caller_context=%s",
                daemon_name,
                caller,
                request.method,
                path,
                duration_ms,
                client,
                forwarded_for,
                user_agent,
                request_id,
                caller_context,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        log = request_logger.debug if path == "/health" else request_logger.info
        log(
            "daemon_request daemon=%s caller=%s method=%s path=%s status_code=%s "
            "duration_ms=%s client=%s forwarded_for=%s user_agent=%s "
            "request_id=%s caller_context=%s",
            daemon_name,
            caller,
            request.method,
            path,
            response.status_code,
            duration_ms,
            client,
            forwarded_for,
            user_agent,
            request_id,
            caller_context,
        )
        return response


def evaluate_health(
    ready: bool,
    load_error: str | None,
    inflight: InFlight,
    wedge_threshold_sec: float,
    extra: dict | None = None,
) -> tuple[int, dict]:
    """(http_status, body) for the daemon's current health. Pure — so it's unit
    testable without spinning up the server.

    Takes primitive readiness (``ready`` / ``load_error``) rather than a
    ``DaemonState`` so it serves both a single-model daemon (whose state a
    ``DaemonState`` holds) and a multi-model one (whose readiness is computed
    live from a model registry)."""
    extra = extra or {}
    if load_error:
        return 503, {"status": "error", "error": load_error, **extra}
    if not ready:
        return 503, {"status": "loading", "model_loaded": False, **extra}
    age = inflight.oldest_age()
    if age is not None and age > wedge_threshold_sec:
        return 503, {
            "status": "wedged",
            "in_flight": inflight.count,
            "oldest_age_sec": round(age, 1),
            **extra,
        }
    return 200, {"status": "ok", "model_loaded": True, "in_flight": inflight.count, **extra}


def build_daemon_app(
    *,
    title: str,
    warmup: Callable[[], Awaitable[None]],
    state: DaemonState,
    inflight: InFlight,
    wedge_threshold_sec: float,
    health_extra: Callable[[], dict] | None = None,
) -> FastAPI:
    """FastAPI app with the shared lifespan + ``/health`` contract wired in.

    ``warmup`` loads the pinned model (may raise — the base records the failure
    on ``state.load_error`` and reports it via ``/health`` rather than crashing).
    The caller registers its own inference route(s) on the returned app and
    brackets each inference in ``inflight.track()``. ``health_extra`` contributes
    daemon-specific fields (e.g. ``model_id``) to every ``/health`` body."""

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        async def _warm() -> None:
            try:
                await warmup()
                state.ready = True
                state.load_error = None
            except Exception as exc:  # surfaced via /health, not a hard crash
                state.load_error = str(exc)

        task = asyncio.create_task(_warm())
        try:
            yield
        finally:
            task.cancel()

    app = FastAPI(title=title, lifespan=lifespan)
    install_daemon_request_logging(app, daemon_name=title)

    @app.get("/health")
    async def health():
        extra = health_extra() if health_extra else {}
        code, body = evaluate_health(
            state.ready, state.load_error, inflight, wedge_threshold_sec, extra
        )
        if code == 200:
            return body
        return JSONResponse(status_code=code, content=body)

    return app


class ModelSlot:
    """A single warm-loaded model with atomic, no-downtime swap.

    ``load(model_id) -> model`` runs in a worker thread. ``swap`` loads the new
    model *fully* before replacing the current one, so the inference path and
    ``/health`` never observe a half-loaded model — the previous model keeps
    serving until the new one is ready. A failed *initial* load records
    ``load_error`` (surfaced as 503 ``error``); a failed swap while a model is
    already live keeps the live model and re-raises to the caller only, so the
    daemon stays healthy. Swaps are serialized; a swap to the already-current id
    is a no-op.

    This is the single-model analog of the image daemon's ``_ModelRegistry``
    (which adds multi-model hosting + LRU eviction); a text/embedding daemon
    serving one model uses this instead of carrying that machinery.
    """

    def __init__(self, load: Callable[[str], object]) -> None:
        self._load = load
        self._current: tuple[str, object] | None = None
        self._lock = asyncio.Lock()
        self.load_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._current is not None

    @property
    def key(self) -> str | None:
        """Currently-served model id (None until the first load completes)."""
        return self._current[0] if self._current else None

    def get(self) -> object:
        """The live model object. Raises if no model is loaded yet — callers
        guard on ``ready`` first and reply 503 ``model_loading``."""
        if self._current is None:
            raise RuntimeError("model not loaded")
        return self._current[1]

    async def swap(self, model_id: str) -> object:
        """Warm-load ``model_id`` and atomically make it current. No-op if it is
        already current. On failure: records ``load_error`` only when nothing was
        loaded yet (initial load); otherwise keeps the live model and re-raises."""
        async with self._lock:
            if self._current is not None and self._current[0] == model_id:
                return self._current[1]
            try:
                model = await asyncio.to_thread(self._load, model_id)
            except Exception as exc:
                if self._current is None:
                    self.load_error = str(exc)
                raise
            self._current = (model_id, model)
            self.load_error = None
            return model


def attach_config_route(app: FastAPI, slot: ModelSlot, *, path: str = "/config"):
    """Register ``POST {path}`` on a single-model daemon: warm-swap the served
    model without a restart.

    Body ``{"model": "<id>"}`` → loads the model (keeping the current one live
    until ready), then returns ``{"model_id": <now-current>}``. A load failure
    returns 503 ``model_load_failed`` and leaves any live model untouched. This
    is the single-model analog of the image daemon's ``/config/allowed-models``;
    the backend pushes the active embedder's model here to keep the daemon in
    sync with config (see services/embedding/daemon_sync.py)."""

    class _ConfigBody(BaseModel):
        model: str

    @app.post(path)
    async def set_model(body: _ConfigBody):
        try:
            await slot.swap(body.model)
        except Exception as exc:
            return JSONResponse(
                status_code=503,
                content={
                    "error": "model_load_failed",
                    "model_id": body.model,
                    "detail": str(exc),
                },
            )
        return {"model_id": slot.key}

    return set_model
