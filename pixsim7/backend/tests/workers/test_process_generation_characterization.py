"""Characterization tests for ``process_generation`` terminal outcomes.

These pin the *observable contract* of the generation worker's main arq
function — the dict it returns (or the exception it raises) for each terminal
branch — before the orchestration is carved out of the worker into a
host-agnostic ``GenerationProcessingService`` (plan ``worker-thin-host-canon``,
checkpoint ``generation-worker-extraction``).

The seam under test is ``process_generation`` *as an orchestrator*: external
collaborators (db, provider, account service, redis/arq, health tracker) and
the already-extracted side-effect helpers (``_release_account_reservation``,
``_requeue_generation_for_account_rotation``, ``_defer_pinned_generation``,
``_apply_account_cooldown`` …) are faked with recorders, so each test asserts
*which* helper the orchestrator drives and *what* it returns — exactly the
behavior the extraction must preserve. The helpers keep their own unit tests.

Style follows ``test_job_processor_auth_rotation.py`` (SimpleNamespace fakes +
monkeypatched module globals, no real DB).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any, Callable

import pytest

from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    ProviderConcurrentLimitError,
    ProviderContentFilteredError,
    ProviderError,
)
from pixsim7.backend.main.workers import job_processor
from pixsim7.backend.main.services.generation.processing import service

# The orchestration body now lives in services/generation/processing/service.py
# (worker-thin-host-canon Slice 2); process_generation is thin glue over
# GenerationProcessingService. Body collaborators are patched on `service`; the
# entrypoint is still called via job_processor.process_generation.


# --------------------------------------------------------------------------- #
# No-op logging / debug doubles
# --------------------------------------------------------------------------- #
class _NoopLogger:
    def info(self, *a, **k) -> None: ...
    def warning(self, *a, **k) -> None: ...
    def error(self, *a, **k) -> None: ...
    def debug(self, *a, **k) -> None: ...


class _NoopDebug:
    def worker(self, *a, **k) -> None: ...
    def provider(self, *a, **k) -> None: ...


class _HealthTracker:
    def __init__(self) -> None:
        self.processed = 0
        self.failed = 0

    def increment_processed(self) -> None:
        self.processed += 1

    def increment_failed(self) -> None:
        self.failed += 1


class _FakeResult:
    """Stand-in for a SQLAlchemy Result — every shape used returns 'empty'."""

    def all(self) -> list:
        return []

    def scalar_one(self) -> int:
        return 0

    def scalars(self) -> "_FakeResult":
        return self


class _FakeDB:
    def __init__(self, accounts: dict[int, Any]) -> None:
        self._accounts = accounts
        self.commits = 0
        self.added: list = []
        self.closed = False

    async def get(self, model, entity_id):
        return self._accounts.get(entity_id)

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, obj) -> None:
        return None

    async def execute(self, *a, **k) -> _FakeResult:
        return _FakeResult()

    async def rollback(self) -> None:
        return None

    async def close(self) -> None:
        self.closed = True


class _FakeArqPool:
    def __init__(self) -> None:
        self.jobs: list = []

    async def enqueue_job(self, name, *a, **k) -> None:
        self.jobs.append((name, a, k))


# --------------------------------------------------------------------------- #
# Configurable fake services
# --------------------------------------------------------------------------- #
@dataclass
class _Env:
    """Handles a test can assert against after running process_generation."""

    db: _FakeDB
    arq_pool: _FakeArqPool
    health: _HealthTracker
    account_service: Any
    generation_service: Any
    provider_service: Any
    calls: dict[str, list] = field(default_factory=dict)


def _make_account(account_id: int = 100, provider_id: str = "pixverse") -> SimpleNamespace:
    acct = SimpleNamespace(
        id=account_id,
        provider_id=provider_id,
        current_processing_jobs=1,
        max_concurrent_jobs=4,
        cooldown_until=None,
        provider_metadata={},
    )
    acct.get_operational_skip_reason = lambda: None
    acct.has_capacity = lambda: True
    return acct


def _make_generation(**overrides) -> SimpleNamespace:
    base = dict(
        id=777,
        user_id=12,
        status="pending",
        scheduled_at=None,
        preferred_account_id=None,
        account_id=None,
        provider_id="pixverse",
        canonical_params={},
        started_at=None,
        completed_at=None,
        retry_count=0,
        attempt_id=0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    generation: SimpleNamespace,
    accounts: dict[int, Any] | None = None,
    select_account: Callable[..., Any] | None = None,
    execute_generation: Callable[..., Any] | None = None,
    mark_started_raises: BaseException | None = None,
    is_pinned: bool = False,
    is_quarantined: bool = False,
) -> _Env:
    """Wire up every module global ``process_generation`` touches.

    ``select_account`` / ``execute_generation`` are the two real injection
    points a branch varies on; everything else gets a neutral default.
    """
    accounts = accounts or {}
    calls: dict[str, list] = {}

    def _rec(name: str, *args, **kwargs) -> None:
        calls.setdefault(name, []).append((args, kwargs))

    db = _FakeDB(accounts)
    arq_pool = _FakeArqPool()
    health = _HealthTracker()

    default_account = _make_account()

    class _FakeUserService:
        def __init__(self, db) -> None: ...
        async def get_user(self, user_id: int):
            return SimpleNamespace(id=user_id)

    class _FakeGenerationService:
        def __init__(self, db, user_service) -> None: ...

        async def get_generation(self, gid):
            return generation

        async def mark_started(self, gid):
            if mark_started_raises is not None:
                raise mark_started_raises
            generation.status = "processing"
            generation.started_at = object()
            return generation

        async def mark_failed(self, gid, message, error_code=None):
            _rec("mark_failed", gid, message, error_code=error_code)
            generation.status = "failed"
            return generation

        async def update_status(self, gid, status, message=None, error_code=None):
            _rec("update_status", gid, status, message, error_code=error_code)
            generation.status = status
            return generation

    class _FakeAccountService:
        def __init__(self, db) -> None: ...

        async def select_and_reserve_account(self, **kwargs):
            _rec("select_and_reserve_account", **kwargs)
            if select_account is None:
                return default_account
            return select_account(**kwargs)

        async def reserve_account_if_available(self, account_id):
            _rec("reserve_account_if_available", account_id)
            return accounts.get(account_id, default_account)

        async def release_account(self, account_id, **kwargs):
            _rec("release_account", account_id)
            return None

        async def mark_exhausted(self, account_id):
            _rec("mark_exhausted", account_id)
            return None

    class _FakeProviderService:
        def __init__(self, db) -> None: ...

        async def execute_generation(self, *, generation, account, params):
            _rec("execute_generation", account_id=account.id)
            if execute_generation is None:
                return SimpleNamespace(provider_job_id="pv_job_1")
            return execute_generation(generation=generation, account=account, params=params)

    gen_service = _FakeGenerationService(db, None)
    acct_service = _FakeAccountService(db)
    prov_service = _FakeProviderService(db)

    # --- logging / debug ---
    monkeypatch.setattr(service, "_init_worker_debug_flags", lambda: None)
    monkeypatch.setattr(service, "bind_job_context", lambda *a, **k: _NoopLogger())
    monkeypatch.setattr(service, "get_global_debug_logger", lambda: _NoopDebug())
    monkeypatch.setattr(service, "DebugLogger", lambda *a, **k: _NoopDebug())
    monkeypatch.setattr(service, "get_health_tracker", lambda: health)

    # --- db + services ---
    async def _fake_get_db():
        yield db

    monkeypatch.setattr(service, "get_db", _fake_get_db)
    monkeypatch.setattr(service, "UserService", lambda db: gen_service and _FakeUserService(db))
    monkeypatch.setattr(service, "GenerationService", lambda db, us: gen_service)
    monkeypatch.setattr(service, "AccountService", lambda db: acct_service)
    monkeypatch.setattr(service, "ProviderService", lambda db: prov_service)

    # --- redis / arq ---
    async def _fake_get_arq_pool():
        return arq_pool

    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_arq_pool", _fake_get_arq_pool
    )

    async def _arec(name):
        async def _inner(*a, **k):
            _rec(name, *a, **k)
            return {} if name == "enqueue_generation_retry_job" else None
        return _inner

    for qn in (
        "release_generation_enqueue_lease",
        "clear_generation_wait_metadata",
        "set_generation_wait_metadata",
        "enqueue_immediate_poll",
    ):
        async def _mk(*a, _qn=qn, **k):
            _rec(_qn, *a, **k)
        monkeypatch.setattr(service, qn, _mk)

    async def _fake_enqueue_retry(arq, gid, defer_seconds=None, **k):
        _rec("enqueue_generation_retry_job", gid, defer_seconds=defer_seconds)
        return {"enqueued": True, "deduped": False, "actual_defer_seconds": defer_seconds}

    monkeypatch.setattr(service, "enqueue_generation_retry_job", _fake_enqueue_retry)

    # --- worker_concurrency helpers imported into the service module ---
    async def _noop_async(*a, **k):
        return None

    monkeypatch.setattr(service, "_clear_pinned_concurrent_wait_count", _noop_async)
    monkeypatch.setattr(service, "seed_agnostic_prompt_group_hash", lambda g: "ph")

    async def _fake_quarantined(provider_id, h):
        return is_quarantined

    monkeypatch.setattr(service, "is_prompt_concurrent_quarantined", _fake_quarantined)
    monkeypatch.setattr(
        service, "_adaptive_provider_concurrency_record_submit_success", _noop_async
    )

    async def _fake_record_limit(**k):
        return {}

    monkeypatch.setattr(
        service, "_adaptive_provider_concurrency_record_limit_error", _fake_record_limit
    )

    async def _fake_pre_submit_gate(**k):
        # Neutral: let pinned generations proceed to submit (probe), so the
        # post-submit error branch is what each test exercises.
        return {"action": "allow_probe"}

    monkeypatch.setattr(
        service, "_adaptive_provider_concurrency_pre_submit_gate", _fake_pre_submit_gate
    )

    async def _fake_plan_defer(**k):
        return {
            "action": "defer",
            "defer_seconds": 5,
            "reason": "pinned_account_concurrent_wait",
            "increment_retry": True,
        }

    monkeypatch.setattr(service, "_plan_pinned_concurrent_defer", _fake_plan_defer)
    monkeypatch.setattr(service, "_is_pinned_account", lambda g, a: is_pinned)
    monkeypatch.setattr(service, "_get_concurrent_limit_cooldown_seconds", lambda g, a: 5)
    monkeypatch.setattr(service, "mark_prompt_concurrent_quarantined", _noop_async)

    # --- credit hints (short-circuit verify_credits to True) ---
    monkeypatch.setattr(service, "_required_generation_credit_hint", lambda *a, **k: 0)
    monkeypatch.setattr(service, "resolve_required_credit_types", lambda *a, **k: None)
    monkeypatch.setattr(service, "is_unlimited_model", lambda *a, **k: False)

    async def _fake_refresh(*a, **k):
        return {}

    monkeypatch.setattr(service, "refresh_account_credits", _fake_refresh)
    monkeypatch.setattr(service, "refresh_account_credits_best_effort", _fake_refresh)

    # --- account-event sink ---
    monkeypatch.setattr(
        service, "AccountEventService", SimpleNamespace(record=lambda *a, **k: None)
    )

    # --- side-effect helpers: recorders returning the documented payloads ---
    async def _fake_release(*, account_service, account_id, gen_logger, skip_wake=False):
        _rec("_release_account_reservation", account_id=account_id, skip_wake=skip_wake)
        return True

    monkeypatch.setattr(service, "_release_account_reservation", _fake_release)

    async def _fake_cooldown(**k):
        _rec("_apply_account_cooldown", **{x: k[x] for x in ("event_name",) if x in k})

    monkeypatch.setattr(service, "_apply_account_cooldown", _fake_cooldown)

    async def _fake_requeue(*, reason, generation_id, **k):
        _rec("_requeue_generation_for_account_rotation", reason=reason, **k)
        return {"status": "requeued", "reason": reason, "generation_id": generation_id}

    monkeypatch.setattr(service, "_requeue_generation_for_account_rotation", _fake_requeue)

    async def _fake_defer(*, reason, generation_id, **k):
        _rec("_defer_pinned_generation", reason=reason, **k)
        return {"status": "waiting", "reason": reason, "generation_id": generation_id}

    monkeypatch.setattr(service, "_defer_pinned_generation", _fake_defer)

    return _Env(
        db=db,
        arq_pool=arq_pool,
        health=health,
        account_service=acct_service,
        generation_service=gen_service,
        provider_service=prov_service,
        calls=calls,
    )


async def _run(generation: SimpleNamespace, *, job_try: int = 1) -> dict:
    return await job_processor.process_generation({"job_try": job_try}, generation.id)


# --------------------------------------------------------------------------- #
# Guard-phase outcomes
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_skip_when_not_pending(monkeypatch: pytest.MonkeyPatch) -> None:
    gen = _make_generation(status="processing")
    _install(monkeypatch, generation=gen)
    result = await _run(gen)
    assert result == {"status": "skipped", "reason": "Generation status is processing"}


@pytest.mark.asyncio
async def test_scheduled_in_future(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import datetime, timezone, timedelta

    future = datetime.now(timezone.utc) + timedelta(hours=1)
    gen = _make_generation(scheduled_at=future)
    _install(monkeypatch, generation=gen)
    result = await _run(gen)
    assert result["status"] == "scheduled"
    assert result["scheduled_for"] == str(future)


@pytest.mark.asyncio
async def test_paused_when_prompt_quarantined(monkeypatch: pytest.MonkeyPatch) -> None:
    gen = _make_generation()
    env = _install(monkeypatch, generation=gen, is_quarantined=True)
    result = await _run(gen)
    assert result == {"status": "paused", "reason": "prompt_concurrent_quarantine"}
    assert "update_status" in env.calls  # PAUSED persisted + JOB_PAUSED emitted


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_happy_path_submitted(monkeypatch: pytest.MonkeyPatch) -> None:
    gen = _make_generation()
    env = _install(monkeypatch, generation=gen)
    result = await _run(gen)
    assert result == {
        "status": "submitted",
        "provider_job_id": "pv_job_1",
        "generation_id": gen.id,
    }
    assert env.health.processed == 1
    assert env.health.failed == 0
    assert "execute_generation" in env.calls
    assert "enqueue_immediate_poll" in env.calls  # races the early-CDN window
    assert gen.account_id == 100  # persisted onto the generation


@pytest.mark.asyncio
async def test_duplicate_pickup_skips_and_releases(monkeypatch: pytest.MonkeyPatch) -> None:
    """If mark_started races another worker (InvalidOperationError), abort
    cleanly: release the reservation and return 'already_processing'.

    Regression guard for the latent ``account_released`` NameError on this path
    (it was only initialized inside the ProviderError handler, never reached
    here). Without the fix this raised NameError → wrapped into an ARQ retry.
    """
    from pixsim7.backend.main.shared.errors import InvalidOperationError

    gen = _make_generation()
    env = _install(
        monkeypatch,
        generation=gen,
        mark_started_raises=InvalidOperationError("already processing"),
    )
    result = await _run(gen)
    assert result == {
        "status": "skipped",
        "reason": "already_processing",
        "generation_id": gen.id,
    }
    assert "_release_account_reservation" in env.calls


# --------------------------------------------------------------------------- #
# Error-policy outcomes
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_non_retryable_content_filter_returns_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise(**k):
        raise ProviderContentFilteredError("pixverse", "prompt rejected", retryable=False)

    gen = _make_generation()
    env = _install(monkeypatch, generation=gen, execute_generation=_raise)
    result = await _run(gen)
    assert result["status"] == "failed"
    assert result["reason"] == "content_filtered_not_retryable"
    assert result["generation_id"] == gen.id
    assert "mark_failed" in env.calls  # marked failed, returned (NOT raised → no ARQ retry)
    assert env.health.failed == 0  # non-retryable CF returns before the generic failed-counter


@pytest.mark.asyncio
async def test_concurrent_limit_nonpinned_rotates_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise(**k):
        raise ProviderConcurrentLimitError("pixverse", account_id=100)

    gen = _make_generation()
    env = _install(monkeypatch, generation=gen, execute_generation=_raise, is_pinned=False)
    result = await _run(gen)
    assert result["status"] == "requeued"
    assert result["reason"] == "account_concurrent_limit"
    # cooldown applied + reservation released + rotation requeue driven
    assert "_apply_account_cooldown" in env.calls
    assert "_release_account_reservation" in env.calls
    assert "_requeue_generation_for_account_rotation" in env.calls


@pytest.mark.asyncio
async def test_concurrent_limit_pinned_defers(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(**k):
        raise ProviderConcurrentLimitError("pixverse", account_id=100)

    gen = _make_generation(preferred_account_id=100)
    pinned_account = _make_account(account_id=100)
    env = _install(
        monkeypatch,
        generation=gen,
        accounts={100: pinned_account},  # reserved up front via the preferred-account path
        execute_generation=_raise,
        is_pinned=True,
    )
    result = await _run(gen)
    assert result["status"] == "waiting"
    assert "_defer_pinned_generation" in env.calls
    # pinned path defers; it must NOT rotate to a different account
    assert "_requeue_generation_for_account_rotation" not in env.calls


@pytest.mark.asyncio
async def test_account_exhausted_requeues_via_outer_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _no_account(**kwargs):
        raise NoAccountAvailableError("pixverse")

    gen = _make_generation()
    env = _install(monkeypatch, generation=gen, select_account=_no_account)
    result = await _run(gen)
    assert result["status"] == "requeued"
    assert result["reason"] == "account_capacity_wait"
    assert result["target_queue"] == service.GENERATION_RETRY_QUEUE_NAME
    assert "enqueue_generation_retry_job" in env.calls  # explicit defer to retry queue


@pytest.mark.asyncio
async def test_non_retryable_provider_error_returns_not_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise(**k):
        raise ProviderError("unexpected boom", error_code="provider_unknown", retryable=False)

    gen = _make_generation()
    env = _install(monkeypatch, generation=gen, execute_generation=_raise)
    result = await _run(gen)
    assert result["status"] == "failed"
    assert result["reason"] == "non_retryable_error"
    assert env.health.failed == 1


@pytest.mark.asyncio
async def test_retryable_provider_error_raises_on_nonfinal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise(**k):
        raise ProviderError("transient blip", error_code="provider_unknown", retryable=True)

    gen = _make_generation()
    _install(monkeypatch, generation=gen, execute_generation=_raise)
    with pytest.raises(ProviderError):
        await _run(gen, job_try=1)  # non-final try → re-raise so ARQ retries
