"""
Shared content-filter retry policy used by generation worker and auto-retry.

This module intentionally contains only pure constants/helpers so both retry
paths can import it without introducing service or ORM dependencies.
"""
import logging

from pixsim7.backend.main.shared.config import settings

logger = logging.getLogger(__name__)

# Submit-time content filter retries (handled directly in job_processor)
MAX_SUBMIT_CONTENT_FILTER_RETRIES = settings.content_filter_submit_max_retries

# After this many content-filter retries, non-pinned generations should clear
# account affinity so account selection can rotate to a different account.
CONTENT_FILTER_ROTATE_AFTER_RETRIES = settings.content_filter_rotate_after_retries

# Pinned generations should start yielding early when siblings are queued on the
# same account so multiple jobs don't hammer one account in lockstep.
CONTENT_FILTER_PINNED_YIELD_AFTER_RETRIES = settings.content_filter_pinned_yield_after_retries

# Defer timings for pinned-yield behavior
CONTENT_FILTER_RETRY_DEFER_SECONDS = settings.content_filter_retry_defer_seconds
CONTENT_FILTER_PINNED_YIELD_DEFER_MULTIPLIER = settings.content_filter_pinned_yield_defer_multiplier
CONTENT_FILTER_YIELD_COUNTS_AS_RETRY = settings.content_filter_yield_counts_as_retry
CONTENT_FILTER_MAX_YIELDS = settings.content_filter_max_yields
CONTENT_FILTER_YIELD_COUNTER_TTL_SECONDS = settings.content_filter_yield_counter_ttl_seconds


def should_rotate_content_filter_account(current_retries: int | None) -> bool:
    """Return True when a content-filter retry should rotate accounts."""
    return (current_retries or 0) >= CONTENT_FILTER_ROTATE_AFTER_RETRIES


def should_yield_pinned_content_filter_retry(current_retries: int | None) -> bool:
    """Return True when a pinned generation should consider yielding."""
    return (current_retries or 0) >= CONTENT_FILTER_PINNED_YIELD_AFTER_RETRIES


def content_filter_yield_defer_seconds() -> int:
    """Standard defer duration for pinned content-filter yielding."""
    return CONTENT_FILTER_RETRY_DEFER_SECONDS * CONTENT_FILTER_PINNED_YIELD_DEFER_MULTIPLIER


def content_filter_yield_counts_as_retry() -> bool:
    """Whether fairness-only yields should consume retry_count."""
    return bool(CONTENT_FILTER_YIELD_COUNTS_AS_RETRY)


def content_filter_max_yields() -> int:
    """Configured cap for fairness-only yields (0 disables the cap)."""
    return int(CONTENT_FILTER_MAX_YIELDS)


def _yield_counter_key(generation_id: int) -> str:
    return f"generation:{generation_id}:content_filter_yield_count"


async def try_acquire_content_filter_yield(generation_id: int) -> tuple[bool, int]:
    """
    Increment fairness-yield counter and enforce cap.

    Returns:
        (allowed, yield_count_after_increment)
    """
    max_yields = content_filter_max_yields()
    if max_yields <= 0:
        return True, 0

    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis = await get_redis()
        key = _yield_counter_key(generation_id)
        new_count = await redis.incr(key)
        await redis.expire(key, CONTENT_FILTER_YIELD_COUNTER_TTL_SECONDS)
        return new_count <= max_yields, int(new_count)
    except Exception as exc:
        # Fail open: fairness should not block retries if Redis is unavailable.
        logger.warning(
            "content_filter_yield_counter_error",
            generation_id=generation_id,
            error=str(exc),
        )
        return True, 0


async def reset_content_filter_yield_counter(generation_id: int) -> None:
    """Best-effort reset of fairness-yield counter after a non-yield retry path."""
    if content_filter_max_yields() <= 0:
        return
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis = await get_redis()
        await redis.delete(_yield_counter_key(generation_id))
    except Exception as exc:
        logger.warning(
            "content_filter_yield_counter_reset_error",
            generation_id=generation_id,
            error=str(exc),
        )
