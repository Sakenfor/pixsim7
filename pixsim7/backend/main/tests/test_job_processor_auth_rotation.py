from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.shared.errors import (
    ProviderAuthenticationError,
    ProviderError,
    ProviderQuotaExceededError,
)
from pixsim7.backend.main.workers import job_processor
from pixsim7.backend.main.workers.job_processor import _is_auth_rotation_error


def test_auth_rotation_detects_provider_authentication_error() -> None:
    error = ProviderAuthenticationError("pixverse", "session invalid")
    assert _is_auth_rotation_error(error) is True


def test_auth_rotation_detects_structured_provider_auth_code() -> None:
    error = ProviderError(
        "Pixverse account auth failed",
        error_code="provider_auth",
        retryable=False,
    )
    assert _is_auth_rotation_error(error) is True


def test_auth_rotation_detects_pixverse_session_markers_in_message() -> None:
    error = ProviderError("Pixverse API error 10005: user logged in elsewhere")
    assert _is_auth_rotation_error(error) is True


def test_auth_rotation_ignores_non_auth_provider_errors() -> None:
    error = ProviderQuotaExceededError("pixverse", 10)
    assert _is_auth_rotation_error(error) is False


class _NoopLogger:
    def info(self, *args, **kwargs) -> None:
        return None

    def warning(self, *args, **kwargs) -> None:
        return None

    def error(self, *args, **kwargs) -> None:
        return None

    def debug(self, *args, **kwargs) -> None:
        return None


class _NoopDebug:
    def worker(self, *args, **kwargs) -> None:
        return None

    def provider(self, *args, **kwargs) -> None:
        return None


@pytest.mark.asyncio
async def test_process_generation_requeues_and_clears_preferred_on_auth_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    generation = SimpleNamespace(
        id=3499,
        user_id=12,
        status="pending",
        scheduled_at=None,
        preferred_account_id=2,
        account_id=None,
        provider_id="pixverse",
        canonical_params={},
        raw_params={},
        started_at=None,
    )
    preferred_account = SimpleNamespace(
        id=2,
        provider_id="pixverse",
        cooldown_until=None,
    )
    preferred_account.is_available = lambda: True

    class _FakeDB:
        def __init__(self) -> None:
            self.commits = 0
            self.added = []
            self.closed = False

        async def get(self, model, entity_id):
            if entity_id == preferred_account.id:
                return preferred_account
            return None

        def add(self, obj) -> None:
            self.added.append(obj)

        async def commit(self) -> None:
            self.commits += 1

        async def refresh(self, obj) -> None:
            return None

        async def close(self) -> None:
            self.closed = True

    fake_db = _FakeDB()

    async def _fake_get_db():
        yield fake_db

    class _FakeUserService:
        def __init__(self, db) -> None:
            self.db = db

        async def get_user(self, user_id: int):
            return SimpleNamespace(id=user_id)

    class _FakeGenerationService:
        def __init__(self, db, user_service) -> None:
            self.db = db

        async def get_generation(self, generation_id: int):
            return generation

        async def mark_started(self, generation_id: int):
            generation.status = "processing"
            generation.started_at = object()
            return generation

        async def mark_failed(self, *args, **kwargs):
            raise AssertionError("mark_failed should not be called on auth-rotation requeue")

    class _FakeAccountService:
        instance = None

        def __init__(self, db) -> None:
            self.db = db
            self.reserved = []
            self.released = []
            _FakeAccountService.instance = self

        async def reserve_account(self, account_id: int):
            self.reserved.append(account_id)
            return preferred_account

        async def release_account(self, account_id: int):
            self.released.append(account_id)
            return preferred_account

        async def mark_exhausted(self, account_id: int):
            raise AssertionError("mark_exhausted should not be called in auth path")

        async def select_and_reserve_account(self, **kwargs):
            raise AssertionError("fallback account selection should not be needed")

    class _FakeProviderService:
        def __init__(self, db) -> None:
            self.db = db

        async def execute_generation(self, **kwargs):
            raise ProviderAuthenticationError("pixverse", "session invalid")

    class _FakeArqPool:
        def __init__(self) -> None:
            self.jobs = []

        async def enqueue_job(self, name: str, generation_id: int) -> None:
            self.jobs.append((name, generation_id))

    async def _fake_refresh_account_credits(*args, **kwargs):
        return {"web": 10}

    arq_pool = _FakeArqPool()

    async def _fake_get_arq_pool():
        return arq_pool

    monkeypatch.setattr(job_processor, "_init_worker_debug_flags", lambda: None)
    monkeypatch.setattr(
        job_processor,
        "bind_job_context",
        lambda *args, **kwargs: _NoopLogger(),
    )
    monkeypatch.setattr(job_processor, "get_global_debug_logger", lambda: _NoopDebug())
    monkeypatch.setattr(job_processor, "DebugLogger", lambda *args, **kwargs: _NoopDebug())
    monkeypatch.setattr(job_processor, "get_db", _fake_get_db)
    monkeypatch.setattr(job_processor, "UserService", _FakeUserService)
    monkeypatch.setattr(job_processor, "GenerationService", _FakeGenerationService)
    monkeypatch.setattr(job_processor, "AccountService", _FakeAccountService)
    monkeypatch.setattr(job_processor, "ProviderService", _FakeProviderService)
    monkeypatch.setattr(job_processor, "refresh_account_credits", _fake_refresh_account_credits)
    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.redis.get_arq_pool",
        _fake_get_arq_pool,
    )

    result = await job_processor.process_generation({"job_try": 1}, generation.id)

    assert result == {
        "status": "requeued",
        "reason": "account_auth_failure",
        "generation_id": generation.id,
    }
    assert _FakeAccountService.instance is not None
    assert _FakeAccountService.instance.reserved == [preferred_account.id]
    assert _FakeAccountService.instance.released == [preferred_account.id]
    assert generation.account_id is None
    assert generation.preferred_account_id is None
    assert generation.started_at is None
    assert "pending" in str(generation.status).lower()
    assert preferred_account.cooldown_until is not None
    assert arq_pool.jobs == [("process_generation", generation.id)]
