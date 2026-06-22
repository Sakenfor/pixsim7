"""Unit test for AnalysisBackfillService.outcome_breakdowns (detective rollup).

Analysis backfills are fire-and-enqueue: a run reports COMPLETED once analyses
are *created*, but they execute later and can fail (e.g. embed-time 409
model_not_served). `outcome_breakdowns` reconciles the real per-analysis status
counts so the UI can show them after the fact.

The grouped query itself is SQLAlchemy's job; this locks in the *shaping* —
enum status -> string key, runs with no rows mapping to an empty dict, and the
empty-input short-circuit — without standing up the FK-heavy asset_analyses
table (mirrors the fake-DB approach in test_backfill_run_service).
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.domain.assets.analysis import AnalysisStatus
from pixsim7.backend.main.services.analysis.analysis_backfill_service import (
    AnalysisBackfillService,
)

pytestmark = pytest.mark.asyncio


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeDb:
    def __init__(self, rows):
        self._rows = rows
        self.execute_calls = 0

    async def execute(self, _stmt):
        self.execute_calls += 1
        return _FakeResult(self._rows)


async def test_outcome_breakdowns_shapes_grouped_rows() -> None:
    rows = [
        (1, AnalysisStatus.COMPLETED, 3),
        (1, AnalysisStatus.FAILED, 2),
        (2, AnalysisStatus.PENDING, 5),
    ]
    svc = AnalysisBackfillService(_FakeDb(rows))

    out = await svc.outcome_breakdowns([1, 2, 3])

    assert out[1] == {"completed": 3, "failed": 2}
    assert out[2] == {"pending": 5}
    assert out[3] == {}  # a run with no created analyses maps to an empty dict


async def test_outcome_breakdowns_empty_runids_short_circuits() -> None:
    db = _FakeDb([])
    svc = AnalysisBackfillService(db)

    assert await svc.outcome_breakdowns([]) == {}
    assert db.execute_calls == 0  # no query for an empty run list
