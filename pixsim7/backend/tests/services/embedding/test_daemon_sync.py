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


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeDb:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _stmt):
        return _FakeResult(self._rows)


async def test_compute_desired_dedupes_sorts_and_drops_null() -> None:
    db = _FakeDb(["b/model", "a/model", "b/model", None, ""])
    desired = await daemon_sync.compute_desired_embedding_models(db)
    assert desired == ["a/model", "b/model"]


async def test_sync_swallows_compute_error(monkeypatch) -> None:
    async def boom(_db):
        raise RuntimeError("db down")

    monkeypatch.setattr(daemon_sync, "compute_desired_embedding_models", boom)
    # Must not raise; returns False (nothing pushed).
    assert await daemon_sync.sync_embedding_daemon_models(_FakeDb([])) is False


async def test_sync_pushes_computed_set(monkeypatch) -> None:
    pushed: list[list[str]] = []

    async def fake_compute(_db):
        return ["m/a", "m/b"]

    async def fake_push(model_ids):
        pushed.append(model_ids)
        return True

    monkeypatch.setattr(daemon_sync, "compute_desired_embedding_models", fake_compute)
    monkeypatch.setattr(daemon_sync, "push_allowed_models", fake_push)

    assert await daemon_sync.sync_embedding_daemon_models(_FakeDb([])) is True
    assert pushed == [["m/a", "m/b"]]
