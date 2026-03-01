from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from pixsim7.backend.main.workers.status_poller import (
    _is_stale_unsubmitted_error_submission,
    _map_submit_error_to_generation_error_code,
    _submission_is_likely_current_attempt,
    _submission_matches_generation_attempt,
)


def test_is_stale_unsubmitted_error_submission_true_when_new_attempt_started_after_submit_error() -> None:
    now = datetime.now(timezone.utc)
    generation = SimpleNamespace(started_at=now)
    submission = SimpleNamespace(
        submitted_at=now - timedelta(seconds=10),
        responded_at=now - timedelta(seconds=8),
        response={
            "error": "Concurrent generation limit reached for provider 'pixverse'",
            "error_type": "ProviderConcurrentLimitError",
        },
    )

    assert _is_stale_unsubmitted_error_submission(generation, submission) is True


def test_is_stale_unsubmitted_error_submission_false_when_submission_matches_current_attempt() -> None:
    now = datetime.now(timezone.utc)
    generation = SimpleNamespace(started_at=now - timedelta(seconds=10))
    submission = SimpleNamespace(
        submitted_at=now - timedelta(seconds=5),
        responded_at=now - timedelta(seconds=2),
        response={
            "error": "Concurrent generation limit reached for provider 'pixverse'",
            "error_type": "ProviderConcurrentLimitError",
        },
    )

    assert _is_stale_unsubmitted_error_submission(generation, submission) is False


def test_map_submit_error_to_generation_error_code_maps_concurrent_limit_error_type() -> None:
    submission = SimpleNamespace(
        response={
            "error": "Concurrent generation limit reached for provider 'pixverse'",
            "error_type": "ProviderConcurrentLimitError",
        }
    )

    assert _map_submit_error_to_generation_error_code(submission) == "provider_concurrent_limit"


def test_submission_matches_generation_attempt_true_when_marker_matches_started_at() -> None:
    started_at = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
    generation = SimpleNamespace(started_at=started_at)
    submission = SimpleNamespace(
        response={"generation_attempt_started_at": started_at.isoformat()}
    )

    assert _submission_matches_generation_attempt(generation, submission) is True


def test_submission_matches_generation_attempt_false_when_marker_differs() -> None:
    generation = SimpleNamespace(started_at=datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc))
    submission = SimpleNamespace(
        response={
            "generation_attempt_started_at": datetime(
                2026,
                3,
                1,
                11,
                59,
                59,
                tzinfo=timezone.utc,
            ).isoformat()
        }
    )

    assert _submission_matches_generation_attempt(generation, submission) is False


def test_submission_is_likely_current_attempt_true_when_attempt_ids_match() -> None:
    generation = SimpleNamespace(
        attempt_id=3,
        started_at=datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc),
    )
    submission = SimpleNamespace(
        generation_attempt_id=3,
        submitted_at=datetime(2026, 3, 1, 12, 0, 1, tzinfo=timezone.utc),
        responded_at=None,
        response={},
    )

    assert _submission_is_likely_current_attempt(generation, submission) is True


def test_submission_is_likely_current_attempt_false_when_attempt_ids_differ() -> None:
    generation = SimpleNamespace(
        attempt_id=4,
        started_at=datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc),
    )
    submission = SimpleNamespace(
        generation_attempt_id=3,
        submitted_at=datetime(2026, 3, 1, 12, 0, 1, tzinfo=timezone.utc),
        responded_at=None,
        response={},
    )

    assert _submission_is_likely_current_attempt(generation, submission) is False
