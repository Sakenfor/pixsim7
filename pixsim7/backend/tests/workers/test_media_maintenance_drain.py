"""Characterization tests for the redis-backed durable-drain jobs.

``relocation_processor`` and ``restore_processor`` were near-identical twins; the
shared drain loop now lives in ``workers/redis_drain_job.py`` and each module is a
thin spec + wrapper. These tests pin the behaviour through the PUBLIC arq task
functions (``process_relocation`` / ``process_restore`` and the control surface),
so they hold across the extraction — they were written against the pre-refactor
twins and must stay green after.

The drain's I/O boundaries (redis, db session, arq pool, storage, the per-asset
op) are monkeypatched at their source modules, so we exercise the orchestration
(cursor advance, completion, cancel, per-asset failure isolation, max_assets,
time-budget re-enqueue, orphan reconcile) without infra.
"""
from __future__ import annotations

import collections
import json
import time
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.workers import relocation_processor as reloc
from pixsim7.backend.main.workers import restore_processor as restore

pytestmark = pytest.mark.asyncio


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value

    async def delete(self, key):
        self.store.pop(key, None)


class _FakeScalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _FakeResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _FakeScalars(self._values)


class _FakeSession:
    """One ``async with get_async_session()`` scope; pages come from a shared deque."""

    def __init__(self, pages: collections.deque, assets: dict):
        self._pages = pages
        self._assets = assets
        self.rolled_back = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, _query):
        page = self._pages.popleft() if self._pages else []
        return _FakeResult([SimpleNamespace(id=i) for i in page])

    async def get(self, _model, aid):
        return self._assets.get(aid, SimpleNamespace(id=aid))

    async def rollback(self):
        self.rolled_back += 1


class _FakeArqPool:
    def __init__(self):
        self.calls: list[dict] = []

    async def enqueue_job(self, name, **kwargs):
        self.calls.append({"name": name, **kwargs})


def _clock(values):
    seq = list(values)

    def _now():
        return seq.pop(0) if len(seq) > 1 else seq[0]

    return _now


def _patch_common(monkeypatch, mod, *, pages, op_name, op_fn, assets=None):
    """Wire the shared infra deps a drain task lazily imports.

    ``mod`` is the processor module (reloc/restore); ``op_name`` is the per-asset
    op symbol it imports from services.storage.relocation.
    """
    redis = _FakeRedis()
    pool = _FakeArqPool()
    dq = collections.deque(pages)
    assets = assets or {}

    from pixsim7.backend.main.infrastructure.redis import client as redis_client
    from pixsim7.backend.main.infrastructure.database import session as db_session
    from pixsim7.backend.main.services.storage import storage_service as storage_mod
    from pixsim7.backend.main.services.storage import placement as placement_mod
    from pixsim7.backend.main.services.storage import relocation as relocation_mod

    async def _get_redis():
        return redis

    async def _get_arq_pool():
        return pool

    def _get_session():
        return _FakeSession(dq, assets)

    monkeypatch.setattr(redis_client, "get_redis", _get_redis)
    monkeypatch.setattr(redis_client, "get_arq_pool", _get_arq_pool)
    monkeypatch.setattr(db_session, "get_async_session", _get_session)
    monkeypatch.setattr(storage_mod, "get_storage_service", lambda: object())
    monkeypatch.setattr(placement_mod, "archive_configured", lambda: True)
    monkeypatch.setattr(relocation_mod, op_name, op_fn)
    return redis, pool


# --------------------------------------------------------------------------- #
# Relocation
# --------------------------------------------------------------------------- #
async def test_relocation_drains_to_completion(monkeypatch):
    calls = []

    async def fake_relocate_one(db, storage, asset, **kw):
        calls.append(asset.id)
        return {"status": "moved", "freed_bytes": 10} if asset.id % 2 else {"status": "skipped", "reason": "local_missing"}

    redis, pool = _patch_common(
        monkeypatch, reloc,
        pages=[[1, 2, 3], [4, 5], []],  # two real pages then drained
        op_name="relocate_one", op_fn=fake_relocate_one,
    )

    out = await reloc.process_relocation(ctx={}, job_id="j1", criteria={}, apply=True)

    assert out["status"] == "completed"
    assert out["processed"] == 5
    assert out["cursor"] == 5  # advanced past every id
    assert out["moved"] == 3 and out["skipped"] == 2
    assert out["skipped_reasons"] == {"local_missing": 2}
    assert calls == [1, 2, 3, 4, 5]
    assert pool.calls == []  # no re-enqueue under the time budget
    # progress persisted under the job key
    assert json.loads(redis.store[reloc.relocation_progress_key("j1")])["status"] == "completed"


async def test_relocation_cancel_short_circuits(monkeypatch):
    redis, pool = _patch_common(
        monkeypatch, reloc,
        pages=[[1, 2, 3]], op_name="relocate_one",
        op_fn=lambda *a, **k: {"status": "moved"},
    )
    await redis.set(reloc.relocation_cancel_key("j1"), "1")

    out = await reloc.process_relocation(ctx={}, job_id="j1", criteria={}, apply=True)

    assert out["status"] == "cancelled"
    assert out["processed"] == 0


async def test_relocation_per_asset_failure_isolated(monkeypatch):
    async def fake_relocate_one(db, storage, asset, **kw):
        if asset.id == 2:
            raise RuntimeError("boom")
        return {"status": "moved", "freed_bytes": 1}

    redis, pool = _patch_common(
        monkeypatch, reloc,
        pages=[[1, 2, 3], []], op_name="relocate_one", op_fn=fake_relocate_one,
    )

    out = await reloc.process_relocation(ctx={}, job_id="j1", criteria={}, apply=True)

    assert out["status"] == "completed"
    assert out["processed"] == 3  # the failure didn't stop the drain
    assert out["errors"] == 1 and out["error_ids"] == [2]
    assert out["moved"] == 2
    assert out["cursor"] == 3


async def test_relocation_max_assets_stops_early(monkeypatch):
    redis, pool = _patch_common(
        monkeypatch, reloc,
        pages=[[1, 2, 3]], op_name="relocate_one",
        op_fn=lambda *a, **k: {"status": "moved"},
    )

    out = await reloc.process_relocation(ctx={}, job_id="j1", criteria={}, apply=True, max_assets=2)

    assert out["status"] == "completed"
    assert out["processed"] == 2
    assert out["cursor"] == 2


async def test_relocation_time_budget_reenqueues(monkeypatch):
    # started=0, then a huge clock value after the first page trips the budget.
    monkeypatch.setattr(time, "monotonic", _clock([0, 10**9]))
    redis, pool = _patch_common(
        monkeypatch, reloc,
        pages=[[1, 2], [3, 4], []], op_name="relocate_one",
        op_fn=lambda *a, **k: {"status": "moved"},
    )

    out = await reloc.process_relocation(ctx={}, job_id="j1", criteria={}, apply=True)

    assert out["status"] == "continued"
    assert out["cursor"] == 2  # only the first page processed before spilling
    assert len(pool.calls) == 1
    call = pool.calls[0]
    assert call["name"] == "process_relocation"
    assert call["cursor"] == 2
    assert call["_queue_name"] == "arq:queue:media-maintenance"
    assert call["stats"]["processed"] == 2


async def test_reconcile_orphaned_relocation_marks_interrupted(monkeypatch):
    redis, _ = _patch_common(
        monkeypatch, reloc, pages=[[]], op_name="relocate_one",
        op_fn=lambda *a, **k: {"status": "moved"},
    )
    await redis.set(reloc.RELOCATION_LATEST_KEY, "j9")
    await redis.set(
        reloc.relocation_progress_key("j9"),
        json.dumps({"job_id": "j9", "status": "running", "processed": 7}),
    )

    retired = await reloc.reconcile_orphaned_relocation_job()

    assert retired == "j9"
    assert json.loads(redis.store[reloc.relocation_progress_key("j9")])["status"] == "interrupted"


async def test_reconcile_orphaned_relocation_leaves_terminal(monkeypatch):
    redis, _ = _patch_common(
        monkeypatch, reloc, pages=[[]], op_name="relocate_one",
        op_fn=lambda *a, **k: {"status": "moved"},
    )
    await redis.set(reloc.RELOCATION_LATEST_KEY, "j9")
    await redis.set(
        reloc.relocation_progress_key("j9"),
        json.dumps({"job_id": "j9", "status": "completed"}),
    )

    assert await reloc.reconcile_orphaned_relocation_job() is None


# --------------------------------------------------------------------------- #
# Restore — the twin, plus its delete_archive passthrough
# --------------------------------------------------------------------------- #
async def test_restore_drains_and_tallies_restored(monkeypatch):
    async def fake_restore_one(db, storage, asset, **kw):
        return {"status": "restored", "restored_bytes": 5}

    redis, pool = _patch_common(
        monkeypatch, restore,
        pages=[[1, 2], []], op_name="restore_one", op_fn=fake_restore_one,
    )

    out = await restore.process_restore(ctx={}, job_id="r1", criteria={}, apply=True)

    assert out["status"] == "completed"
    assert out["processed"] == 2 and out["restored"] == 2
    assert out["restored_bytes"] == 10


async def test_restore_passes_delete_archive_through(monkeypatch):
    seen = {}

    async def fake_restore_one(db, storage, asset, **kw):
        seen.update(kw)
        return {"status": "restored", "restored_bytes": 1}

    monkeypatch.setattr(time, "monotonic", _clock([0, 10**9]))
    redis, pool = _patch_common(
        monkeypatch, restore,
        pages=[[1], [2], []], op_name="restore_one", op_fn=fake_restore_one,
    )

    out = await restore.process_restore(
        ctx={}, job_id="r1", criteria={}, apply=True, delete_archive=True,
    )

    # per-asset op receives the flag...
    assert seen.get("delete_archive") is True
    # ...and the time-budget re-enqueue carries it onward.
    assert out["status"] == "continued"
    assert pool.calls[0]["name"] == "process_restore"
    assert pool.calls[0]["delete_archive"] is True
    assert pool.calls[0]["_queue_name"] == "arq:queue:media-maintenance"
