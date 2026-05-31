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

from pixsim7.backend.main.domain.enums import (
    GenerationStatus,
    ProviderStatus,
)
from pixsim7.backend.main.services.provider import pixverse_image_recovery as rec
from pixsim7.backend.main.services.provider.base import ProviderStatusResult
from pixsim7.backend.main.services.provider.pixverse_image_recovery import (
    RearmStatus,
    RecoverableMatch,
    find_recoverable_via_numeric_list,
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


# ---------------------------------------------------------------------------
# Numeric image-list resolve: the recovery net for the quickgen-burst hole
# where a submit returned a job id but never captured a pre-allocated CDN url,
# so the url-keyed find_recoverable is structurally blind to it.
# ---------------------------------------------------------------------------

_REAL_ORI_URL = "https://media.pixverse.ai/pixverse/i2i/ori/realuuid-1234.png"


class _ListSession:
    """Async-session stand-in serving execute()->submissions and get()->account."""

    def __init__(self, subs, accounts):
        self._subs = subs
        self._accounts = accounts

    async def execute(self, _query):
        subs = self._subs

        class _Res:
            def scalars(self_inner):
                class _S:
                    def all(self_s):
                        return subs
                return _S()
        return _Res()

    async def get(self, model, ident):
        if model.__name__ == "ProviderAccount":
            return self._accounts.get(ident)
        return None


def _nsub(sid, *, job, response, account_id=2, attempt_id=1):
    return SimpleNamespace(
        id=sid,
        generation_id=134026,
        generation_attempt_id=attempt_id,
        account_id=account_id,
        provider_job_id=job,
        response=response,
    )


class _FakeListProvider:
    """Provider stub exposing check_image_status_from_list keyed by job id."""

    def __init__(self, by_job, *, raises_for=None):
        self._by_job = by_job          # job_id -> ProviderStatusResult
        self._raises_for = raises_for or set()
        self.calls = []

    async def check_image_status_from_list(self, *, account, image_id, max_pages):
        self.calls.append((image_id, max_pages))
        if image_id in self._raises_for:
            raise TimeoutError("Request timeout: ")
        return self._by_job.get(image_id)


@pytest.mark.asyncio
async def test_numeric_resolve_recovers_no_url_submission():
    gen = _gen(status=GenerationStatus.CANCELLED)
    # No url ever captured (the burst hole): response carries no asset/image url.
    sub = _nsub(901, job="405700852609826", response={"metadata": {"provider_status": 5}})
    session = _ListSession([sub], {2: SimpleNamespace(id=2)})
    provider = _FakeListProvider({
        "405700852609826": ProviderStatusResult(
            status=ProviderStatus.COMPLETED,
            video_url=_REAL_ORI_URL,
            thumbnail_url=_REAL_ORI_URL,
            metadata={"provider_status": 1, "is_image": True},
        )
    })

    match = await find_recoverable_via_numeric_list(
        session, gen, provider=provider, max_pages=20
    )
    assert match is not None
    assert match.submission.id == 901
    assert match.url == _REAL_ORI_URL
    assert provider.calls == [("405700852609826", 20)]


@pytest.mark.asyncio
async def test_numeric_resolve_skips_url_bearing_submission():
    gen = _gen(status=GenerationStatus.CANCELLED)
    # Url-bearing -> owned by find_recoverable; the live resolve must not pay
    # a list call for it.
    sub = _nsub(902, job="405700844932714",
                response={"asset_url": _REAL_ORI_URL})
    session = _ListSession([sub], {2: SimpleNamespace(id=2)})
    provider = _FakeListProvider({})  # would return None if (wrongly) called

    match = await find_recoverable_via_numeric_list(
        session, gen, provider=provider, max_pages=20
    )
    assert match is None
    assert provider.calls == []


@pytest.mark.asyncio
async def test_numeric_resolve_still_processing_is_not_recovered():
    gen = _gen(status=GenerationStatus.CANCELLED)
    sub = _nsub(903, job="j-proc", response={})
    session = _ListSession([sub], {2: SimpleNamespace(id=2)})
    provider = _FakeListProvider({
        "j-proc": ProviderStatusResult(
            status=ProviderStatus.PROCESSING,
            metadata={"is_image": True},
        )
    })

    match = await find_recoverable_via_numeric_list(
        session, gen, provider=provider, max_pages=20
    )
    assert match is None


@pytest.mark.asyncio
async def test_numeric_resolve_swallows_provider_timeout():
    gen = _gen(status=GenerationStatus.CANCELLED)
    # First (newest) submission times out; the next resolves -> still recovered,
    # proving one flaky call doesn't abort the sweep.
    s1 = _nsub(904, job="j-timeout", response={}, attempt_id=2)
    s2 = _nsub(905, job="j-ok", response={}, attempt_id=1)
    session = _ListSession([s1, s2], {2: SimpleNamespace(id=2)})
    provider = _FakeListProvider(
        {"j-ok": ProviderStatusResult(
            status=ProviderStatus.COMPLETED,
            video_url=_REAL_ORI_URL,
            metadata={"provider_status": 1},
        )},
        raises_for={"j-timeout"},
    )

    match = await find_recoverable_via_numeric_list(
        session, gen, provider=provider, max_pages=20
    )
    assert match is not None
    assert match.submission.id == 905
    assert [c[0] for c in provider.calls] == ["j-timeout", "j-ok"]
