"""Unit tests for the embedding daemon hosted-set sync (c5).

The hosted set is derived from the enabled asset:embedding instances and pushed
to the daemon. These lock in the *shaping* (distinct / sorted / null-filtered
model_ids) and the best-effort contract (a compute failure is swallowed, never
raised) without standing up the provider_instance_configs table.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.services.embedding import daemon_sync

pytestmark = pytest.mark.asyncio


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeScalarsFirst(_FakeScalars):
    def first(self):
        return self._rows[0] if self._rows else None


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalarsFirst(self._rows)


class _FakeDb:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _stmt):
        return _FakeResult(self._rows)


async def test_compute_desired_dedupes_sorts_and_drops_null() -> None:
    db = _FakeDb(["b/model", "a/model", "b/model", None, ""])
    desired = await daemon_sync.compute_desired_embedding_models(db)
    assert desired == ["a/model", "b/model"]


async def test_compute_desired_default_picks_first() -> None:
    # The query is ordered (primary/priority/id) + limit 1, so .first() is the
    # active embedder; None when there's no active instance.
    assert await daemon_sync.compute_desired_default_model(_FakeDb(["m/active"])) == "m/active"
    assert await daemon_sync.compute_desired_default_model(_FakeDb([])) is None


async def test_sync_swallows_compute_error(monkeypatch) -> None:
    async def boom(_db):
        raise RuntimeError("db down")

    monkeypatch.setattr(daemon_sync, "compute_desired_embedding_models", boom)
    # Must not raise; returns False (nothing pushed).
    assert await daemon_sync.sync_embedding_daemon_models(_FakeDb([])) is False


async def test_sync_pushes_computed_set_and_default(monkeypatch) -> None:
    pushed: list[tuple] = []

    async def fake_compute(_db):
        return ["m/a", "m/b"]

    async def fake_default(_db):
        return "m/a"

    async def fake_push(model_ids, default=None):
        pushed.append((model_ids, default))
        return True

    monkeypatch.setattr(daemon_sync, "compute_desired_embedding_models", fake_compute)
    monkeypatch.setattr(daemon_sync, "compute_desired_default_model", fake_default)
    monkeypatch.setattr(daemon_sync, "push_allowed_models", fake_push)

    assert await daemon_sync.sync_embedding_daemon_models(_FakeDb([])) is True
    assert pushed == [(["m/a", "m/b"], "m/a")]


# ── text embedding daemon (single model) ─────────────────────────────────────


async def test_compute_desired_text_model_reads_env(monkeypatch) -> None:
    monkeypatch.setenv(daemon_sync.TEXT_EMBED_MODEL_ENV, "org/custom-text")
    assert daemon_sync.compute_desired_text_embedding_model() == "org/custom-text"
    monkeypatch.delenv(daemon_sync.TEXT_EMBED_MODEL_ENV, raising=False)
    assert (
        daemon_sync.compute_desired_text_embedding_model()
        == daemon_sync._DEFAULT_TEXT_MODEL
    )


async def test_push_text_empty_model_is_false() -> None:
    # Empty model short-circuits to False without attempting a request.
    assert await daemon_sync.push_text_embedding_model("") is False


async def test_sync_text_pushes_computed_model(monkeypatch) -> None:
    pushed: list[str] = []

    async def fake_push(model_id):
        pushed.append(model_id)
        return True

    monkeypatch.setattr(
        daemon_sync, "compute_desired_text_embedding_model", lambda: "org/bge"
    )
    monkeypatch.setattr(daemon_sync, "push_text_embedding_model", fake_push)
    assert await daemon_sync.sync_text_embedding_daemon() is True
    assert pushed == ["org/bge"]
