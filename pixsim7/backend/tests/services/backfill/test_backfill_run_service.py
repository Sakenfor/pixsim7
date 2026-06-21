"""Regression gate for the shared durable-backfill state machine.

``BackfillRunServiceBase`` was extracted from ``AnalysisBackfillService`` so the
analysis and signal-scan backfills share one lifecycle. These tests lock in the
generic behavior — PENDING->RUNNING->COMPLETED, cursor advance, counter rollup,
self re-enqueue, pause/cancel short-circuits, per-asset failure isolation —
without standing up the FK-heavy ``Asset`` table: the DB and asset-batch hooks
are faked so the test exercises only the extracted control flow.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from pixsim7.backend.main.domain.assets.backfill import (
    TERMINAL_BACKFILL_STATUSES,
    BackfillStatus,
)
from pixsim7.backend.main.services.backfill import BackfillRunServiceBase

pytestmark = pytest.mark.asyncio


@dataclass
class FakeRun:
    id: int = 1
    user_id: int = 1
    status: BackfillStatus = BackfillStatus.PENDING
    cursor_asset_id: int = 0
    batch_size: int = 2
    total_assets: int = 0
    processed_assets: int = 0
    failed_assets: int = 0
    scanned: int = 0
    broken: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_error: Optional[str] = None

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_BACKFILL_STATUSES

    def to_progress_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "run_id": self.id,
            "processed_assets": self.processed_assets,
            "scanned": self.scanned,
            "broken": self.broken,
            "failed_assets": self.failed_assets,
            "cursor_asset_id": self.cursor_asset_id,
        }


class FakeDb:
    """Minimal AsyncSession stand-in for the calls the base makes."""

    def __init__(self, run: FakeRun):
        self._run = run

    async def get(self, model, run_id):
        return self._run if run_id == self._run.id else None

    async def commit(self):  # noqa: D401
        pass

    async def refresh(self, obj):
        pass

    async def rollback(self):
        pass

    def add(self, obj):
        pass


class FakeBackfillService(BackfillRunServiceBase[FakeRun]):
    run_model = FakeRun
    enqueue_job_name = "run_fake_backfill_batch"
    log_prefix = "fake_backfill"

    def __init__(self, db: FakeDb, run: FakeRun, all_ids: List[int], fail_ids=()):
        super().__init__(db)
        self._run = run
        self._all = sorted(all_ids)
        self._fail = set(fail_ids)
        self.enqueued: List[int] = []
        self.processed_ids: List[int] = []

    async def _enqueue_batch(self, run_id: int) -> None:
        self.enqueued.append(run_id)  # avoid touching redis

    async def _load_batch(self, run: FakeRun) -> List[Any]:
        ids = [i for i in self._all if i > run.cursor_asset_id][: run.batch_size]
        return [SimpleNamespace(id=i) for i in ids]

    async def _has_more(self, run: FakeRun, cursor_asset_id: int) -> bool:
        return any(i > cursor_asset_id for i in self._all)

    async def _process_asset(self, asset, run: FakeRun, ctx) -> Dict[str, int]:
        if asset.id in self._fail:
            raise RuntimeError(f"boom {asset.id}")
        self.processed_ids.append(asset.id)
        return {"scanned": 1, "broken": 1 if asset.id % 2 == 0 else 0}

    def _apply_outcome(self, run: FakeRun, totals: Dict[str, int]) -> None:
        run.scanned += totals.get("scanned", 0)
        run.broken += totals.get("broken", 0)


async def _drain(svc: FakeBackfillService, run: FakeRun, max_iters: int = 50) -> int:
    """Drive batches until the run terminates (the worker would self-re-enqueue)."""
    iters = 0
    while not run.is_terminal and iters < max_iters:
        await svc.process_run_batch(run.id)
        iters += 1
    return iters


async def test_drains_to_completion_advancing_cursor_and_counters():
    run = FakeRun(batch_size=2)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1, 2, 3, 4, 5])

    await _drain(svc, run)

    assert run.status == BackfillStatus.COMPLETED
    assert run.cursor_asset_id == 5
    assert run.processed_assets == 5
    assert run.scanned == 5
    assert run.broken == 2  # evens: 2, 4
    assert run.failed_assets == 0
    assert run.completed_at is not None
    assert svc.processed_ids == [1, 2, 3, 4, 5]


async def test_first_batch_transitions_pending_to_running_and_reenqueues():
    run = FakeRun(batch_size=2)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1, 2, 3, 4, 5])

    await svc.process_run_batch(run.id)

    assert run.status == BackfillStatus.RUNNING
    assert run.cursor_asset_id == 2
    assert run.processed_assets == 2
    assert svc.enqueued == [run.id]  # more work remains -> self re-enqueue


async def test_empty_scope_completes_immediately():
    run = FakeRun()
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[])

    await svc.process_run_batch(run.id)

    assert run.status == BackfillStatus.COMPLETED
    assert run.processed_assets == 0
    assert svc.enqueued == []


async def test_failed_asset_is_counted_and_batch_continues():
    run = FakeRun(batch_size=2)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1, 2, 3, 4], fail_ids={3})

    await _drain(svc, run)

    assert run.status == BackfillStatus.COMPLETED
    assert run.processed_assets == 4  # counted regardless of per-asset failure
    assert run.failed_assets == 1
    assert run.scanned == 3  # 1, 2, 4 succeeded
    assert run.last_error is not None
    assert 3 not in svc.processed_ids


async def test_paused_run_short_circuits():
    run = FakeRun(status=BackfillStatus.PAUSED)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1, 2, 3])

    await svc.process_run_batch(run.id)

    assert run.status == BackfillStatus.PAUSED
    assert run.processed_assets == 0
    assert svc.processed_ids == []


async def test_cancel_then_batch_is_noop():
    run = FakeRun(status=BackfillStatus.RUNNING)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1, 2, 3])
    user = SimpleNamespace(id=run.user_id)

    await svc.cancel_run(run_id=run.id, user=user)
    assert run.status == BackfillStatus.CANCELLED
    assert run.completed_at is not None

    await svc.process_run_batch(run.id)
    assert run.processed_assets == 0


async def test_resume_paused_run_reenqueues():
    run = FakeRun(status=BackfillStatus.PAUSED, last_error="prior")
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1, 2])
    user = SimpleNamespace(id=run.user_id)

    await svc.resume_run(run_id=run.id, user=user)

    assert run.status == BackfillStatus.PENDING
    assert run.last_error is None
    assert svc.enqueued == [run.id]


async def test_pause_rejects_terminal_run():
    run = FakeRun(status=BackfillStatus.COMPLETED)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1])
    user = SimpleNamespace(id=run.user_id)

    with pytest.raises(Exception):
        await svc.pause_run(run_id=run.id, user=user)


async def test_get_run_for_user_rejects_other_user():
    run = FakeRun(user_id=1)
    svc = FakeBackfillService(FakeDb(run), run, all_ids=[1])

    with pytest.raises(Exception):
        await svc.get_run_for_user(run_id=run.id, user_id=999)
