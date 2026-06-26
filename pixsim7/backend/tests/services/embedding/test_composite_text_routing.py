"""Routing + fallback tests for CompositeEmbeddingService.embed_texts.

Local (cmd:*) text models embed via the warm text daemon when one is bound;
hosted models (openai:*) and the daemon-down fallback go through the provider
registry. The registry resolution is monkeypatched so no DB / real provider is
needed.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.adapters.embedding import CompositeEmbeddingService
from pixsim7.embedding.protocol import (
    EmbedResult,
    EmbedTextRequest,
    EmbeddingServiceError,
)


class _FakeDaemon:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.calls = 0

    async def embed_texts(self, request: EmbedTextRequest) -> EmbedResult:
        self.calls += 1
        if self.fail:
            raise EmbeddingServiceError("daemon down")
        return EmbedResult(
            vectors=[[1.0, 2.0] for _ in request.texts],
            dim=2,
            model_id=request.model_id,
        )

    async def embed_images(self, request):  # pragma: no cover - text-only
        raise NotImplementedError

    async def shutdown(self) -> None:
        pass


class _FakeImage:
    async def embed_images(self, request):  # pragma: no cover - unused here
        raise NotImplementedError

    async def shutdown(self) -> None:
        pass


class _FakeProvider:
    """Stand-in for the registry text provider (the subprocess fallback)."""

    default_dimensions = 2

    async def embed_texts(self, *, model_id, texts):
        return [[0.5, 0.5] for _ in texts]


@pytest.fixture
def _registry_provider(monkeypatch):
    monkeypatch.setattr(
        CompositeEmbeddingService,
        "_resolve_text_provider",
        staticmethod(lambda model_id: _FakeProvider()),
    )


@pytest.mark.asyncio
async def test_local_model_routes_to_daemon(_registry_provider) -> None:
    daemon = _FakeDaemon()
    svc = CompositeEmbeddingService(_FakeImage(), text_daemon=daemon)
    res = await svc.embed_texts(
        EmbedTextRequest(texts=["hi"], model_id="cmd:embedding-default")
    )
    assert daemon.calls == 1
    assert res.vectors == [[1.0, 2.0]]  # came from the daemon, not the provider


@pytest.mark.asyncio
async def test_hosted_model_bypasses_daemon(_registry_provider) -> None:
    daemon = _FakeDaemon()
    svc = CompositeEmbeddingService(_FakeImage(), text_daemon=daemon)
    res = await svc.embed_texts(
        EmbedTextRequest(texts=["hi"], model_id="openai:text-embedding-3-small")
    )
    assert daemon.calls == 0  # openai never touches the local text daemon
    assert res.vectors == [[0.5, 0.5]]


@pytest.mark.asyncio
async def test_daemon_down_falls_back_to_provider(_registry_provider) -> None:
    daemon = _FakeDaemon(fail=True)
    svc = CompositeEmbeddingService(_FakeImage(), text_daemon=daemon)
    res = await svc.embed_texts(
        EmbedTextRequest(texts=["hi"], model_id="cmd:embedding-default")
    )
    assert daemon.calls == 1  # attempted...
    assert res.vectors == [[0.5, 0.5]]  # ...then fell back to the subprocess provider


@pytest.mark.asyncio
async def test_no_daemon_uses_provider(_registry_provider) -> None:
    svc = CompositeEmbeddingService(_FakeImage(), text_daemon=None)
    res = await svc.embed_texts(
        EmbedTextRequest(texts=["hi"], model_id="cmd:embedding-default")
    )
    assert res.vectors == [[0.5, 0.5]]
