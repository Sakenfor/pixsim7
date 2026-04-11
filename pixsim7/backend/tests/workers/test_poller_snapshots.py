from __future__ import annotations

from datetime import datetime, timedelta, timezone
import time
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus, OperationType, ProviderStatus
from pixsim7.backend.main.services.provider.base import ModerationRecheckResult
from pixsim7.backend.main.shared.errors import ProviderError
from pixsim7.backend.main.workers import status_poller
from pixsim7.backend.main.workers.status_poller import (
    _GenerationSubmissionSnapshot,
    _ProcessingGenerationSnapshot,
)


class _NoopDebug:
    def worker(self, *args, **kwargs) -> None:
        return None

    def provider(self, *args, **kwargs) -> None:
        return None


class _FakeScalars:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)

    def first(self):
        if not self._values:
            return None
        return self._values[0]


class _FakeResult:
    def __init__(self, *, scalar_value=None, rows=None):
        self._scalar_value = scalar_value
        self._rows = list(rows or [])

    def scalar(self):
        return self._scalar_value

    def scalar_one(self):
        if self._scalar_value is not None:
            return self._scalar_value
        if len(self._rows) != 1:
            raise ValueError(f"Expected exactly one row, got {len(self._rows)}")
        return self._rows[0]

    def first(self):
        if not self._rows:
            return None
        return self._rows[0]

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeAccount:
    def __init__(self, account_id: int, *, current_processing_jobs: int = 1) -> None:
        self.id = account_id
        self.current_processing_jobs = current_processing_jobs
        self.total_videos_generated = 0
        self.total_videos_failed = 0
        self.videos_today = 0
        self.failure_streak = 0
        self.last_used = None
        self.success_rate = 1.0
        self.ema_updates: list[float] = []

    def update_ema_generation_time(self, seconds: float) -> None:
        self.ema_updates.append(float(seconds))

    def calculate_success_rate(self) -> float:
        total = self.total_videos_generated + self.total_videos_failed
        if total <= 0:
            return 1.0
        return self.total_videos_generated / total


class _FakeDB:
    def __init__(
        self,
        *,
        generations: dict[int, object] | None = None,
        submissions: dict[int, object] | None = None,
        accounts: dict[int, _FakeAccount] | None = None,
        assets: dict[int, object] | None = None,
        submission_count: int = 0,
        previous_valid_row: tuple | None = None,
    ) -> None:
        self.generations = dict(generations or {})
        self.submissions = dict(submissions or {})
        self.accounts = dict(accounts or {})
        self.assets = dict(assets or {})
        self.submission_count = int(submission_count)
        self.previous_valid_row = previous_valid_row
        self.closed = False
        self.commits = 0

    async def execute(self, query):
        sql = str(query).lower()
        if "count(provider_submissions.id)" in sql:
            return _FakeResult(scalar_value=self.submission_count)
        if "count(" in sql and "provider_submissions" in sql:
            return _FakeResult(scalar_value=self.submission_count)
        if "from provider_submissions" in sql and "provider_submissions.provider_job_id is not null" in sql:
            rows = [self.previous_valid_row] if self.previous_valid_row is not None else []
            return _FakeResult(rows=rows)
        if "from asset_analyses" in sql:
            return _FakeResult(rows=[])
        # Account lock query (select ... for update / provider_accounts)
        if self.accounts and ("for update" in sql or "provider_account" in sql):
            return _FakeResult(rows=[next(iter(self.accounts.values()))])
        return _FakeResult(rows=[])

    async def get(self, model, entity_id):
        if model is status_poller.Generation:
            return self.generations.get(entity_id)
        if model is status_poller.ProviderSubmission:
            return self.submissions.get(entity_id)
        if model is status_poller.ProviderAccount:
            return self.accounts.get(entity_id)
        if model is status_poller.Asset:
            return self.assets.get(entity_id)
        return None

    async def refresh(self, obj) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        return None

    async def close(self) -> None:
        self.closed = True


class _FakeUserService:
    def __init__(self, db) -> None:
        self.db = db


class _FakeGenerationService:
    instance = None

    def __init__(self, db, user_service) -> None:
        self.db = db
        self.failed: list[tuple[int, str, str | None]] = []
        self.completed: list[tuple[int, int]] = []
        _FakeGenerationService.instance = self

    async def mark_failed(self, generation_id: int, error_message: str, error_code: str | None = None):
        self.failed.append((generation_id, error_message, error_code))
        generation = await self.db.get(status_poller.Generation, generation_id)
        if generation is not None:
            generation.status = GenerationStatus.FAILED
        return generation

    async def mark_completed(self, generation_id: int, asset_id: int):
        self.completed.append((generation_id, asset_id))
        generation = await self.db.get(status_poller.Generation, generation_id)
        if generation is not None:
            generation.status = GenerationStatus.COMPLETED
        return generation


class _FakeProviderService:
    status_result = None
    status_error: Exception | None = None
    instance = None

    def __init__(self, db) -> None:
        self.db = db
        self.check_status_calls: list[dict] = []
        _FakeProviderService.instance = self

    async def check_status(self, *, submission, account, operation_type, poll_cache):
        self.check_status_calls.append(
            {
                "submission_id": getattr(submission, "id", None),
                "account_id": getattr(account, "id", None),
                "operation_type": operation_type,
            }
        )
        if _FakeProviderService.status_error is not None:
            raise _FakeProviderService.status_error
        return _FakeProviderService.status_result


class _FakeAccountService:
    instance = None

    def __init__(self, db) -> None:
        self.db = db
        self.released: list[int] = []
        _FakeAccountService.instance = self

    async def release_account(self, account_id: int):
        self.released.append(account_id)
        account = await self.db.get(status_poller.ProviderAccount, account_id)
        if account is not None:
            account.current_processing_jobs = max(0, int(account.current_processing_jobs or 0) - 1)
        return account


class _FakeAssetService:
    def __init__(self, db, user_service) -> None:
        self.db = db

    async def create_from_submission(self, submission, generation):
        return SimpleNamespace(
            id=9001,
            media_type=None,
            media_metadata={},
            user_id=123,
            remote_url=None,
        )


class _FakeAnalysisService:
    def __init__(self, db) -> None:
        self.db = db

    async def mark_failed(self, *args, **kwargs):
        return None

    async def mark_completed(self, *args, **kwargs):
        return None


class _FakeBillingService:
    calls: list[dict] = []

    def __init__(self, db) -> None:
        self.db = db

    async def finalize_billing(
        self,
        *,
        generation,
        final_submission=None,
        account=None,
        actual_duration=None,
    ):
        _FakeBillingService.calls.append(
            {
                "generation_id": getattr(generation, "id", None),
                "submission_id": getattr(final_submission, "id", None),
                "account_id": getattr(account, "id", None),
                "actual_duration": actual_duration,
            }
        )
        return generation


def _install_shared_patches(monkeypatch: pytest.MonkeyPatch, db: _FakeDB) -> None:
    async def _fake_get_db():
        yield db

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _fake_get_async_session():
        yield db

    async def _fake_refresh_account_credits_best_effort(*args, **kwargs):
        _db = kwargs.get("db")
        if _db is not None:
            await _db.commit()
        return {"web": 1}

    monkeypatch.setattr(status_poller, "_init_poller_debug_flags", lambda: None)
    monkeypatch.setattr(status_poller, "get_global_debug_logger", lambda: _NoopDebug())
    monkeypatch.setattr(status_poller, "get_db", _fake_get_db)
    monkeypatch.setattr(status_poller, "get_async_session", _fake_get_async_session)
    monkeypatch.setattr(status_poller, "UserService", _FakeUserService)
    monkeypatch.setattr(status_poller, "GenerationService", _FakeGenerationService)
    monkeypatch.setattr(status_poller, "ProviderService", _FakeProviderService)
    monkeypatch.setattr(status_poller, "AccountService", _FakeAccountService)
    monkeypatch.setattr(status_poller, "AssetService", _FakeAssetService)
    monkeypatch.setattr(status_poller, "AnalysisService", _FakeAnalysisService)
    monkeypatch.setattr(status_poller, "GenerationBillingService", _FakeBillingService)
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _fake_refresh_account_credits_best_effort,
    )


def _reset_fakes() -> None:
    _FakeGenerationService.instance = None
    _FakeProviderService.instance = None
    _FakeAccountService.instance = None
    _FakeProviderService.status_error = None
    _FakeProviderService.status_result = None
    _FakeBillingService.calls = []
    status_poller._moderation_recheck.clear()
    status_poller._transient_poll_backoff.clear()
    status_poller._non_transient_poll_backoff.clear()


@pytest.mark.asyncio
async def test_poll_job_statuses_completed_path_uses_snapshot_inputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=101,
        account_id=501,
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=now - timedelta(minutes=5),
        attempt_id=7,
    )
    submission_snapshot = _GenerationSubmissionSnapshot(
        id=601,
        generation_id=101,
        generation_attempt_id=7,
        account_id=501,
        provider_job_id="job-601",
        status="success",
        submitted_at=now - timedelta(minutes=4),
        responded_at=now - timedelta(minutes=3),
        response={"status": "processing"},
    )

    generation_model = SimpleNamespace(
        id=101,
        status=GenerationStatus.PROCESSING,
        deferred_action=None,
    )
    submission_model = SimpleNamespace(
        id=601,
        provider_job_id="job-601",
        status="success",
        response={"status": "processing"},
    )
    account_model = _FakeAccount(501, current_processing_jobs=2)
    db = _FakeDB(
        generations={101: generation_model},
        submissions={601: submission_model},
        accounts={501: account_model},
    )
    _install_shared_patches(monkeypatch, db)

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return submission_snapshot, submission_snapshot, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)

    _FakeProviderService.status_result = SimpleNamespace(
        status=ProviderStatus.COMPLETED,
        progress=1.0,
        metadata={"provider_status": "done"},
        duration_sec=12.0,
        error_message=None,
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["completed"] == 1
    assert result["failed"] == 0
    assert result["still_processing"] == 0
    assert _FakeGenerationService.instance is not None
    assert _FakeGenerationService.instance.completed == [(101, 9001)]
    assert _FakeAccountService.instance is not None
    assert _FakeAccountService.instance.released == [501]
    assert _FakeProviderService.instance is not None
    assert _FakeProviderService.instance.check_status_calls[0]["operation_type"] == OperationType.TEXT_TO_VIDEO


@pytest.mark.asyncio
async def test_poll_job_statuses_provider_error_keeps_generation_processing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=202,
        account_id=502,
        operation_type=OperationType.IMAGE_TO_VIDEO,
        started_at=now - timedelta(minutes=2),
        attempt_id=1,
    )
    submission_snapshot = _GenerationSubmissionSnapshot(
        id=602,
        generation_id=202,
        generation_attempt_id=1,
        account_id=502,
        provider_job_id="job-602",
        status="success",
        submitted_at=now - timedelta(minutes=1),
        responded_at=None,
        response={},
    )

    db = _FakeDB(
        generations={
            202: SimpleNamespace(
                id=202,
                status=GenerationStatus.PROCESSING,
                deferred_action=None,
            )
        },
        submissions={602: SimpleNamespace(id=602, provider_job_id="job-602", status="success", response={})},
        accounts={502: _FakeAccount(502, current_processing_jobs=1)},
    )
    _install_shared_patches(monkeypatch, db)

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return submission_snapshot, submission_snapshot, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)

    _FakeProviderService.status_error = ProviderError("temporary provider outage")

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["completed"] == 0
    # Non-transient provider errors are retried with backoff first.
    assert result["failed"] == 0
    assert result["still_processing"] == 1
    assert _FakeGenerationService.instance is not None
    assert _FakeGenerationService.instance.failed == []
    assert _FakeAccountService.instance is not None
    assert _FakeAccountService.instance.released == []


@pytest.mark.asyncio
async def test_poll_job_statuses_missing_current_submission_timeout_uses_snapshot_started_at(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=303,
        account_id=None,
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=now - timedelta(minutes=30),
        attempt_id=5,
    )
    latest_submission_any_attempt = _GenerationSubmissionSnapshot(
        id=703,
        generation_id=303,
        generation_attempt_id=4,
        account_id=777,
        provider_job_id=None,
        status="error",
        submitted_at=now - timedelta(minutes=31),
        responded_at=now - timedelta(minutes=31),
        response={"error": "old attempt"},
    )

    # Deliberately conflicting ORM state: started_at=None here, but snapshot has old started_at.
    generation_model = SimpleNamespace(id=303, status=GenerationStatus.PROCESSING, started_at=None)
    account_model = _FakeAccount(777, current_processing_jobs=2)
    db = _FakeDB(
        generations={303: generation_model},
        submissions={},
        accounts={777: account_model},
    )
    _install_shared_patches(monkeypatch, db)

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return None, latest_submission_any_attempt, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)
    _FakeProviderService.status_result = SimpleNamespace(
        status=ProviderStatus.PROCESSING,
        progress=0.5,
        metadata={},
        duration_sec=None,
        error_message=None,
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["failed"] == 1
    assert result["still_processing"] == 0
    assert _FakeGenerationService.instance is not None
    assert len(_FakeGenerationService.instance.failed) == 1
    assert _FakeGenerationService.instance.failed[0][0] == 303
    assert _FakeGenerationService.instance.failed[0][2] == "provider_unavailable"
    assert account_model.current_processing_jobs == 1


@pytest.mark.asyncio
async def test_poll_job_statuses_stale_unsubmitted_error_submission_skips_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=404,
        account_id=808,
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=now,
        attempt_id=2,
    )
    submission_snapshot = _GenerationSubmissionSnapshot(
        id=804,
        generation_id=404,
        generation_attempt_id=2,
        account_id=808,
        provider_job_id=None,
        status="error",
        submitted_at=now - timedelta(minutes=4),
        responded_at=now - timedelta(minutes=3),
        response={"error": "submit failure"},
    )

    generation_model = SimpleNamespace(id=404, status=GenerationStatus.PROCESSING, started_at=None)
    db = _FakeDB(
        generations={404: generation_model},
        submissions={},
        accounts={808: _FakeAccount(808, current_processing_jobs=1)},
        submission_count=1,
        previous_valid_row=None,
    )
    _install_shared_patches(monkeypatch, db)

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return submission_snapshot, submission_snapshot, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)

    _FakeProviderService.status_result = SimpleNamespace(
        status=ProviderStatus.PROCESSING,
        progress=0.1,
        metadata={},
        duration_sec=None,
        error_message=None,
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["failed"] == 0
    assert result["still_processing"] == 1
    assert _FakeGenerationService.instance is not None
    assert _FakeGenerationService.instance.failed == []
    assert _FakeProviderService.instance is not None
    assert _FakeProviderService.instance.check_status_calls == []


@pytest.mark.asyncio
async def test_poll_job_statuses_early_cdn_completion_refreshes_credits_and_schedules_recheck(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=505,
        account_id=5051,
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=now - timedelta(minutes=5),
        attempt_id=1,
    )
    submission_snapshot = _GenerationSubmissionSnapshot(
        id=705,
        generation_id=505,
        generation_attempt_id=1,
        account_id=5051,
        provider_job_id="job-705",
        status="success",
        submitted_at=now - timedelta(minutes=4),
        responded_at=now - timedelta(minutes=3),
        response={"status": "processing"},
    )

    generation_model = SimpleNamespace(
        id=505,
        status=GenerationStatus.PROCESSING,
        deferred_action=None,
        attempt_id=1,
        operation_type=OperationType.TEXT_TO_VIDEO,
    )
    submission_model = SimpleNamespace(
        id=705,
        provider_job_id="job-705",
        status="success",
        response={"status": "processing"},
        provider_id="pixverse",
    )
    db = _FakeDB(
        generations={505: generation_model},
        submissions={705: submission_model},
        accounts={5051: _FakeAccount(5051, current_processing_jobs=1)},
    )
    _install_shared_patches(monkeypatch, db)

    class _VideoAssetService:
        def __init__(self, _db, _user_service) -> None:
            self.db = _db

        async def create_from_submission(self, submission, generation):
            return SimpleNamespace(
                id=9101,
                media_type=SimpleNamespace(value="video"),
                media_metadata={},
                user_id=321,
                remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/early.mp4",
            )

    refresh_calls: list[tuple[tuple, dict]] = []

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 1}

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return submission_snapshot, submission_snapshot, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "AssetService", _VideoAssetService)
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )
    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)

    _FakeProviderService.status_result = SimpleNamespace(
        status=ProviderStatus.COMPLETED,
        progress=1.0,
        metadata={
            "provider_status": "done",
            "video_early_cdn_terminal": True,
            "video_original_status": "processing",
        },
        duration_sec=12.0,
        error_message=None,
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["completed"] == 1
    assert len(refresh_calls) == 1  # credits refreshed immediately (no longer skipped)
    assert 9101 in status_poller._moderation_recheck
    (
        provider_job_id,
        account_id,
        deadline_mono,
        gen_id,
        attempt,
        op_type,
        provider_id,
    ) = status_poller._moderation_recheck[9101]
    assert provider_job_id == "job-705"
    assert account_id == 5051
    assert gen_id == 505
    assert attempt == 0
    assert op_type == OperationType.TEXT_TO_VIDEO
    assert provider_id == "pixverse"
    assert 20 <= (deadline_mono - time.monotonic()) <= 40


@pytest.mark.asyncio
async def test_poll_job_statuses_moderation_recheck_filtered_refreshes_credits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    asset_id = 9202
    account_id = 6201
    generation_id = 5202
    provider_job_id = "job-9202"
    now = datetime.now(timezone.utc)

    asset_model = SimpleNamespace(
        id=asset_id,
        remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/flagged.mp4",
        media_metadata={},
        user_id=456,
    )
    db = _FakeDB(
        generations={},
        submissions={},
        accounts={account_id: _FakeAccount(account_id, current_processing_jobs=0)},
        assets={asset_id: asset_model},
    )
    _install_shared_patches(monkeypatch, db)

    async def _fake_load_processing_generations(_db):
        return []

    async def _fake_publish(*args, **kwargs):
        published.append((args, kwargs))

    class _FakeRecheckProvider:
        async def moderation_recheck(self, **_kw):
            return ModerationRecheckResult(outcome="flagged", should_refresh_credits=True)

    provider = _FakeRecheckProvider()
    published: list[tuple[tuple, dict]] = []
    refresh_calls: list[tuple[tuple, dict]] = []

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        if kwargs.get("db") is not None:
            await kwargs["db"].commit()
        return {"web": 5}

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller.event_bus, "publish", _fake_publish)
    monkeypatch.setattr(status_poller, "flag_modified", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        status_poller,
        "_provider_registry",
        SimpleNamespace(get=lambda _provider_id: provider),
    )
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )

    status_poller._moderation_recheck[asset_id] = (
        provider_job_id,
        account_id,
        time.monotonic() - 1.0,
        generation_id,
        0,
        OperationType.TEXT_TO_VIDEO,
        "pixverse",
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 0
    assert asset_model.media_metadata.get("provider_flagged") is True
    assert asset_model.media_metadata.get("provider_flagged_reason") == "post_delivery_moderation"
    assert len(published) == 1
    assert len(refresh_calls) == 1
    assert refresh_calls[0][1].get("success_log_event") == "moderation_recheck_credits_refreshed"
    assert refresh_calls[0][1].get("failure_log_event") == "moderation_recheck_credit_refresh_failed"
    assert refresh_calls[0][1].get("success_log_fields", {}).get("asset_id") == asset_id
    assert asset_id not in status_poller._moderation_recheck


@pytest.mark.asyncio
async def test_poll_job_statuses_early_cdn_filtered_marks_badge_publishes_and_refreshes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=506,
        account_id=5061,
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=now - timedelta(minutes=5),
        attempt_id=1,
    )
    submission_snapshot = _GenerationSubmissionSnapshot(
        id=706,
        generation_id=506,
        generation_attempt_id=1,
        account_id=5061,
        provider_job_id="job-706",
        status="success",
        submitted_at=now - timedelta(minutes=4),
        responded_at=now - timedelta(minutes=3),
        response={"status": "processing"},
    )

    generation_model = SimpleNamespace(
        id=506,
        status=GenerationStatus.PROCESSING,
        deferred_action=None,
        attempt_id=1,
        operation_type=OperationType.TEXT_TO_VIDEO,
    )
    submission_model = SimpleNamespace(
        id=706,
        provider_job_id="job-706",
        status="success",
        response={"status": "processing"},
        provider_id="pixverse",
    )
    db = _FakeDB(
        generations={506: generation_model},
        submissions={706: submission_model},
        accounts={5061: _FakeAccount(5061, current_processing_jobs=1)},
    )
    _install_shared_patches(monkeypatch, db)

    created_assets: list[SimpleNamespace] = []
    published: list[tuple[tuple, dict]] = []
    refresh_calls: list[tuple[tuple, dict]] = []

    class _VideoAssetService:
        def __init__(self, _db, _user_service) -> None:
            self.db = _db

        async def create_from_submission(self, submission, generation):
            asset = SimpleNamespace(
                id=9102,
                media_type=SimpleNamespace(value="video"),
                media_metadata={},
                user_id=654,
                remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/early-filtered.mp4",
            )
            created_assets.append(asset)
            return asset

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 1}

    async def _fake_publish(*args, **kwargs):
        published.append((args, kwargs))

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return submission_snapshot, submission_snapshot, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "AssetService", _VideoAssetService)
    monkeypatch.setattr(status_poller.event_bus, "publish", _fake_publish)
    monkeypatch.setattr(status_poller, "flag_modified", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )
    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)

    _FakeProviderService.status_result = SimpleNamespace(
        status=ProviderStatus.COMPLETED,
        progress=1.0,
        metadata={
            "provider_status": "done",
            "video_early_cdn_terminal": True,
            "video_original_status": "filtered",
        },
        duration_sec=12.0,
        error_message=None,
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["completed"] == 1
    assert len(refresh_calls) == 1  # credits refreshed immediately
    assert len(created_assets) == 1
    assert created_assets[0].media_metadata.get("provider_flagged") is True
    assert created_assets[0].media_metadata.get("provider_flagged_reason") == "early_cdn_filtered"
    assert len(published) == 1
    assert published[0][0][0] == status_poller.ASSET_UPDATED
    assert published[0][0][1]["asset_id"] == 9102
    assert published[0][0][1]["user_id"] == 654
    assert published[0][0][1]["reason"] == "moderation_flagged"


@pytest.mark.asyncio
async def test_poll_job_statuses_non_early_video_completion_refreshes_immediately_and_uses_default_recheck_delay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    now = datetime.now(timezone.utc)
    generation_snapshot = _ProcessingGenerationSnapshot(
        id=507,
        account_id=5071,
        operation_type=OperationType.TEXT_TO_VIDEO,
        started_at=now - timedelta(minutes=5),
        attempt_id=1,
    )
    submission_snapshot = _GenerationSubmissionSnapshot(
        id=707,
        generation_id=507,
        generation_attempt_id=1,
        account_id=5071,
        provider_job_id="job-707",
        status="success",
        submitted_at=now - timedelta(minutes=4),
        responded_at=now - timedelta(minutes=3),
        response={"status": "processing"},
    )

    generation_model = SimpleNamespace(
        id=507,
        status=GenerationStatus.PROCESSING,
        deferred_action=None,
        attempt_id=1,
        operation_type=OperationType.TEXT_TO_VIDEO,
    )
    submission_model = SimpleNamespace(
        id=707,
        provider_job_id="job-707",
        status="success",
        response={"status": "processing"},
        provider_id="pixverse",
    )
    db = _FakeDB(
        generations={507: generation_model},
        submissions={707: submission_model},
        accounts={5071: _FakeAccount(5071, current_processing_jobs=1)},
    )
    _install_shared_patches(monkeypatch, db)

    refresh_calls: list[tuple[tuple, dict]] = []
    published: list[tuple[tuple, dict]] = []

    class _VideoAssetService:
        def __init__(self, _db, _user_service) -> None:
            self.db = _db

        async def create_from_submission(self, submission, generation):
            return SimpleNamespace(
                id=9103,
                media_type=SimpleNamespace(value="video"),
                media_metadata={},
                user_id=777,
                remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/non-early.mp4",
            )

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 3}

    async def _fake_publish(*args, **kwargs):
        published.append((args, kwargs))

    async def _fake_load_processing_generations(_db):
        return [generation_snapshot]

    async def _fake_select_submission(_db, _generation):
        return submission_snapshot, submission_snapshot, generation_snapshot.attempt_id

    monkeypatch.setattr(status_poller, "AssetService", _VideoAssetService)
    monkeypatch.setattr(status_poller.event_bus, "publish", _fake_publish)
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )
    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller, "_select_current_attempt_submission", _fake_select_submission)

    _FakeProviderService.status_result = SimpleNamespace(
        status=ProviderStatus.COMPLETED,
        progress=1.0,
        metadata={"provider_status": "done"},
        duration_sec=9.0,
        error_message=None,
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 1
    assert result["completed"] == 1
    assert len(refresh_calls) == 1
    assert published == []
    assert 9103 in status_poller._moderation_recheck
    _entry = status_poller._moderation_recheck[9103]
    assert _entry[0] == "job-707"
    assert _entry[1] == 5071
    assert _entry[3] == 507
    assert _entry[4] == 0
    assert _entry[5] == OperationType.TEXT_TO_VIDEO
    assert _entry[6] == "pixverse"
    assert 80 <= (_entry[2] - time.monotonic()) <= 100


@pytest.mark.asyncio
async def test_poll_job_statuses_moderation_recheck_cdn_ok_skips_provider_and_credit_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    asset_id = 9303
    account_id = 6303
    generation_id = 5303
    provider_job_id = "job-9303"

    asset_model = SimpleNamespace(
        id=asset_id,
        remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/cdn-ok.mp4",
        media_metadata={},
        user_id=999,
    )
    db = _FakeDB(
        generations={},
        submissions={},
        accounts={account_id: _FakeAccount(account_id, current_processing_jobs=0)},
        assets={asset_id: asset_model},
    )
    _install_shared_patches(monkeypatch, db)

    refresh_calls: list[tuple[tuple, dict]] = []

    async def _fake_load_processing_generations(_db):
        return []

    class _OkProvider:
        async def moderation_recheck(self, **_kw):
            return ModerationRecheckResult(outcome="ok")

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 1}

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(
        status_poller,
        "_provider_registry",
        SimpleNamespace(get=lambda _provider_id: _OkProvider()),
    )
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )

    status_poller._moderation_recheck[asset_id] = (
        provider_job_id,
        account_id,
        time.monotonic() - 1.0,
        generation_id,
        0,
        OperationType.TEXT_TO_VIDEO,
        "pixverse",
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 0
    assert refresh_calls == []
    assert asset_id in status_poller._moderation_recheck
    _entry = status_poller._moderation_recheck[asset_id]
    assert _entry[0] == provider_job_id
    assert _entry[1] == account_id
    assert _entry[3] == generation_id
    assert _entry[4] == 1
    assert _entry[5] == OperationType.TEXT_TO_VIDEO
    assert _entry[6] == "pixverse"
    assert 160 <= (_entry[2] - time.monotonic()) <= 200


@pytest.mark.asyncio
async def test_poll_job_statuses_moderation_recheck_filtered_placeholder_only_still_flags_and_refreshes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    asset_id = 9404
    account_id = 6404
    generation_id = 5404
    provider_job_id = "job-9404"

    asset_model = SimpleNamespace(
        id=asset_id,
        remote_url="https://media.pixverse.ai/pixverse-preview/mp4/media/default.mp4",
        media_metadata={},
        user_id=111,
    )
    db = _FakeDB(
        generations={},
        submissions={},
        accounts={account_id: _FakeAccount(account_id, current_processing_jobs=0)},
        assets={asset_id: asset_model},
    )
    _install_shared_patches(monkeypatch, db)

    published: list[tuple[tuple, dict]] = []
    refresh_calls: list[tuple[tuple, dict]] = []

    async def _fake_load_processing_generations(_db):
        return []

    async def _fake_publish(*args, **kwargs):
        published.append((args, kwargs))

    class _FakeRecheckProvider:
        async def moderation_recheck(self, **_kw):
            return ModerationRecheckResult(outcome="flagged", should_refresh_credits=True)

    provider = _FakeRecheckProvider()

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 1}

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller.event_bus, "publish", _fake_publish)
    monkeypatch.setattr(status_poller, "flag_modified", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        status_poller,
        "_provider_registry",
        SimpleNamespace(get=lambda _provider_id: provider),
    )
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )

    status_poller._moderation_recheck[asset_id] = (
        provider_job_id,
        account_id,
        time.monotonic() - 1.0,
        generation_id,
        0,
        OperationType.TEXT_TO_VIDEO,
        "pixverse",
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 0
    assert asset_model.media_metadata.get("provider_flagged") is True
    assert asset_model.media_metadata.get("provider_flagged_reason") == "post_delivery_moderation"
    assert len(published) == 1
    assert len(refresh_calls) == 1
    assert refresh_calls[0][1].get("success_log_event") == "moderation_recheck_credits_refreshed"
    assert asset_id not in status_poller._moderation_recheck


@pytest.mark.asyncio
async def test_poll_job_statuses_moderation_recheck_already_flagged_still_refreshes_without_duplicate_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reset_fakes()
    asset_id = 9505
    account_id = 6505
    generation_id = 5505
    provider_job_id = "job-9505"

    asset_model = SimpleNamespace(
        id=asset_id,
        remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/already-flagged.mp4",
        media_metadata={
            "provider_flagged": True,
            "provider_flagged_reason": "early_cdn_filtered",
        },
        user_id=222,
    )
    db = _FakeDB(
        generations={},
        submissions={},
        accounts={account_id: _FakeAccount(account_id, current_processing_jobs=0)},
        assets={asset_id: asset_model},
    )
    _install_shared_patches(monkeypatch, db)

    published: list[tuple[tuple, dict]] = []
    refresh_calls: list[tuple[tuple, dict]] = []

    async def _fake_load_processing_generations(_db):
        return []

    async def _fake_publish(*args, **kwargs):
        published.append((args, kwargs))

    class _FakeRecheckProvider:
        async def moderation_recheck(self, **_kw):
            return ModerationRecheckResult(outcome="flagged", should_refresh_credits=True)

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 7}

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller.event_bus, "publish", _fake_publish)
    monkeypatch.setattr(
        status_poller,
        "_provider_registry",
        SimpleNamespace(get=lambda _provider_id: _FakeRecheckProvider()),
    )
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )

    status_poller._moderation_recheck[asset_id] = (
        provider_job_id,
        account_id,
        time.monotonic() - 1.0,
        generation_id,
        0,
        OperationType.TEXT_TO_VIDEO,
        "pixverse",
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 0
    assert asset_model.media_metadata.get("provider_flagged") is True
    assert asset_model.media_metadata.get("provider_flagged_reason") == "early_cdn_filtered"
    assert published == []
    assert len(refresh_calls) == 1
    assert refresh_calls[0][1].get("success_log_event") == "moderation_recheck_credits_refreshed"
    assert asset_id not in status_poller._moderation_recheck


@pytest.mark.asyncio
async def test_poll_job_statuses_moderation_recheck_filtered_triggers_flag_and_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Flagged recheck on an unflagged asset stamps provider_flagged and refreshes credits."""
    _reset_fakes()
    asset_id = 9606
    account_id = 6606
    generation_id = 5606
    provider_job_id = "job-9606"

    asset_model = SimpleNamespace(
        id=asset_id,
        remote_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/video.mp4",
        media_metadata={},
        user_id=333,
    )
    db = _FakeDB(
        generations={},
        submissions={},
        accounts={account_id: _FakeAccount(account_id, current_processing_jobs=0)},
        assets={asset_id: asset_model},
    )
    _install_shared_patches(monkeypatch, db)

    published: list[tuple[tuple, dict]] = []
    refresh_calls: list[tuple[tuple, dict]] = []

    async def _fake_load_processing_generations(_db):
        return []

    async def _fake_publish(*args, **kwargs):
        published.append((args, kwargs))

    class _FakeRecheckProvider:
        async def moderation_recheck(self, **_kw):
            return ModerationRecheckResult(outcome="flagged", should_refresh_credits=True)

    async def _spy_refresh_best_effort(*args, **kwargs):
        refresh_calls.append((args, kwargs))
        return {"web": 9}

    monkeypatch.setattr(status_poller, "_load_processing_generation_snapshots", _fake_load_processing_generations)
    monkeypatch.setattr(status_poller.event_bus, "publish", _fake_publish)
    monkeypatch.setattr(status_poller, "flag_modified", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        status_poller,
        "_provider_registry",
        SimpleNamespace(get=lambda _provider_id: _FakeRecheckProvider()),
    )
    monkeypatch.setattr(
        status_poller,
        "refresh_account_credits_best_effort",
        _spy_refresh_best_effort,
    )

    status_poller._moderation_recheck[asset_id] = (
        provider_job_id,
        account_id,
        time.monotonic() - 1.0,
        generation_id,
        0,
        OperationType.TEXT_TO_VIDEO,
        "pixverse",
    )

    result = await status_poller.poll_job_statuses({})

    assert result["checked"] == 0
    assert asset_model.media_metadata.get("provider_flagged") is True
    assert asset_model.media_metadata.get("provider_flagged_reason") == "post_delivery_moderation"
    assert len(published) == 1
    assert published[0][0][0] == status_poller.ASSET_UPDATED
    assert published[0][0][1]["asset_id"] == asset_id
    assert len(refresh_calls) == 1
    assert refresh_calls[0][1].get("success_log_event") == "moderation_recheck_credits_refreshed"
    assert asset_id not in status_poller._moderation_recheck
