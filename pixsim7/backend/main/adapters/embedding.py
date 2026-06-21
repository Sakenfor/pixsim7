"""
Backend-side embedding service binding.

Mirrors adapters/automation.py: this is the ONE direction of import we allow
(backend → embedding). The embedding package never imports backend.

We bind a `CompositeEmbeddingService` that satisfies the sibling's unified
`EmbeddingService` protocol across both modalities:

- embed_images(...) → `HttpEmbeddingService` (HTTP client to the standalone
  embedding-daemon service; lives in the sibling, no torch dependency).
- embed_texts(...)  → the backend text-provider registry (OpenAI / command),
  which stays host-side because it needs DB-backed credentials and the backend
  subprocess runner. The composite resolves model_id → provider here, where
  `ai_model_registry` + `embedding_registry` are available.

Model *resolution* (picking a default model) needs a DB session and so stays
in the per-request services; the composite only does session-free provider
*lookup* from an explicit, already-resolved model_id.

Configuration (env vars, with sensible defaults):
- PIXSIM_EMBEDDING_BASE_URL — base URL of the embedding-daemon HTTP service
  (the launcher auto-derives this from the daemon's PIXSIM_EMBEDDING_PORT and
  injects it into every service process)
- PIXSIM_EMBEDDING_MODEL_ID — model identifier recorded on each image vector row

The image path is an HTTP client to the standalone `embedding-daemon` service
(launcher-managed, one GPU-resident model shared across all consumers).
"""
from __future__ import annotations

import os

from pixsim7.backend.main.services.ai_model.registry import ai_model_registry
from pixsim7.backend.main.services.embedding.embedding_service import (
    EmbeddingModelError,
)
from pixsim7.backend.main.services.embedding.registry import embedding_registry
from pixsim7.embedding.http_client import HttpEmbeddingService
from pixsim7.embedding.locator import bind_embedding_service, try_get_embedding_service
from pixsim7.embedding.protocol import (
    EmbedRequest,
    EmbedResult,
    EmbedTextRequest,
    EmbeddingService,
)
from pixsim7.embedding.validation import validate_embeddings


_DEFAULT_URL = "http://localhost:8002"
_DEFAULT_MODEL_ID = "google/siglip2-large-patch16-384"


def _build_image_service() -> EmbeddingService:
    base_url = os.environ.get("PIXSIM_EMBEDDING_BASE_URL", _DEFAULT_URL)
    model_id = os.environ.get("PIXSIM_EMBEDDING_MODEL_ID", _DEFAULT_MODEL_ID)
    return HttpEmbeddingService(base_url=base_url, model_id=model_id)


def _extract_bare_model(model_id: str) -> str:
    """Strip the provider prefix: 'openai:text-embedding-3-small' → 'text-embedding-3-small'."""
    return model_id.split(":", 1)[1] if ":" in model_id else model_id


class CompositeEmbeddingService(EmbeddingService):
    """Routes embed_images to the image daemon and embed_texts to the
    backend text-provider registry. Bound into the locator at startup so a
    single `get_embedding_service()` reaches both modalities."""

    def __init__(self, image_service: EmbeddingService) -> None:
        self._image_service = image_service

    async def embed_images(self, request: EmbedRequest) -> EmbedResult:
        return await self._image_service.embed_images(request)

    async def embed_texts(self, request: EmbedTextRequest) -> EmbedResult:
        provider = self._resolve_text_provider(request.model_id)
        bare_model = _extract_bare_model(request.model_id)
        texts = list(request.texts)

        raw = await provider.embed_texts(model_id=bare_model, texts=texts)
        dims = provider.default_dimensions
        vectors = validate_embeddings(
            raw, expected_count=len(texts), expected_dimensions=dims
        )
        return EmbedResult(vectors=vectors, dim=dims, model_id=request.model_id)

    async def shutdown(self) -> None:
        await self._image_service.shutdown()

    @staticmethod
    def _resolve_text_provider(model_id: str):
        """model_id → ai_model_registry → provider_id → embedding_registry.

        Session-free: both registries are module singletons. Raises
        EmbeddingModelError for unknown model or unregistered provider.

        The model's ``provider_id`` is the vendor/account id ("openai", "cmd"),
        while embedding provider plugins register under a capability-scoped id
        ("openai-embedding", "cmd-embedding"). Prefer an exact match, then fall
        back to the "<vendor>-embedding" plugin id."""
        model = ai_model_registry.get(model_id)
        if not model:
            raise EmbeddingModelError(
                f"Model '{model_id}' not found in AI model registry"
            )
        provider_id = model.provider_id
        if not provider_id:
            raise EmbeddingModelError(f"Model '{model_id}' has no provider_id")
        for candidate in (provider_id, f"{provider_id}-embedding"):
            if embedding_registry.has(candidate):
                return embedding_registry.get(candidate)
        raise EmbeddingModelError(
            f"Embedding provider for model '{model_id}' "
            f"(provider_id={provider_id!r}) is not registered"
        )


def _build_default_service() -> EmbeddingService:
    return CompositeEmbeddingService(image_service=_build_image_service())


def bind_embedding_capabilities() -> None:
    """Bind the embedding service into the locator. Idempotent re-bind."""
    bind_embedding_service(_build_default_service())


async def shutdown_embedding_capabilities() -> None:
    """Tear down the bound embedding service (kills the daemon subprocess
    if one is running). Safe to call when nothing was ever bound."""
    svc = try_get_embedding_service()
    if svc is not None:
        await svc.shutdown()
