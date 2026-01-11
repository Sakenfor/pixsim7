"""
Retry utilities with exponential backoff.

Provides reusable retry logic for network operations, API calls, etc.

Usage:
    from pixsim7.backend.main.shared.policies import with_retry, RetryConfig

    # Simple usage
    result = await with_retry(lambda: client.post(url, data=payload))

    # With custom config
    result = await with_retry(
        lambda: fetch_data(),
        config=RetryConfig(max_attempts=5, backoff_base=2.0),
    )

    # With retry callback for logging
    result = await with_retry(
        lambda: api_call(),
        on_retry=lambda attempt, exc, delay: logger.warning(
            "Retrying", attempt=attempt, error=str(exc), next_delay=delay
        ),
    )

    # Swallow errors on exhaustion (like old webhook behavior)
    result = await with_retry(
        lambda: send_webhook(),
        on_exhausted=lambda exc, attempts: logger.error("Gave up", attempts=attempts),
        raise_on_exhausted=False,
    )
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from typing import (
    Awaitable,
    Callable,
    Optional,
    TypeVar,
    Union,
)

T = TypeVar("T")


@dataclass
class RetryConfig:
    """Configuration for retry behavior.

    Attributes:
        max_attempts: Maximum number of attempts (must be >= 1). Default 3.
        backoff_base: Base delay in seconds for exponential backoff. Default 1.0.
        backoff_max: Maximum delay cap in seconds. Default 30.0.
        backoff_multiplier: Multiplier for exponential growth. Default 2.0.
        jitter: If True, add random jitter to delays (0.5x to 1.5x). Default True.
        retryable: Tuple of exception types to retry on. Default (Exception,).
    """

    max_attempts: int = 3
    backoff_base: float = 1.0
    backoff_max: float = 30.0
    backoff_multiplier: float = 2.0
    jitter: bool = True
    retryable: tuple[type[Exception], ...] = (Exception,)

    def __post_init__(self):
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")


# Common retryable exceptions for HTTP clients
HTTPX_RETRYABLE = (
    "httpx.TimeoutException",
    "httpx.NetworkError",
    "httpx.RemoteProtocolError",
)


def is_retryable_http_status(status_code: int) -> bool:
    """Check if an HTTP status code is retryable.

    Retryable: 429 (rate limit), 5xx (server errors)
    Not retryable: 4xx except 429 (client errors)
    """
    if status_code == 429:
        return True
    if 500 <= status_code < 600:
        return True
    return False


def _compute_delay(attempt: int, config: RetryConfig) -> float:
    """Compute delay for a given attempt number (1-indexed)."""
    # Exponential backoff: base * multiplier^(attempt-1)
    delay = config.backoff_base * (config.backoff_multiplier ** (attempt - 1))

    # Cap at max
    delay = min(delay, config.backoff_max)

    # Add jitter (0.5x to 1.5x)
    if config.jitter:
        delay *= 0.5 + random.random()

    return delay


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    config: Optional[RetryConfig] = None,
    should_retry: Optional[Callable[[Exception], bool]] = None,
    on_retry: Optional[Callable[[int, Exception, float], None]] = None,
    on_exhausted: Optional[Callable[[Exception, int], None]] = None,
    raise_on_exhausted: bool = True,
) -> Optional[T]:
    """
    Execute an async function with retries and exponential backoff.

    Args:
        fn: Async callable to execute. Should raise on failure.
        config: Retry configuration. Uses defaults if None.
        should_retry: Optional predicate to filter which exceptions to retry.
                      If provided, exception must match config.retryable AND
                      should_retry(exc) must return True.
        on_retry: Callback called before each retry sleep.
                  Args: (attempt_number, exception, delay_seconds)
        on_exhausted: Callback called when all retries exhausted.
                      Args: (last_exception, total_attempts)
        raise_on_exhausted: If True (default), raise last exception on exhaustion.
                            If False, return None (caller must handle).

    Returns:
        Result of fn() on success, or None if exhausted and raise_on_exhausted=False.

    Raises:
        Last exception if all retries exhausted and raise_on_exhausted=True.

    Example:
        # Retry with logging
        result = await with_retry(
            lambda: client.post(url),
            config=RetryConfig(max_attempts=3),
            on_retry=lambda a, e, d: logger.warning(f"Retry {a}, waiting {d:.1f}s"),
        )

        # Retry only on specific conditions
        result = await with_retry(
            lambda: api_call(),
            should_retry=lambda e: isinstance(e, HTTPError) and e.status >= 500,
        )
    """
    if config is None:
        config = RetryConfig()

    last_exception: Optional[Exception] = None

    for attempt in range(1, config.max_attempts + 1):
        try:
            return await fn()

        except config.retryable as exc:
            last_exception = exc

            # Check custom retry predicate
            if should_retry is not None and not should_retry(exc):
                # Not retryable per custom logic - raise immediately
                raise

            # Check if we have more attempts
            if attempt >= config.max_attempts:
                break

            # Compute delay and notify
            delay = _compute_delay(attempt, config)
            if on_retry is not None:
                on_retry(attempt, exc, delay)

            await asyncio.sleep(delay)

    # All attempts exhausted
    if on_exhausted is not None and last_exception is not None:
        on_exhausted(last_exception, config.max_attempts)

    if raise_on_exhausted and last_exception is not None:
        raise last_exception

    return None


def with_retry_sync(
    fn: Callable[[], T],
    config: Optional[RetryConfig] = None,
    should_retry: Optional[Callable[[Exception], bool]] = None,
    on_retry: Optional[Callable[[int, Exception, float], None]] = None,
    on_exhausted: Optional[Callable[[Exception, int], None]] = None,
    raise_on_exhausted: bool = True,
) -> Optional[T]:
    """
    Synchronous version of with_retry.

    Same API as with_retry but for sync functions. Uses time.sleep instead of asyncio.sleep.
    """
    import time

    if config is None:
        config = RetryConfig()

    last_exception: Optional[Exception] = None

    for attempt in range(1, config.max_attempts + 1):
        try:
            return fn()

        except config.retryable as exc:
            last_exception = exc

            if should_retry is not None and not should_retry(exc):
                raise

            if attempt >= config.max_attempts:
                break

            delay = _compute_delay(attempt, config)
            if on_retry is not None:
                on_retry(attempt, exc, delay)

            time.sleep(delay)

    if on_exhausted is not None and last_exception is not None:
        on_exhausted(last_exception, config.max_attempts)

    if raise_on_exhausted and last_exception is not None:
        raise last_exception

    return None


__all__ = [
    "RetryConfig",
    "with_retry",
    "with_retry_sync",
    "is_retryable_http_status",
]
