"""Unit tests for SignalBackfillService's domain hooks.

The generic state machine is covered by ``test_backfill_run_service``. Here we
lock the signal-specific mapping: probe outcome -> counter deltas, and the
counter rollup onto the run row. ``_process_asset`` is pure (no DB) once given a
probe result, so we stub the probe via the batch ctx.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.assets.signal_backfill import SignalBackfillRun
from pixsim7.backend.main.services.asset.signal_backfill_service import (
    SignalBackfillService,
)

pytestmark = pytest.mark.asyncio


class _FakeSignalService:
    def __init__(self, result):
        self._result = result
        self.calls = []

    async def probe_and_stamp(self, asset, *, force, commit, cohort_baselines, **kw):
        self.calls.append({"force": force, "commit": commit, **kw})
        return self._result


class _RecordingSignalService:
    """Records the (DB-free) probe_raw fan-out and what gets handed back to
    probe_and_stamp, so we can assert the parallel pre-pass wiring."""

    def __init__(self):
        self.probed_ids = []
        self.stamped = []

    def probe_raw(self, asset):
        self.probed_ids.append(asset.id)
        return {"raw_for": asset.id}

    async def probe_and_stamp(self, asset, *, force, commit, cohort_baselines, **kw):
        self.stamped.append({"id": asset.id, **kw})
        return {"suspicious": False}


def _svc() -> SignalBackfillService:
    return SignalBackfillService(db=None)  # hooks under test don't touch db


def _run() -> SignalBackfillRun:
    return SignalBackfillRun(user_id=1, target_scanner_version="v3")


async def test_process_asset_skipped_when_probe_returns_none():
    svc, run = _svc(), _run()
    fake = _FakeSignalService(None)
    out = await svc._process_asset(SimpleNamespace(id=1), run, (fake, {}))
    assert out == {"skipped": 1}
    # always a forced, uncommitted probe (the base owns the commit)
    assert fake.calls == [{"force": True, "commit": False}]


async def test_process_asset_broken_when_suspicious():
    svc, run = _svc(), _run()
    fake = _FakeSignalService({"suspicious": True, "score": 4})
    out = await svc._process_asset(SimpleNamespace(id=1), run, (fake, {}))
    assert out == {"scanned": 1, "broken": 1}


async def test_process_asset_clean_when_not_suspicious():
    svc, run = _svc(), _run()
    fake = _FakeSignalService({"suspicious": False, "score": 0})
    out = await svc._process_asset(SimpleNamespace(id=1), run, (fake, {}))
    assert out == {"scanned": 1}


async def test_prefetch_batch_probes_all_and_process_uses_cache():
    """_prefetch_batch probes every asset (DB-free, off-loop) and caches the
    result; _process_asset then forwards the cached probe as `prefetched`
    instead of re-probing inline."""
    svc, run = _svc(), _run()
    # _prefetch_batch commits to release the read txn before the probe fan-out.
    async def _noop():
        return None
    svc.db = SimpleNamespace(commit=_noop)
    fake = _RecordingSignalService()
    assets = [SimpleNamespace(id=i) for i in (10, 11, 12)]
    ctx = (fake, {})

    await svc._prefetch_batch(assets, run, ctx)
    assert sorted(fake.probed_ids) == [10, 11, 12]
    assert svc._probe_cache == {10: {"raw_for": 10}, 11: {"raw_for": 11}, 12: {"raw_for": 12}}

    out = await svc._process_asset(assets[0], run, ctx)
    assert out == {"scanned": 1}
    # the cached probe is handed back as `prefetched` (no inline re-probe)
    assert fake.stamped == [{"id": 10, "prefetched": {"raw_for": 10}}]


async def test_process_asset_probes_inline_without_prefetch():
    """With no prefetch cache (direct caller / Analysis-style path),
    _process_asset omits `prefetched` so the service probes inline."""
    svc, run = _svc(), _run()
    fake = _FakeSignalService({"suspicious": False})
    out = await svc._process_asset(SimpleNamespace(id=1), run, (fake, {}))
    assert out == {"scanned": 1}
    assert fake.calls == [{"force": True, "commit": False}]  # no `prefetched` key


async def test_apply_outcome_rolls_up_counters():
    svc, run = _svc(), _run()
    svc._apply_outcome(run, {"scanned": 5, "broken": 2, "skipped": 3})
    assert run.scanned_assets == 5
    assert run.broken_assets == 2
    assert run.skipped_assets == 3


async def test_apply_outcome_tolerates_missing_keys():
    svc, run = _svc(), _run()
    svc._apply_outcome(run, {"scanned": 1})
    assert run.scanned_assets == 1
    assert run.broken_assets == 0
    assert run.skipped_assets == 0
