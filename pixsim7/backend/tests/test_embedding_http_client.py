"""Unit tests for HttpEmbeddingService.

Uses httpx.MockTransport so no real embedding service is needed. Covers the
graceful-failure contract (unreachable / non-200 → EmbeddingServiceError), the
empty-paths short-circuit, and response validation.
"""
from __future__ import annotations

import json

import httpx
import pytest

from pixsim7.embedding.http_client import HttpEmbeddingService
from pixsim7.embedding.protocol import (
    EmbeddingServiceError,
    EmbedRequest,
    EmbedTextRequest,
)


def _svc(handler) -> HttpEmbeddingService:
    svc = HttpEmbeddingService(base_url="http://test", model_id="m")
    # Inject a MockTransport-backed client (bypasses the lazy real client).
    svc._client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="http://test"
    )
    return svc


@pytest.mark.asyncio
async def test_embed_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/embed"
        assert json.loads(request.content) == {"paths": ["/a.jpg", "/b.jpg"]}
        return httpx.Response(
            200, json={"embeddings": [[0.1, 0.2], [0.3, 0.4]], "dim": 2, "model_id": "x"}
        )

    res = await _svc(handler).embed_images(EmbedRequest(paths=["/a.jpg", "/b.jpg"]))
    assert res.vectors == [[0.1, 0.2], [0.3, 0.4]]
    assert res.dim == 2
    # Provenance is the model the daemon actually used (from its response),
    # not this adapter's configured default — they diverge once an instance
    # selects a model the daemon serves.
    assert res.model_id == "x"


@pytest.mark.asyncio
async def test_model_id_forwarded_in_payload() -> None:
    # When the request carries a model_id, it must reach the daemon so the
    # daemon can serve (or reject) that exact model.
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content) == {"paths": ["/a.jpg"], "model_id": "google/siglip2"}
        return httpx.Response(200, json={"embeddings": [[0.1]], "dim": 1, "model_id": "google/siglip2"})

    res = await _svc(handler).embed_images(
        EmbedRequest(paths=["/a.jpg"], model_id="google/siglip2")
    )
    assert res.model_id == "google/siglip2"


@pytest.mark.asyncio
async def test_model_mismatch_is_service_error() -> None:
    # The daemon's 409 reject surfaces as EmbeddingServiceError → the worker
    # marks the analysis failed (graceful), no wrong-model embedding stored.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"error": "model_not_served"})

    with pytest.raises(EmbeddingServiceError, match="HTTP 409"):
        await _svc(handler).embed_images(
            EmbedRequest(paths=["/a.jpg"], model_id="other")
        )


@pytest.mark.asyncio
async def test_empty_paths_short_circuits() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={"embeddings": []})

    res = await _svc(handler).embed_images(EmbedRequest(paths=[]))
    assert res.vectors == [] and res.dim == 0
    assert not called  # must not hit the network for an empty batch


@pytest.mark.asyncio
async def test_connection_error_is_service_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with pytest.raises(EmbeddingServiceError, match="unreachable"):
        await _svc(handler).embed_images(EmbedRequest(paths=["/a.jpg"]))


@pytest.mark.asyncio
async def test_non_200_is_service_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "model not loaded"})

    with pytest.raises(EmbeddingServiceError, match="HTTP 503"):
        await _svc(handler).embed_images(EmbedRequest(paths=["/a.jpg"]))


@pytest.mark.asyncio
async def test_mixed_dims_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"embeddings": [[0.1, 0.2], [0.3]]})

    with pytest.raises(EmbeddingServiceError, match="mixed dims"):
        await _svc(handler).embed_images(EmbedRequest(paths=["/a.jpg", "/b.jpg"]))


@pytest.mark.asyncio
async def test_embed_texts_not_implemented() -> None:
    svc = HttpEmbeddingService(base_url="http://test", model_id="m")
    with pytest.raises(NotImplementedError):
        await svc.embed_texts(EmbedTextRequest(texts=["hi"], model_id="x"))
