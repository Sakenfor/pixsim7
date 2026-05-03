"""
Backend-side embedding service binding.

Mirrors adapters/automation.py: this is the ONE direction of import we allow
(backend → embedding). The embedding package never imports backend.

Today we bind a `DaemonEmbeddingService` that owns a Python subprocess running
`tools/embed_general.py --serve`. Phase 2 swap point: replace
`_build_default_service()` to return an HTTP client to a dedicated inference
service — no caller code changes.

Configuration (env vars, with sensible defaults):
- PIXSIM_EMBEDDING_COMMAND — argv string for the daemon process
- PIXSIM_EMBEDDING_MODEL_ID — model identifier recorded on each vector row
"""
from __future__ import annotations

import os

from pixsim7.embedding.daemon import DaemonEmbeddingService
from pixsim7.embedding.locator import bind_embedding_service, try_get_embedding_service
from pixsim7.embedding.protocol import EmbeddingService


_DEFAULT_COMMAND = "python tools/embed_general.py --serve"
_DEFAULT_MODEL_ID = "google/siglip2-large-patch16-384"


def _build_default_service() -> EmbeddingService:
    command = os.environ.get("PIXSIM_EMBEDDING_COMMAND", _DEFAULT_COMMAND)
    model_id = os.environ.get("PIXSIM_EMBEDDING_MODEL_ID", _DEFAULT_MODEL_ID)
    return DaemonEmbeddingService(command=command, model_id=model_id)


def bind_embedding_capabilities() -> None:
    """Bind the embedding service into the locator. Idempotent re-bind."""
    bind_embedding_service(_build_default_service())


async def shutdown_embedding_capabilities() -> None:
    """Tear down the bound embedding service (kills the daemon subprocess
    if one is running). Safe to call when nothing was ever bound."""
    svc = try_get_embedding_service()
    if svc is not None:
        await svc.shutdown()
