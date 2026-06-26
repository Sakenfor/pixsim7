"""Unit tests for the text embedding daemon's /embed_texts route.

No real model load: the model fn is monkeypatched and the route coroutine is
called directly (no server / torch / download). The shared /health contract is
covered by test_embedding_daemon_base.
"""
from __future__ import annotations

import json

import pytest

from pixsim7.embedding import text_server as srv
from pixsim7.embedding.text_server import EmbedTextsBody


def _resp(jsonresponse):
    return jsonresponse.status_code, json.loads(jsonresponse.body)


@pytest.fixture(autouse=True)
def _warm_fake_model(monkeypatch):
    """Make the daemon look warm-loaded with a fake (torch-free) model."""
    monkeypatch.setattr(
        srv, "_embed_texts", lambda m, tok, dev, texts: [[0.1, 0.2] for _ in texts]
    )
    srv._loaded = ("model", "tok", "cpu")
    srv.state.ready = True
    srv.state.load_error = None
    srv.inflight.starts = []
    yield
    srv._loaded = None


@pytest.mark.asyncio
async def test_embed_texts_happy() -> None:
    res = await srv.embed_texts(EmbedTextsBody(texts=["a", "b"]))
    assert res["embeddings"] == [[0.1, 0.2], [0.1, 0.2]]
    assert res["dim"] == 2
    assert res["model_id"] == srv.MODEL_ID
    assert srv.inflight.count == 0  # wedge-guard bookkeeping cleaned up


@pytest.mark.asyncio
async def test_embed_texts_empty_short_circuits(monkeypatch) -> None:
    calls = {"n": 0}

    def _counting(*_args):
        calls["n"] += 1
        return []

    monkeypatch.setattr(srv, "_embed_texts", _counting)
    res = await srv.embed_texts(EmbedTextsBody(texts=[]))
    assert res["embeddings"] == [] and res["dim"] == 0
    assert calls["n"] == 0  # must not invoke the model for an empty batch


@pytest.mark.asyncio
async def test_embed_texts_503_while_loading() -> None:
    srv._loaded = None  # warm-up not finished
    code, body = _resp(await srv.embed_texts(EmbedTextsBody(texts=["a"])))
    assert code == 503
    assert body["error"] == "model_loading"


@pytest.mark.asyncio
async def test_embed_texts_503_on_load_error() -> None:
    srv.state.load_error = "weights missing"
    code, body = _resp(await srv.embed_texts(EmbedTextsBody(texts=["a"])))
    assert code == 503
    assert body["error"] == "model_load_failed"
    assert "weights missing" in body["detail"]
