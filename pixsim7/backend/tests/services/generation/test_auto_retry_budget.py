"""
Tests for auto-retry budget guards.

Verifies that retry eligibility uses retry_count (actual error retries)
rather than attempt_id (which also counts non-error transitions like
concurrent waits and adaptive defers).
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from pixsim7.backend.main.domain.enums import GenerationStatus, GenerationErrorCode
from pixsim7.backend.main.services.generation.retry import GenerationRetryService

_SETTINGS_PATH = "pixsim7.backend.main.services.generation.generation_settings.GenerationSettings.get"


def _make_generation(
    *,
    status: str = "failed",
    error_message: str = "content filtered (output)",
    error_code: str | None = GenerationErrorCode.CONTENT_FILTERED.value,
    retry_count: int = 0,
    attempt_id: int = 0,
    id: int = 1,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        status=GenerationStatus(status),
        error_message=error_message,
        error_code=error_code,
        retry_count=retry_count,
        attempt_id=attempt_id,
    )


def _patch_max_attempts(n: int = 20):
    return patch(_SETTINGS_PATH, return_value=SimpleNamespace(auto_retry_max_attempts=n))


# ---------------------------------------------------------------------------
# should_auto_retry — retry_count vs attempt_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_should_retry_when_attempt_id_high_but_retry_count_low():
    """Concurrent waits inflate attempt_id without incrementing retry_count.
    Auto-retry must still allow retries in this scenario."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(retry_count=2, attempt_id=50)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is True


@pytest.mark.asyncio
async def test_should_not_retry_when_retry_count_at_max():
    """When retry_count reaches the configured max, auto-retry must stop."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(retry_count=20, attempt_id=20)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is False


@pytest.mark.asyncio
async def test_should_not_retry_when_retry_count_exceeds_max():
    """Safety: stop when retry_count is above max (edge case)."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(retry_count=25, attempt_id=80)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is False


@pytest.mark.asyncio
async def test_attempt_id_alone_does_not_block_retry():
    """Even with attempt_id well above the max, retry_count=0 must allow retry."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(retry_count=0, attempt_id=100)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is True


# ---------------------------------------------------------------------------
# should_auto_retry — error classification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_retryable_error_code_rejected():
    """Non-retryable error codes must be rejected regardless of counts."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(
        retry_count=0,
        attempt_id=0,
        error_code=GenerationErrorCode.CONTENT_PROMPT_REJECTED.value,
    )

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is False


@pytest.mark.asyncio
async def test_non_failed_status_rejected():
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(status="completed", retry_count=0, attempt_id=5)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is False


@pytest.mark.asyncio
async def test_no_error_message_rejected():
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(retry_count=0, attempt_id=0, error_message=None)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is False


# ---------------------------------------------------------------------------
# should_auto_retry — retryable error codes (with high attempt_id)
# ---------------------------------------------------------------------------

_RETRYABLE_CODES = [
    GenerationErrorCode.CONTENT_OUTPUT_REJECTED,
    GenerationErrorCode.CONTENT_IMAGE_REJECTED,
    GenerationErrorCode.CONTENT_FILTERED,
    GenerationErrorCode.PROVIDER_QUOTA,
    GenerationErrorCode.PROVIDER_RATE_LIMIT,
    GenerationErrorCode.PROVIDER_TIMEOUT,
    GenerationErrorCode.PROVIDER_UNAVAILABLE,
    GenerationErrorCode.PROVIDER_GENERIC,
]


@pytest.mark.asyncio
@pytest.mark.parametrize("code", _RETRYABLE_CODES, ids=lambda c: c.value)
async def test_retryable_error_codes_allow_retry_despite_high_attempt_id(code):
    """All retryable error codes must pass when retry_count is low,
    even if attempt_id is high from concurrent waits."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(error_code=code.value, retry_count=0, attempt_id=30)

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is True


# ---------------------------------------------------------------------------
# should_auto_retry — string pattern fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fallback_string_pattern_retryable():
    """Legacy generations without error_code use string pattern matching."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(
        error_code=None,
        error_message="content filter triggered on output",
        retry_count=3,
        attempt_id=40,
    )

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is True


@pytest.mark.asyncio
async def test_fallback_string_pattern_non_retryable():
    """Non-retryable string pattern must block retry even with low retry_count."""
    svc = GenerationRetryService(AsyncMock(), creation_service=AsyncMock())
    gen = _make_generation(
        error_code=None,
        error_message="content filtered (prompt)",
        retry_count=0,
        attempt_id=0,
    )

    with _patch_max_attempts(20):
        assert await svc.should_auto_retry(gen) is False
