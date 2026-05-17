"""Superseded-sibling recovery for lost Pixverse IMAGE generations.

Regression cover for the asset 107327 / gen 134026 hole: a burst /
duplicate submit leaves one generation with two pixverse jobs in the same
attempt; the poller only ever selects the latest, so when the *earlier*
sibling is the one that actually rendered it is structurally unpollable
and every forward salvage path (all bound to the selected submission)
misses it. ``rearm_generation`` must now re-group that sibling into its
own attempt id instead of bailing, and ``sweep_and_rearm_sibling`` must
act only when the recoverable submission is *not* the selected one.

These are narrow unit tests: the SQL-issuing helpers (``_is_targetable``,
``_next_attempt_id``, ``find_recoverable``) are stubbed so the test needs
no DB; the fake session only has to serve ``get``/``flush``/``commit``.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus
from pixsim7.backend.main.services.provider import pixverse_image_recovery as rec
from pixsim7.backend.main.services.provider.pixverse_image_recovery import (
    RearmStatus,
    RecoverableMatch,
    rearm_generation,
    sweep_and_rearm_sibling,
)


class _FakeSession:
    """Minimal async-session stand-in: object identity map for ``get``,
    no-op ``flush``, commit counter. All query-issuing helpers are
    monkeypatched out, so ``execute`` is never reached."""

    def __init__(self, objects: dict):
        self._objects = objects  # (model, id) -> obj
        self.commits = 0

    async def get(self, model, ident):
        return self._objects.get((model.__name__, ident))

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1


def _gen(gid=134026, *, status=GenerationStatus.CANCELLED, asset_id=None):
    return SimpleNamespace(
        id=gid,
        status=status,
        asset_id=asset_id,
        attempt_id=7,
        started_at=None,
        error_code="provider_generic",
        deferred_action=None,
        cancel_requested_at="2026-05-17T01:55:34Z",
    )


def _sub(sid, *, attempt_id, job):
    return SimpleNamespace(
        id=sid,
        generation_id=134026,
        generation_attempt_id=attempt_id,
        provider_job_id=job,
    )


def _objmap(gen, subs):
    m = {("Generation", gen.id): gen}
    for s in subs:
        m[("ProviderSubmission", s.id)] = s
    return m


@pytest.mark.asyncio
async def test_rearm_isolates_superseded_sibling(monkeypatch):
    """The rendered earlier sibling (659788) is not the latest in attempt
    7 → it is re-grouped into a fresh attempt and the generation re-armed
    onto it, not skipped."""
    gen = _gen()
    rendered = _sub(659788, attempt_id=7, job="403170333915566")
    later = _sub(659789, attempt_id=7, job="403170336493006")
    session = _FakeSession(_objmap(gen, [rendered, later]))

    async def _not_targetable(_s, _g, _sub):
        return False  # earlier sibling within an attempt that has a newer one

    async def _next(_s, _gid):
        return 8

    monkeypatch.setattr(rec, "_is_targetable", _not_targetable)
    monkeypatch.setattr(rec, "_next_attempt_id", _next)

    status = await rearm_generation(
        session, generation_id=gen.id, submission=rendered, accept_processing=True
    )

    assert status is RearmStatus.REARMED_ISOLATED_SIBLING
    assert rendered.generation_attempt_id == 8  # isolated into its own attempt
    assert later.generation_attempt_id == 7  # competing sibling untouched
    assert gen.status is GenerationStatus.PROCESSING
    assert gen.attempt_id == 8  # poller will now select the rendered sibling
    assert gen.error_code is None
    assert gen.deferred_action is None
    assert gen.cancel_requested_at is None
    assert gen.started_at is not None  # backdated for the PROCESSING-salvage gate
    assert session.commits == 1


@pytest.mark.asyncio
async def test_rearm_targetable_path_does_not_isolate(monkeypatch):
    """The common 1-per-attempt case still works and does not touch
    attempt ids."""
    gen = _gen()
    sub = _sub(659788, attempt_id=7, job="403170333915566")
    session = _FakeSession(_objmap(gen, [sub]))

    async def _targetable(_s, _g, _sub):
        return True

    monkeypatch.setattr(rec, "_is_targetable", _targetable)

    status = await rearm_generation(
        session, generation_id=gen.id, submission=sub, accept_processing=True
    )

    assert status is RearmStatus.REARMED
    assert sub.generation_attempt_id == 7  # unchanged
    assert gen.status is GenerationStatus.PROCESSING
    assert gen.attempt_id == 7


@pytest.mark.asyncio
async def test_rearm_skips_when_already_recovered(monkeypatch):
    """An asset-bearing / non-terminal row is left untouched (idempotent)."""
    gen = _gen(asset_id=107327)
    sub = _sub(659788, attempt_id=7, job="403170333915566")
    session = _FakeSession(_objmap(gen, [sub]))

    status = await rearm_generation(
        session, generation_id=gen.id, submission=sub
    )
    assert status is RearmStatus.SKIPPED_RESOLVED
    assert gen.status is GenerationStatus.CANCELLED
    assert session.commits == 0


@pytest.mark.asyncio
async def test_rearm_processing_rejected_without_accept_flag():
    """Backfill must not re-arm a still-PROCESSING row (only genuine
    terminals); the live poller opts in via accept_processing."""
    gen = _gen(status=GenerationStatus.PROCESSING)
    sub = _sub(659788, attempt_id=7, job="403170333915566")
    session = _FakeSession(_objmap(gen, [sub]))

    status = await rearm_generation(
        session, generation_id=gen.id, submission=sub
    )
    assert status is RearmStatus.SKIPPED_RESOLVED


@pytest.mark.asyncio
async def test_sweep_skips_when_match_is_the_selected_submission(monkeypatch):
    """If the only recoverable object belongs to the submission the poller
    already selected, the forward salvage owns it — the sweep must not
    double-handle."""
    gen = _gen(status=GenerationStatus.PROCESSING)
    selected = _sub(659789, attempt_id=7, job="403170336493006")
    session = _FakeSession(_objmap(gen, [selected]))

    async def _find(_s, _g, **_kw):
        return RecoverableMatch(submission=selected, url="http://x/y.png", provider_status=5)

    called = {"rearm": 0}

    async def _rearm(*_a, **_k):
        called["rearm"] += 1
        return RearmStatus.REARMED

    monkeypatch.setattr(rec, "find_recoverable", _find)
    monkeypatch.setattr(rec, "rearm_generation", _rearm)

    result = await sweep_and_rearm_sibling(
        session, generation_id=gen.id, selected_submission_id=selected.id
    )
    assert result is None
    assert called["rearm"] == 0


@pytest.mark.asyncio
async def test_sweep_rearms_non_selected_recoverable_sibling(monkeypatch):
    """The rendered earlier sibling (≠ selected) drives a re-arm."""
    gen = _gen(status=GenerationStatus.PROCESSING)
    selected = _sub(659789, attempt_id=7, job="403170336493006")
    rendered = _sub(659788, attempt_id=7, job="403170333915566")
    session = _FakeSession(_objmap(gen, [selected, rendered]))

    async def _find(_s, _g, **_kw):
        return RecoverableMatch(submission=rendered, url="http://x/9c.png", provider_status=5)

    seen = {}

    async def _rearm(_s, *, generation_id, submission, accept_processing):
        seen["gid"] = generation_id
        seen["sub"] = submission.id
        seen["accept"] = accept_processing
        return RearmStatus.REARMED_ISOLATED_SIBLING

    monkeypatch.setattr(rec, "find_recoverable", _find)
    monkeypatch.setattr(rec, "rearm_generation", _rearm)

    result = await sweep_and_rearm_sibling(
        session, generation_id=gen.id, selected_submission_id=selected.id
    )
    assert result is RearmStatus.REARMED_ISOLATED_SIBLING
    assert seen == {"gid": gen.id, "sub": 659788, "accept": True}


@pytest.mark.asyncio
async def test_sweep_returns_none_when_nothing_recoverable(monkeypatch):
    gen = _gen(status=GenerationStatus.PROCESSING)
    session = _FakeSession(_objmap(gen, []))

    async def _find(_s, _g, **_kw):
        return None

    monkeypatch.setattr(rec, "find_recoverable", _find)
    result = await sweep_and_rearm_sibling(
        session, generation_id=gen.id, selected_submission_id=999
    )
    assert result is None


@pytest.mark.asyncio
async def test_sweep_noops_on_asset_bearing_generation(monkeypatch):
    gen = _gen(asset_id=107327)
    session = _FakeSession(_objmap(gen, []))

    async def _boom(*_a, **_k):  # must not be reached
        raise AssertionError("find_recoverable should not run for a recovered gen")

    monkeypatch.setattr(rec, "find_recoverable", _boom)
    result = await sweep_and_rearm_sibling(
        session, generation_id=gen.id, selected_submission_id=1
    )
    assert result is None
