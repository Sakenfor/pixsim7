"""
Tests for _plan_pinned_concurrent_defer() in worker_concurrency.

Verifies that concurrent waits:
- Never set increment_retry=True (don't consume retry budget)
- Enforce the max wait limit (stop condition)
- Apply sibling yield multiplier when fresher siblings exist
- Use adaptive defer when recommended
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from pixsim7.backend.main.workers.worker_concurrency import (
    _plan_pinned_concurrent_defer,
    MAX_PINNED_CONCURRENT_RETRIES,
    PINNED_YIELD_THRESHOLD_RATIO,
    PINNED_YIELD_DEFER_MULTIPLIER,
)


class _NoopLogger:
    def info(self, *a, **kw): pass
    def warning(self, *a, **kw): pass
    def debug(self, *a, **kw): pass


def _make_generation(
    id: int = 1,
    preferred_account_id: int | None = 10,
    created_at=None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        preferred_account_id=preferred_account_id,
        created_at=created_at,
    )


def _make_account(id: int = 10, max_concurrent_jobs: int = 5) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        provider_id="pixverse",
        max_concurrent_jobs=max_concurrent_jobs,
    )


# ---------------------------------------------------------------------------
# increment_retry is always False
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_defer_never_increments_retry():
    """Concurrent waits must not consume the error-retry budget."""
    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=5,
            gen_logger=_NoopLogger(),
        )

    assert result["action"] == "defer"
    assert result["increment_retry"] is False


# ---------------------------------------------------------------------------
# Max wait limit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_when_max_waits_exceeded():
    """Generation should stop after exceeding max concurrent waits."""
    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=73,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=0,
            gen_logger=_NoopLogger(),
        )

    assert result["action"] == "stop"
    assert result["stop_reason"] == "max_concurrent_waits_exceeded"


@pytest.mark.asyncio
async def test_defer_at_exact_max_waits():
    """Wait count exactly at max should still defer (stop is strictly >)."""
    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=72,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=0,
            gen_logger=_NoopLogger(),
        )

    assert result["action"] == "defer"


# ---------------------------------------------------------------------------
# Sibling yield multiplier
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sibling_yield_applies_multiplier():
    """When fresher siblings exist and wait_count >= threshold, defer is multiplied."""
    yield_threshold = int(MAX_PINNED_CONCURRENT_RETRIES * PINNED_YIELD_THRESHOLD_RATIO)

    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=yield_threshold,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._count_runnable_pinned_siblings",
        new_callable=AsyncMock,
        return_value={"total_runnable": 3, "fresher_runnable": 2},
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(preferred_account_id=10),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=0,
            gen_logger=_NoopLogger(),
        )

    base_defer = 6 + 1  # cooldown + padding
    expected_yield_defer = base_defer * PINNED_YIELD_DEFER_MULTIPLIER
    assert result["action"] == "defer"
    assert result["defer_seconds"] >= expected_yield_defer
    assert "yield" in result["reason"]
    assert result["increment_retry"] is False


@pytest.mark.asyncio
async def test_no_yield_below_threshold():
    """Below the yield threshold, siblings are not checked."""
    yield_threshold = int(MAX_PINNED_CONCURRENT_RETRIES * PINNED_YIELD_THRESHOLD_RATIO)

    mock_siblings = AsyncMock()
    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=yield_threshold - 1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._count_runnable_pinned_siblings",
        mock_siblings,
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(preferred_account_id=10),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=0,
            gen_logger=_NoopLogger(),
        )

    mock_siblings.assert_not_called()
    assert result["action"] == "defer"
    assert result["reason"] == "pinned_account_concurrent_wait"


@pytest.mark.asyncio
async def test_no_yield_without_fresher_siblings():
    """At threshold, if no fresher siblings exist, use base defer."""
    yield_threshold = int(MAX_PINNED_CONCURRENT_RETRIES * PINNED_YIELD_THRESHOLD_RATIO)

    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=yield_threshold,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._count_runnable_pinned_siblings",
        new_callable=AsyncMock,
        return_value={"total_runnable": 0, "fresher_runnable": 0},
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(preferred_account_id=10),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=0,
            gen_logger=_NoopLogger(),
        )

    base_defer = 6 + 1
    assert result["action"] == "defer"
    assert result["defer_seconds"] == base_defer
    assert result["reason"] == "pinned_account_concurrent_wait"


# ---------------------------------------------------------------------------
# Adaptive defer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_adaptive_defer_overrides_base():
    """When adaptive recommends a longer defer, it takes precedence."""
    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=0,
            gen_logger=_NoopLogger(),
            adaptive_recommended_defer_seconds=120,
        )

    assert result["action"] == "defer"
    assert result["defer_seconds"] == 120
    assert "adaptive" in result["reason"]
    assert result["increment_retry"] is False


# ---------------------------------------------------------------------------
# Redis counter fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redis_counter_unavailable_falls_back_to_retry_count():
    """When Redis counter returns None, use current_retry_count + 1."""
    with patch(
        "pixsim7.backend.main.workers.worker_concurrency._increment_pinned_concurrent_wait_count",
        new_callable=AsyncMock, return_value=None,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._pinned_wait_padding_seconds",
        return_value=1,
    ), patch(
        "pixsim7.backend.main.workers.worker_concurrency._max_pinned_concurrent_waits",
        return_value=72,
    ):
        result = await _plan_pinned_concurrent_defer(
            db=AsyncMock(),
            generation=_make_generation(),
            account=_make_account(),
            concurrent_cooldown_seconds=6,
            current_retry_count=5,
            gen_logger=_NoopLogger(),
        )

    assert result["action"] == "defer"
    assert result["concurrent_wait_count"] == 6  # retry_count(5) + 1
    assert result["increment_retry"] is False
