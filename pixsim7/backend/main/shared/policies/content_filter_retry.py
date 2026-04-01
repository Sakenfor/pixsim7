"""
Shared content-filter retry policy used by generation worker and auto-retry.

This module intentionally contains only pure constants/helpers so both retry
paths can import it without introducing service or ORM dependencies.
"""
import logging

logger = logging.getLogger(__name__)


def _ws():
    """Lazy accessor for GenerationWorkerSettings singleton."""
    from pixsim7.backend.main.services.generation.worker_settings import get_worker_settings
    return get_worker_settings()


def max_submit_content_filter_retries() -> int:
    return int(_ws().content_filter_submit_max_retries)


def _content_filter_rotate_after_retries() -> int:
    return int(_ws().content_filter_rotate_after_retries)


def _content_filter_pinned_yield_after_retries() -> int:
    return int(_ws().content_filter_pinned_yield_after_retries)


def _content_filter_retry_defer_seconds() -> int:
    return int(_ws().content_filter_retry_defer_seconds)


def _content_filter_pinned_yield_defer_multiplier() -> int:
    return int(_ws().content_filter_pinned_yield_defer_multiplier)


def _content_filter_yield_counts_as_retry() -> bool:
    return bool(_ws().content_filter_yield_counts_as_retry)


def _content_filter_yield_counter_ttl_seconds() -> int:
    return int(_ws().content_filter_yield_counter_ttl_seconds)


def should_rotate_content_filter_account(current_retries: int | None) -> bool:
    """Return True when a content-filter retry should rotate accounts."""
    return (current_retries or 0) >= _content_filter_rotate_after_retries()


def should_yield_pinned_content_filter_retry(current_retries: int | None) -> bool:
    """Return True when a pinned generation should consider yielding."""
    return (current_retries or 0) >= _content_filter_pinned_yield_after_retries()


def content_filter_yield_defer_seconds() -> int:
    """Standard defer duration for pinned content-filter yielding."""
    return _content_filter_retry_defer_seconds() * _content_filter_pinned_yield_defer_multiplier()


def content_filter_yield_counts_as_retry() -> bool:
    """Whether fairness-only yields should consume retry_count."""
    return _content_filter_yield_counts_as_retry()


def content_filter_max_yields() -> int:
    """Configured cap for fairness-only yields (0 disables the cap)."""
    return int(_ws().content_filter_max_yields)


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
        await redis.expire(key, _content_filter_yield_counter_ttl_seconds())
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
