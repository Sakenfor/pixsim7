"""
Snapshot dataclasses and submission helpers for the status poller.

Holds:

- Lightweight snapshot dataclasses (``_AccountCapacitySnapshot``,
  ``_PendingGenerationSnapshot``, ``_ProcessingGenerationSnapshot``,
  ``_GenerationSubmissionSnapshot``) that decouple the poll loop from
  ORM session lifetime.
- Row→snapshot converters and the canonical submission ``select(...)``.
- Attempt-ownership matchers used to pick the submission belonging to a
  generation's *current* attempt (vs. an older retry's submission).
- Submission-error mapping (``_map_submit_error_to_generation_error_code``)
  and the ``_is_stale_unsubmitted_error_submission`` heuristic.
- The PROCESSING-generation loader.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderSubmission
from pixsim7.backend.main.domain.enums import (
    GenerationErrorCode,
    GenerationStatus,
    OperationType,
)


@dataclass(frozen=True, slots=True)
class _AccountCapacitySnapshot:
    account_id: int
    max_concurrent_jobs: int
    current_processing_jobs: int

    @classmethod
    def from_row(cls, row: tuple[Any, Any, Any]) -> "_AccountCapacitySnapshot | None":
        account_id, max_concurrent_jobs, current_processing_jobs = row
        if account_id is None:
            return None
        return cls(
            account_id=int(account_id),
            max_concurrent_jobs=int(max_concurrent_jobs or 0),
            current_processing_jobs=int(current_processing_jobs or 0),
        )


@dataclass(frozen=True, slots=True)
class _PendingGenerationSnapshot:
    generation_id: int
    updated_at: datetime | None

    @classmethod
    def from_row(cls, row: tuple[Any, Any]) -> "_PendingGenerationSnapshot | None":
        generation_id, updated_at = row
        if generation_id is None:
            return None
        ts: datetime | None = updated_at if isinstance(updated_at, datetime) else None
        return cls(generation_id=int(generation_id), updated_at=ts)


@dataclass(frozen=True, slots=True)
class _ProcessingGenerationSnapshot:
    id: int
    account_id: int | None
    operation_type: OperationType | str | None
    started_at: datetime | None
    attempt_id: int
    deferred_action: str | None = None

    @classmethod
    def from_row(cls, row: tuple[Any, ...]) -> "_ProcessingGenerationSnapshot | None":
        generation_id, account_id, operation_type, started_at, attempt_id = row[:5]
        deferred_action = row[5] if len(row) > 5 else None
        if generation_id is None:
            return None
        started_ts: datetime | None = started_at if isinstance(started_at, datetime) else None
        if started_ts is not None and started_ts.tzinfo is None:
            started_ts = started_ts.replace(tzinfo=timezone.utc)
        parsed_attempt_id = 0
        try:
            parsed_attempt_id = int(attempt_id or 0)
        except Exception:
            parsed_attempt_id = 0
        parsed_account_id: int | None = None
        if account_id is not None:
            try:
                parsed_account_id = int(account_id)
            except Exception:
                parsed_account_id = None
        return cls(
            id=int(generation_id),
            account_id=parsed_account_id,
            operation_type=operation_type,
            started_at=started_ts,
            attempt_id=parsed_attempt_id,
            deferred_action=str(deferred_action) if deferred_action else None,
        )


@dataclass
class _PollGenerationResult:
    generation_id: int
    outcome: str  # 'completed', 'failed', 'still_processing', 'error'
    missing_provider_job: bool = False


@dataclass(frozen=True, slots=True)
class _GenerationSubmissionSnapshot:
    id: int
    generation_id: int | None
    generation_attempt_id: int | None
    account_id: int | None
    provider_job_id: str | None
    status: str | None
    submitted_at: datetime | None
    responded_at: datetime | None
    response: Any

    @classmethod
    def from_row(
        cls,
        row: tuple[Any, Any, Any, Any, Any, Any, Any, Any, Any],
    ) -> "_GenerationSubmissionSnapshot | None":
        (
            submission_id,
            generation_id,
            generation_attempt_id,
            account_id,
            provider_job_id,
            status,
            submitted_at,
            responded_at,
            response,
        ) = row
        if submission_id is None:
            return None

        parsed_generation_id: int | None = None
        if generation_id is not None:
            try:
                parsed_generation_id = int(generation_id)
            except Exception:
                parsed_generation_id = None

        parsed_attempt_id: int | None = None
        if generation_attempt_id is not None:
            try:
                parsed_attempt_id = int(generation_attempt_id)
            except Exception:
                parsed_attempt_id = None

        parsed_account_id: int | None = None
        if account_id is not None:
            try:
                parsed_account_id = int(account_id)
            except Exception:
                parsed_account_id = None

        submitted_ts: datetime | None = submitted_at if isinstance(submitted_at, datetime) else None
        responded_ts: datetime | None = responded_at if isinstance(responded_at, datetime) else None
        provider_job = str(provider_job_id) if provider_job_id is not None else None
        submission_status = str(status) if status is not None else None

        return cls(
            id=int(submission_id),
            generation_id=parsed_generation_id,
            generation_attempt_id=parsed_attempt_id,
            account_id=parsed_account_id,
            provider_job_id=provider_job,
            status=submission_status,
            submitted_at=submitted_ts,
            responded_at=responded_ts,
            response=response,
        )


def _to_account_capacity_snapshots(
    rows: Iterable[tuple[Any, Any, Any]],
) -> list[_AccountCapacitySnapshot]:
    snapshots: list[_AccountCapacitySnapshot] = []
    for row in rows:
        snapshot = _AccountCapacitySnapshot.from_row(row)
        if snapshot is not None:
            snapshots.append(snapshot)
    return snapshots


def _to_pending_generation_snapshots(
    rows: Iterable[tuple[Any, Any]],
) -> list[_PendingGenerationSnapshot]:
    snapshots: list[_PendingGenerationSnapshot] = []
    for row in rows:
        snapshot = _PendingGenerationSnapshot.from_row(row)
        if snapshot is not None:
            snapshots.append(snapshot)
    return snapshots


def _to_processing_generation_snapshots(
    rows: Iterable[tuple[Any, Any, Any, Any, Any]],
) -> list[_ProcessingGenerationSnapshot]:
    snapshots: list[_ProcessingGenerationSnapshot] = []
    for row in rows:
        snapshot = _ProcessingGenerationSnapshot.from_row(row)
        if snapshot is not None:
            snapshots.append(snapshot)
    return snapshots


def _submission_snapshot_query():
    return select(
        ProviderSubmission.id,
        ProviderSubmission.generation_id,
        ProviderSubmission.generation_attempt_id,
        ProviderSubmission.account_id,
        ProviderSubmission.provider_job_id,
        ProviderSubmission.status,
        ProviderSubmission.submitted_at,
        ProviderSubmission.responded_at,
        ProviderSubmission.response,
    )


def _snapshot_age_seconds(updated_at: datetime | None, *, now: datetime) -> float | None:
    if updated_at is None:
        return None
    normalized = updated_at if updated_at.tzinfo is not None else updated_at.replace(tzinfo=timezone.utc)
    return (now - normalized).total_seconds()


def _normalize_for_attempt_compare(value: datetime) -> datetime:
    """Normalize timestamps to naive UTC for robust equality checks."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _parse_submission_attempt_started_at(submission: ProviderSubmission) -> datetime | None:
    """Parse internal attempt ownership marker from submission.response when present."""
    if not isinstance(submission.response, dict):
        return None
    raw = submission.response.get("generation_attempt_started_at")
    if not raw or not isinstance(raw, str):
        return None
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        return None


def _submission_matches_generation_attempt(
    generation: Generation,
    submission: ProviderSubmission,
) -> bool | None:
    """
    Check whether submission belongs to generation's current processing attempt.

    Returns:
      - True: marker exists and matches current attempt
      - False: marker exists and does not match current attempt
      - None: marker unavailable (fallback to timestamp heuristic)
    """
    generation_started_at = getattr(generation, "started_at", None)
    if generation_started_at is None:
        return None

    submission_attempt_started_at = _parse_submission_attempt_started_at(submission)
    if submission_attempt_started_at is None:
        return None

    return (
        _normalize_for_attempt_compare(submission_attempt_started_at)
        == _normalize_for_attempt_compare(generation_started_at)
    )


def _submission_matches_generation_attempt_id(
    generation: Generation,
    submission: ProviderSubmission,
) -> bool | None:
    """Compare numeric generation/submission attempt IDs when both are present."""
    try:
        generation_attempt_id = int(getattr(generation, "attempt_id", 0) or 0)
    except Exception:
        generation_attempt_id = 0

    if generation_attempt_id <= 0:
        return None

    submission_attempt_id = getattr(submission, "generation_attempt_id", None)
    if submission_attempt_id is None:
        return None

    try:
        return int(submission_attempt_id) == generation_attempt_id
    except Exception:
        return None


def _submission_is_likely_current_attempt(
    generation: Generation,
    submission: ProviderSubmission,
) -> bool:
    """
    Best-effort attempt ownership match for mixed-schema deployments.

    Priority:
      1) generation_attempt_id exact match
      2) internal started-at marker match
      3) timestamp heuristic (submission created/responded after current attempt start)
    """
    by_attempt_id = _submission_matches_generation_attempt_id(generation, submission)
    if by_attempt_id is not None:
        return by_attempt_id

    by_marker = _submission_matches_generation_attempt(generation, submission)
    if by_marker is not None:
        return by_marker

    generation_started_at = getattr(generation, "started_at", None)
    if generation_started_at is None:
        return False
    generation_started_norm = _normalize_for_attempt_compare(generation_started_at)

    submission_submitted_at = getattr(submission, "submitted_at", None)
    if submission_submitted_at is not None:
        if _normalize_for_attempt_compare(submission_submitted_at) >= generation_started_norm:
            return True

    submission_responded_at = getattr(submission, "responded_at", None)
    if submission_responded_at is not None:
        if _normalize_for_attempt_compare(submission_responded_at) >= generation_started_norm:
            return True

    return False


async def _select_current_attempt_submission(
    db: AsyncSession,
    generation: _ProcessingGenerationSnapshot,
) -> tuple[_GenerationSubmissionSnapshot | None, _GenerationSubmissionSnapshot | None, int]:
    """
    Select submission owned by generation's active attempt.

    Returns:
      - selected_submission: submission for current attempt (or None)
      - latest_submission_any_attempt: latest submission regardless of attempt (or None)
      - current_attempt_id: generation.attempt_id normalized to int>=0
    """
    try:
        current_attempt_id = int(getattr(generation, "attempt_id", 0) or 0)
    except Exception:
        current_attempt_id = 0

    if current_attempt_id > 0:
        attempt_result = await db.execute(
            _submission_snapshot_query()
            .where(ProviderSubmission.generation_id == generation.id)
            .where(ProviderSubmission.generation_attempt_id == current_attempt_id)
            .order_by(ProviderSubmission.submitted_at.desc())
            .limit(1)
        )
        attempt_row = attempt_result.first()
        attempt_submission = (
            _GenerationSubmissionSnapshot.from_row(tuple(attempt_row))
            if attempt_row is not None
            else None
        )
        if attempt_submission is not None:
            return attempt_submission, attempt_submission, current_attempt_id

    latest_result = await db.execute(
        _submission_snapshot_query()
        .where(ProviderSubmission.generation_id == generation.id)
        .order_by(ProviderSubmission.submitted_at.desc())
        .limit(1)
    )
    latest_row = latest_result.first()
    latest_submission = (
        _GenerationSubmissionSnapshot.from_row(tuple(latest_row))
        if latest_row is not None
        else None
    )
    if latest_submission is None:
        return None, None, current_attempt_id

    if _submission_is_likely_current_attempt(generation, latest_submission):
        return latest_submission, latest_submission, current_attempt_id

    return None, latest_submission, current_attempt_id


def _map_submit_error_to_generation_error_code(submission: ProviderSubmission) -> str | None:
    """Best-effort mapping from submit-time ProviderError type to GenerationErrorCode."""
    if not isinstance(submission.response, dict):
        return None

    error_type = str(submission.response.get("error_type") or "").strip()
    error_text = str(
        submission.response.get("error_message")
        or submission.response.get("error")
        or ""
    ).lower()

    by_type = {
        "ProviderConcurrentLimitError": GenerationErrorCode.PROVIDER_CONCURRENT_LIMIT.value,
        "ProviderRateLimitError": GenerationErrorCode.PROVIDER_RATE_LIMIT.value,
        "ProviderAuthenticationError": GenerationErrorCode.PROVIDER_AUTH.value,
        "ProviderQuotaExceededError": GenerationErrorCode.PROVIDER_QUOTA.value,
    }
    if error_type in by_type:
        return by_type[error_type]

    # Fallback for legacy payloads without explicit error_type.
    if "concurrent generation limit" in error_text or "concurrent limit" in error_text:
        return GenerationErrorCode.PROVIDER_CONCURRENT_LIMIT.value
    if "rate limit" in error_text:
        return GenerationErrorCode.PROVIDER_RATE_LIMIT.value
    if "authentication failed" in error_text or "unauthorized" in error_text:
        return GenerationErrorCode.PROVIDER_AUTH.value
    if "insufficient balance" in error_text or "quota" in error_text:
        return GenerationErrorCode.PROVIDER_QUOTA.value

    return None


def _ensure_aware(dt: datetime | None) -> datetime | None:
    """Normalize a datetime to UTC-aware; return None if input is None."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _is_stale_unsubmitted_error_submission(
    generation: Generation,
    submission: ProviderSubmission,
) -> bool:
    """Return True when this no-job-id error submission predates current processing attempt."""
    generation_started_at = _ensure_aware(getattr(generation, "started_at", None))
    if generation_started_at is None:
        return False

    submission_responded_at = _ensure_aware(getattr(submission, "responded_at", None))
    if submission_responded_at is not None and generation_started_at > submission_responded_at:
        return True

    submission_submitted_at = _ensure_aware(getattr(submission, "submitted_at", None))
    if submission_submitted_at is not None and generation_started_at > submission_submitted_at:
        return True

    return False


async def _load_processing_generation_snapshots(
    db: AsyncSession,
) -> list[_ProcessingGenerationSnapshot]:
    result = await db.execute(
        select(
            Generation.id,
            Generation.account_id,
            Generation.operation_type,
            Generation.started_at,
            Generation.attempt_id,
            Generation.deferred_action,
        )
        .where(Generation.status == GenerationStatus.PROCESSING)
        .order_by(Generation.started_at)
    )
    return _to_processing_generation_snapshots(result.all())
