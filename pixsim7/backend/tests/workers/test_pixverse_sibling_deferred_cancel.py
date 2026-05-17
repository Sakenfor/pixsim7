"""Deferred-cancel-grace coverage for the superseded-sibling salvage.

The terminal-status finalize site is covered by the recovery-module unit
tests; this file covers the *other* pixverse-image finalize chokepoint —
``_maybe_finalize_deferred_cancel`` — and the shared
``_maybe_recover_pixverse_image_sibling`` gate. The documented
post-cancel-render hole (commit 0781dafdb) bites exactly at the grace
cutoff: a pixverse image job (tracked or a burst sibling) can render after
the cancel, and the grace timer would otherwise finalize CANCELLED before
the forward salvage delivers it.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus
from pixsim7.backend.main.shared.operation_mapping import get_image_operations
from pixsim7.backend.main.workers import status_poller as sp
from pixsim7.backend.main.services.provider.pixverse_image_recovery import (
    RearmStatus,
)

_IMAGE_OP = next(iter(get_image_operations()))


class _Result:
    def first(self):
        return None  # no provider-job row → has_provider_job stays False


class _FakeDB:
    def __init__(self, gen_model):
        self._gen_model = gen_model
        self.commits = 0

    async def get(self, _model, _ident):
        return self._gen_model

    async def execute(self, _stmt):
        return _Result()

    async def commit(self):
        self.commits += 1


class _Recorder:
    def __init__(self):
        self.calls = []

    async def update_status(self, gen_id, status):
        self.calls.append(("update_status", gen_id, status))

    async def release_account(self, account_id):
        self.calls.append(("release_account", account_id))


# --------------------------------------------------------------------------
# _maybe_recover_pixverse_image_sibling — the shared gate
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_helper_skips_non_pixverse(monkeypatch):
    async def _boom(*_a, **_k):
        raise AssertionError("sweep must not run for a non-pixverse provider")

    monkeypatch.setattr(sp, "sweep_and_rearm_sibling", _boom)
    out = await sp._maybe_recover_pixverse_image_sibling(
        object(), generation_id=1, operation_type=_IMAGE_OP,
        provider_id="fal", selected_submission_id=None,
    )
    assert out is False


@pytest.mark.asyncio
async def test_helper_skips_non_image(monkeypatch):
    async def _boom(*_a, **_k):
        raise AssertionError("sweep must not run for a non-image operation")

    monkeypatch.setattr(sp, "sweep_and_rearm_sibling", _boom)
    out = await sp._maybe_recover_pixverse_image_sibling(
        object(), generation_id=1, operation_type="text_to_video",
        provider_id="pixverse", selected_submission_id=None,
    )
    assert out is False


@pytest.mark.asyncio
async def test_helper_delegates_and_reports_rearm(monkeypatch):
    async def _sweep(_db, *, generation_id, selected_submission_id):
        assert generation_id == 134026
        assert selected_submission_id is None
        return RearmStatus.REARMED_ISOLATED_SIBLING

    monkeypatch.setattr(sp, "sweep_and_rearm_sibling", _sweep)
    out = await sp._maybe_recover_pixverse_image_sibling(
        object(), generation_id=134026, operation_type=_IMAGE_OP,
        provider_id="pixverse", selected_submission_id=None,
    )
    assert out is True


@pytest.mark.asyncio
async def test_helper_swallows_probe_failure(monkeypatch):
    async def _raise(*_a, **_k):
        raise RuntimeError("CDN timeout")

    monkeypatch.setattr(sp, "sweep_and_rearm_sibling", _raise)
    out = await sp._maybe_recover_pixverse_image_sibling(
        object(), generation_id=1, operation_type=_IMAGE_OP,
        provider_id="pixverse", selected_submission_id=7,
    )
    assert out is False  # defensive: a transient failure never blocks finalize


# --------------------------------------------------------------------------
# _maybe_finalize_deferred_cancel — the grace-cutoff chokepoint
# --------------------------------------------------------------------------


def _gen_and_model():
    long_ago = datetime.now(timezone.utc) - timedelta(seconds=100_000)
    gen = SimpleNamespace(
        id=134026, deferred_action="cancel", operation_type=_IMAGE_OP
    )
    model = SimpleNamespace(
        id=134026,
        deferred_action="cancel",
        cancel_requested_at=long_ago,  # elapsed >> any grace -> at the cutoff
        provider_id="pixverse",
        operation_type=_IMAGE_OP,
    )
    return gen, model


@pytest.mark.asyncio
async def test_deferred_cancel_recovered_sibling_skips_finalize(monkeypatch):
    gen, model = _gen_and_model()
    db = _FakeDB(model)
    rec = _Recorder()

    async def _recovered(*_a, **_k):
        return True

    monkeypatch.setattr(sp, "_maybe_recover_pixverse_image_sibling", _recovered)

    out = await sp._maybe_finalize_deferred_cancel(
        db,
        generation=gen,
        account=SimpleNamespace(id=2),
        generation_service=rec,
        account_service=rec,
    )

    assert out is False  # cancel NOT finalized — keep polling
    assert rec.calls == []  # no CANCELLED status, no account release
    assert model.deferred_action == "cancel"  # left intact for the rearmed gen


@pytest.mark.asyncio
async def test_deferred_cancel_finalizes_when_nothing_recoverable(monkeypatch):
    gen, model = _gen_and_model()
    db = _FakeDB(model)
    rec = _Recorder()

    async def _not_recovered(*_a, **_k):
        return False

    monkeypatch.setattr(sp, "_maybe_recover_pixverse_image_sibling", _not_recovered)

    out = await sp._maybe_finalize_deferred_cancel(
        db,
        generation=gen,
        account=SimpleNamespace(id=2),
        generation_service=rec,
        account_service=rec,
    )

    assert out is True  # cancel finalized as before
    assert model.deferred_action is None
    assert ("release_account", 2) in rec.calls
    assert ("update_status", 134026, GenerationStatus.CANCELLED) in rec.calls


@pytest.mark.asyncio
async def test_deferred_cancel_noop_when_no_cancel_pending(monkeypatch):
    gen = SimpleNamespace(id=1, deferred_action=None, operation_type=_IMAGE_OP)

    async def _boom(*_a, **_k):
        raise AssertionError("recovery must not run when no cancel is pending")

    monkeypatch.setattr(sp, "_maybe_recover_pixverse_image_sibling", _boom)
    out = await sp._maybe_finalize_deferred_cancel(
        _FakeDB(None),
        generation=gen,
        account=SimpleNamespace(id=2),
        generation_service=_Recorder(),
        account_service=_Recorder(),
    )
    assert out is False


# --------------------------------------------------------------------------
# _handle_no_submission_case — the cancel-before-submission chokepoint
# --------------------------------------------------------------------------


def _no_sub_gen_and_model():
    gen = SimpleNamespace(
        id=134026,
        deferred_action="cancel",
        operation_type=_IMAGE_OP,
        provider_id="pixverse",
        account_id=None,  # skip the orphan-counter branch
        started_at=datetime.now(timezone.utc),
    )
    model = SimpleNamespace(deferred_action="cancel")
    return gen, model


@pytest.mark.asyncio
async def test_cancel_before_submission_recovered_sibling_skips_finalize(monkeypatch):
    gen, model = _no_sub_gen_and_model()
    rec = _Recorder()

    async def _recovered(*_a, **_k):
        return True

    monkeypatch.setattr(sp, "_maybe_recover_pixverse_image_sibling", _recovered)

    result = await sp._handle_no_submission_case(
        _FakeDB(model),
        generation=gen,
        current_attempt_id=7,
        latest_submission_any_attempt=None,
        generation_service=rec,
        unsubmitted_timeout_threshold=datetime.now(timezone.utc),
        unsubmitted_timeout_minutes=30,
    )

    assert result.outcome == "still_processing"  # not finalized — keep polling
    assert model.deferred_action == "cancel"  # left intact for the rearmed gen
    assert rec.calls == []  # no CANCELLED status emitted


@pytest.mark.asyncio
async def test_cancel_before_submission_finalizes_when_nothing_recoverable(monkeypatch):
    gen, model = _no_sub_gen_and_model()
    rec = _Recorder()

    async def _not_recovered(*_a, **_k):
        return False

    monkeypatch.setattr(sp, "_maybe_recover_pixverse_image_sibling", _not_recovered)

    result = await sp._handle_no_submission_case(
        _FakeDB(model),
        generation=gen,
        current_attempt_id=7,
        latest_submission_any_attempt=None,
        generation_service=rec,
        unsubmitted_timeout_threshold=datetime.now(timezone.utc),
        unsubmitted_timeout_minutes=30,
    )

    assert result.outcome == "failed"  # finalized CANCELLED as before
    assert model.deferred_action is None
    assert ("update_status", 134026, GenerationStatus.CANCELLED) in rec.calls
