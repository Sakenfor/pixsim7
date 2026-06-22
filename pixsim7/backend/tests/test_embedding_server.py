"""Unit tests for the embedding HTTP service's /health and /embed logic.

Calls the route coroutines directly with a hand-built registry so no real model
load (and no GPU / model download) happens — `load_model`/`embed_images` are
monkeypatched. Validates: 503 while the default loads / errored, 200 once ready,
503 'wedged' on a stuck in-flight request, default-model selection, allowed-set
rejection (409), and lazy-load + LRU eviction with the default pinned.
"""
from __future__ import annotations

import json
import time

import pytest

from pixsim7.embedding import server as srv
from pixsim7.embedding.server import EmbedBody


def _install_registry(monkeypatch, *, default="m/default", allowed=None, capacity=2):
    """Swap in a fresh registry whose loads are fake (no torch). Returns
    (registry, loads) where `loads` counts load_model calls per model_id."""
    allowed_set = set(allowed) if allowed is not None else {default}
    allowed_set.add(default)
    loads: dict[str, int] = {}

    def fake_load(model_id):
        loads[model_id] = loads.get(model_id, 0) + 1
        return (f"model:{model_id}", "proc", "cpu")

    monkeypatch.setattr(srv, "load_model", fake_load)
    monkeypatch.setattr(
        srv, "embed_images", lambda m, p, d, paths: [[0.5, 0.6] for _ in paths]
    )
    reg = srv._ModelRegistry(
        default_model_id=default, allowed=allowed_set, capacity=capacity
    )
    srv.registry = reg
    srv.inflight = srv._InFlight()
    return reg, loads


def _resp(jsonresponse):
    return jsonresponse.status_code, json.loads(jsonresponse.body)


# ── /health ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_loading(monkeypatch) -> None:
    reg, _ = _install_registry(monkeypatch)
    code, body = _resp(await srv.health())
    assert code == 503
    assert body["status"] == "loading"
    # Hosted set is observable even before the default finishes loading.
    assert body["model_id"] == reg.default_model_id
    assert reg.default_model_id in body["model_ids"]


@pytest.mark.asyncio
async def test_health_ready(monkeypatch) -> None:
    reg, _ = _install_registry(monkeypatch)
    await reg.ensure_default()
    res = await srv.health()  # plain dict on the happy path
    assert res["status"] == "ok"
    assert res["model_loaded"] is True
    assert res["model_id"] == reg.default_model_id
    assert reg.default_model_id in res["loaded_model_ids"]


@pytest.mark.asyncio
async def test_health_wedged(monkeypatch) -> None:
    reg, _ = _install_registry(monkeypatch)
    await reg.ensure_default()
    srv.inflight.starts = [time.monotonic() - 10_000]  # ancient in-flight request
    code, body = _resp(await srv.health())
    assert code == 503
    assert body["status"] == "wedged"


@pytest.mark.asyncio
async def test_health_load_error(monkeypatch) -> None:
    reg, _ = _install_registry(monkeypatch)

    def boom(_model_id):
        raise RuntimeError("boom")

    monkeypatch.setattr(srv, "load_model", boom)
    await reg.ensure_default()
    code, body = _resp(await srv.health())
    assert code == 503
    assert body["status"] == "error"
    assert "boom" in body["error"]


# ── /embed ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_embed_default_model(monkeypatch) -> None:
    # model_id omitted -> the default model.
    reg, _ = _install_registry(monkeypatch)
    res = await srv.embed(EmbedBody(paths=["/a.jpg", "/b.jpg"]))
    assert res["embeddings"] == [[0.5, 0.6], [0.5, 0.6]]
    assert res["dim"] == 2
    assert res["model_id"] == reg.default_model_id
    assert srv.inflight.count == 0  # bookkeeping cleaned up


@pytest.mark.asyncio
async def test_embed_explicit_allowed_model(monkeypatch) -> None:
    # A model in the allowed set is lazily loaded and served.
    reg, loads = _install_registry(
        monkeypatch, default="m/default", allowed={"m/default", "m/fashion"}
    )
    res = await srv.embed(EmbedBody(paths=["/a.jpg"], model_id="m/fashion"))
    assert res["model_id"] == "m/fashion"
    assert loads["m/fashion"] == 1
    assert "m/fashion" in reg.loaded_model_ids


@pytest.mark.asyncio
async def test_embed_model_not_served_rejected(monkeypatch) -> None:
    # A model outside the allowed set is rejected (409), not silently embedded.
    reg, _ = _install_registry(
        monkeypatch, default="m/default", allowed={"m/default", "m/fashion"}
    )
    code, body = _resp(await srv.embed(EmbedBody(paths=["/a.jpg"], model_id="m/nope")))
    assert code == 409
    assert body["error"] == "model_not_served"
    assert body["requested_model_id"] == "m/nope"
    assert body["served_model_ids"] == ["m/default", "m/fashion"]


@pytest.mark.asyncio
async def test_embed_empty_paths_no_load(monkeypatch) -> None:
    reg, loads = _install_registry(monkeypatch)
    res = await srv.embed(EmbedBody(paths=[]))
    assert res["embeddings"] == [] and res["dim"] == 0
    assert res["model_id"] == reg.default_model_id
    assert loads == {}  # short-circuit must not load anything


@pytest.mark.asyncio
async def test_embed_model_load_failure_is_503(monkeypatch) -> None:
    # A model in the allowed set that fails to load -> 503 (graceful retry),
    # not a 500.
    reg, _ = _install_registry(
        monkeypatch, default="m/default", allowed={"m/default", "m/bad"}
    )

    def selective_load(model_id):
        if model_id == "m/bad":
            raise RuntimeError("weights missing")
        return (f"model:{model_id}", "proc", "cpu")

    monkeypatch.setattr(srv, "load_model", selective_load)
    code, body = _resp(await srv.embed(EmbedBody(paths=["/a.jpg"], model_id="m/bad")))
    assert code == 503
    assert body["error"] == "model_load_failed"
    assert body["model_id"] == "m/bad"


# ── registry: lazy-load + LRU eviction (default pinned) ──────────────────


@pytest.mark.asyncio
async def test_lru_evicts_non_default(monkeypatch) -> None:
    reg, loads = _install_registry(
        monkeypatch,
        default="m/default",
        allowed={"m/default", "m/a", "m/b"},
        capacity=2,
    )
    await reg.ensure_default()                      # resident: [default]
    await reg.acquire("m/a")                         # resident: [default, a]
    await reg.acquire("m/b")                         # over capacity -> evict a
    assert reg.loaded_model_ids == ["m/default", "m/b"]

    # 'a' was evicted, so using it again reloads (load count goes 1 -> 2).
    await reg.acquire("m/a")
    assert loads["m/a"] == 2
    # The default is pinned: never evicted despite being the oldest entry.
    assert "m/default" in reg.loaded_model_ids


@pytest.mark.asyncio
async def test_default_pinned_even_when_oldest(monkeypatch) -> None:
    # default loaded first (oldest); a pure-LRU policy would evict it, but it's
    # pinned, so the non-default victim is chosen instead.
    reg, _ = _install_registry(
        monkeypatch, default="m/default", allowed={"m/default", "m/a", "m/b"}, capacity=2
    )
    await reg.ensure_default()
    await reg.acquire("m/a")
    await reg.acquire("m/b")
    assert "m/default" in reg.loaded_model_ids
    assert "m/a" not in reg.loaded_model_ids


@pytest.mark.asyncio
async def test_concurrent_first_request_loads_once(monkeypatch) -> None:
    import asyncio

    reg, loads = _install_registry(
        monkeypatch, default="m/default", allowed={"m/default", "m/a"}
    )
    # Two concurrent acquires for the same cold model must de-dupe to one load.
    await asyncio.gather(reg.acquire("m/a"), reg.acquire("m/a"))
    assert loads["m/a"] == 1


# ── auto-derived hosted set (backend push) ───────────────────────────────


@pytest.mark.asyncio
async def test_set_allowed_unions_baseline_and_default(monkeypatch) -> None:
    # The pushed set unions with the env baseline; the default is always kept.
    reg, _ = _install_registry(
        monkeypatch, default="m/default", allowed={"m/default", "m/env"}
    )
    reg.set_allowed(["m/a", "m/b"])
    assert reg.allowed == {"m/default", "m/env", "m/a", "m/b"}

    # A subsequent push replaces the derived portion but keeps baseline+default.
    reg.set_allowed(["m/c"])
    assert reg.allowed == {"m/default", "m/env", "m/c"}
    # Empty strings are ignored.
    reg.set_allowed(["", "m/d"])
    assert reg.allowed == {"m/default", "m/env", "m/d"}


@pytest.mark.asyncio
async def test_set_allowed_models_route(monkeypatch) -> None:
    reg, _ = _install_registry(monkeypatch, default="m/default")
    from pixsim7.embedding.server import AllowedModelsBody

    res = await srv.set_allowed_models(AllowedModelsBody(model_ids=["m/fashion"]))
    assert res["default"] == "m/default"
    assert set(res["allowed"]) == {"m/default", "m/fashion"}
    assert reg.is_allowed("m/fashion")
