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
import time
from contextlib import asynccontextmanager, contextmanager
from typing import Awaitable, Callable, Iterator

from fastapi import FastAPI
from fastapi.responses import JSONResponse


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
