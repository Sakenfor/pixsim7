"""Unit tests for the embedding HTTP service's /health and /embed logic.

Calls the route coroutines directly with a hand-built state so no model load
(and no GPU / model download) happens. Validates: 503 while loading, 200 once
ready, 503 'wedged' when an in-flight request is stuck past the threshold, and
the /embed contract.
"""
from __future__ import annotations

import asyncio
import json
import time

from pixsim7.embedding import server as srv
from pixsim7.embedding.server import EmbedBody


def _fresh_state() -> "srv._ServiceState":
    srv.state = srv._ServiceState()
    return srv.state


def _run(coro):
    return asyncio.run(coro)


def _resp(jsonresponse):
    return jsonresponse.status_code, json.loads(jsonresponse.body)


def test_health_loading() -> None:
    st = _fresh_state()
    st.loaded = False
    code, body = _resp(_run(srv.health()))
    assert code == 503
    assert body["status"] == "loading"


def test_health_ready() -> None:
    st = _fresh_state()
    st.loaded = True
    res = _run(srv.health())  # plain dict on the happy path
    assert res["status"] == "ok"
    assert res["model_loaded"] is True
    # The hosted model is observable so the UI can surface it + warn on mismatch.
    assert res["model_id"] == st.model_id


def test_health_loading_reports_model_id() -> None:
    # model_id is known even before load completes (set from env at construction).
    st = _fresh_state()
    st.loaded = False
    code, body = _resp(_run(srv.health()))
    assert code == 503
    assert body["model_id"] == st.model_id


def test_health_wedged() -> None:
    st = _fresh_state()
    st.loaded = True
    st.in_flight_starts = [time.monotonic() - 10_000]  # ancient in-flight request
    code, body = _resp(_run(srv.health()))
    assert code == 503
    assert body["status"] == "wedged"


def test_health_load_error() -> None:
    st = _fresh_state()
    st.load_error = "boom"
    code, body = _resp(_run(srv.health()))
    assert code == 503
    assert body["status"] == "error"


def test_embed_roundtrip(monkeypatch) -> None:
    st = _fresh_state()
    st.loaded = True
    st.model, st.processor, st.device = "M", "P", "cpu"
    monkeypatch.setattr(srv, "embed_images", lambda m, p, d, paths: [[0.5, 0.6] for _ in paths])

    res = _run(srv.embed(EmbedBody(paths=["/a.jpg", "/b.jpg"])))
    assert res["embeddings"] == [[0.5, 0.6], [0.5, 0.6]]
    assert res["dim"] == 2
    assert res["model_id"] == st.model_id
    # in-flight bookkeeping is cleaned up after the call
    assert st.in_flight == 0


def test_embed_model_match(monkeypatch) -> None:
    # A request whose model_id matches the loaded model is served normally.
    st = _fresh_state()
    st.loaded = True
    st.model, st.processor, st.device = "M", "P", "cpu"
    monkeypatch.setattr(srv, "embed_images", lambda m, p, d, paths: [[0.1] for _ in paths])

    res = _run(srv.embed(EmbedBody(paths=["/a.jpg"], model_id=st.model_id)))
    assert res["embeddings"] == [[0.1]]
    assert res["model_id"] == st.model_id


def test_embed_model_mismatch_rejected() -> None:
    # A request for a model this daemon isn't serving is rejected (409) rather
    # than silently embedded with the wrong model.
    st = _fresh_state()
    st.loaded = True
    code, body = _resp(_run(srv.embed(EmbedBody(paths=["/a.jpg"], model_id="some/other-model"))))
    assert code == 409
    assert body["error"] == "model_not_served"
    assert body["requested_model_id"] == "some/other-model"
    assert body["served_model_id"] == st.model_id


def test_embed_empty() -> None:
    st = _fresh_state()
    st.loaded = True
    res = _run(srv.embed(EmbedBody(paths=[])))
    assert res["embeddings"] == [] and res["dim"] == 0


def test_embed_not_loaded() -> None:
    st = _fresh_state()
    st.loaded = False
    code, body = _resp(_run(srv.embed(EmbedBody(paths=["/a.jpg"]))))
    assert code == 503
