"""Single-flight claim for auto-retry.

Regression cover for the duplicate-submit root cause behind the stranded
superseded-sibling hole (gen 134026: jobs ...566/...006 submitted 1.18s
apart from two concurrent job:failed handlers). Duplicate job:failed events
are unavoidable when a retry storm leaves abandoned in-flight provider jobs
that emit late terminals; ``_claim_failed_generation_for_retry`` is the
single-flight gate — only the transaction that atomically flips the
generation out of FAILED proceeds to enqueue.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus
from pixsim7.backend.main.event_handlers.auto_retry.manifest import (
    _claim_failed_generation_for_retry,
)


class _Result:
    def __init__(self, rowcount):
        self.rowcount = rowcount


class _FakeDB:
    """Captures the issued statement; serves a scripted rowcount per
    execute() call (models DB serialization of concurrent UPDATEs)."""

    def __init__(self, rowcounts):
        self._rowcounts = list(rowcounts)
        self.statements = []
        self.commits = 0

    async def execute(self, stmt):
        self.statements.append(stmt)
        rc = self._rowcounts.pop(0) if self._rowcounts else 0
        return _Result(rc)

    async def commit(self):
        self.commits += 1


def _sql(stmt) -> str:
    try:
        return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
    except Exception:
        return str(stmt).lower()


@pytest.mark.asyncio
async def test_claim_won_when_one_row_updated():
    db = _FakeDB([1])
    won = await _claim_failed_generation_for_retry(db, 134026)
    assert won is True
    assert db.commits == 1
    sql = _sql(db.statements[0])
    assert "update generations" in sql
    assert "status" in sql  # CAS predicate + SET both reference status


@pytest.mark.asyncio
async def test_claim_lost_when_no_row_matched():
    """A duplicate / stale job:failed: generation already moved out of
    FAILED, so the conditional UPDATE matches nothing."""
    db = _FakeDB([0])
    won = await _claim_failed_generation_for_retry(db, 134026)
    assert won is False
    assert db.commits == 1  # empty transaction is harmless


@pytest.mark.asyncio
async def test_claim_lost_when_rowcount_none():
    db = _FakeDB([None])
    assert await _claim_failed_generation_for_retry(db, 1) is False


@pytest.mark.asyncio
async def test_only_first_of_two_concurrent_handlers_wins():
    """Models the Postgres outcome for two simultaneous handlers: the
    first UPDATE matches the FAILED row, the second (re-evaluated under
    READ COMMITTED after the row is no longer FAILED) matches zero."""
    db = _FakeDB([1, 0])
    first = await _claim_failed_generation_for_retry(db, 134026)
    second = await _claim_failed_generation_for_retry(db, 134026)
    assert (first, second) == (True, False)
    assert db.commits == 2
