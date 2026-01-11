"""
Fallback utilities for resource pool cycling.

Provides reusable logic for acquiring resources from a pool where
each resource may fail verification and need to be marked as exhausted.

Usage:
    from pixsim7.backend.main.shared.policies import with_fallback

    # Acquire an account with sufficient credits
    account = await with_fallback(
        acquire=lambda: account_service.select_and_reserve_account(provider_id),
        verify=lambda a: has_sufficient_credits(a),
        on_reject=lambda a: account_service.mark_exhausted(a.id),
        max_attempts=10,
    )

    # With cleanup on reject
    account = await with_fallback(
        acquire=lambda: account_service.select_and_reserve_account(provider_id),
        verify=lambda a: check_credits(a),
        on_reject=lambda a: (
            account_service.release_account(a.id),
            account_service.mark_exhausted(a.id),
        ),
        on_attempt=lambda attempt, resource: logger.info("Trying account", attempt=attempt),
    )
"""

from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass
from typing import (
    Awaitable,
    Callable,
    Generic,
    Optional,
    TypeVar,
    Union,
)

T = TypeVar("T")


class FallbackExhaustedError(Exception):
    """Raised when all fallback attempts are exhausted."""

    def __init__(self, max_attempts: int, last_resource: Optional[object] = None):
        self.max_attempts = max_attempts
        self.last_resource = last_resource
        super().__init__(f"All {max_attempts} fallback attempts exhausted")


@dataclass
class FallbackConfig:
    """Configuration for fallback behavior.

    Attributes:
        max_attempts: Maximum resources to try before giving up. Must be >= 1.
        backoff_base: Base delay in seconds between attempts. Default 0 (no delay).
        backoff_multiplier: Multiplier for exponential backoff. Default 1.0 (constant).
        backoff_max: Maximum delay cap in seconds. Default 10.0.
    """

    max_attempts: int = 10
    backoff_base: float = 0.0
    backoff_multiplier: float = 1.0
    backoff_max: float = 10.0

    def __post_init__(self):
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")


def _compute_delay(attempt: int, config: FallbackConfig) -> float:
    """Compute delay for a given attempt (1-indexed)."""
    if config.backoff_base <= 0:
        return 0.0

    delay = config.backoff_base * (config.backoff_multiplier ** (attempt - 1))
    return min(delay, config.backoff_max)


async def with_fallback(
    acquire: Callable[[], Awaitable[T]],
    verify: Callable[[T], Union[Awaitable[bool], bool]],
    on_reject: Optional[Callable[[T], Union[Awaitable[None], None]]] = None,
    on_attempt: Optional[Callable[[int, T], Union[Awaitable[None], None]]] = None,
    on_exhausted: Optional[Callable[[int, Optional[T]], None]] = None,
    config: Optional[FallbackConfig] = None,
    max_attempts: Optional[int] = None,
    raise_on_exhausted: bool = True,
) -> Optional[T]:
    """
    Acquire a resource from a pool, cycling through until one passes verification.

    This is for "try multiple resources until one works" patterns, NOT for
    retrying the same operation (use `with_retry` for that).

    Args:
        acquire: Async callable that returns the next resource from the pool.
                 Should raise if no more resources available.
        verify: Callable that returns True if resource is usable, False to reject.
                Can be sync or async.
        on_reject: Optional callback when a resource fails verification.
                   Use to release/mark exhausted. Can be sync or async.
        on_attempt: Optional callback at start of each attempt.
                    Args: (attempt_number, resource). Can be sync or async.
        on_exhausted: Optional callback when all attempts exhausted.
                      Args: (total_attempts, last_resource).
        config: Fallback configuration. Uses defaults if None.
        max_attempts: Shorthand for config.max_attempts. Ignored if config provided.
        raise_on_exhausted: If True (default), raise FallbackExhaustedError.
                            If False, return None.

    Returns:
        The first resource that passes verification, or None if exhausted
        and raise_on_exhausted=False.

    Raises:
        FallbackExhaustedError: If all attempts exhausted and raise_on_exhausted=True.
        Exception: Any exception from acquire() is propagated immediately
                   (e.g., NoAccountAvailableError means pool is empty).

    Example:
        # Simple usage
        account = await with_fallback(
            acquire=lambda: account_service.select_and_reserve_account(provider_id),
            verify=lambda a: a.credits > 0,
            on_reject=lambda a: account_service.mark_exhausted(a.id),
        )

        # With logging and cleanup
        account = await with_fallback(
            acquire=lambda: get_next_account(),
            verify=async_verify_credits,
            on_reject=async_release_and_mark,
            on_attempt=lambda n, a: logger.info("Trying", attempt=n, account=a.id),
            config=FallbackConfig(max_attempts=10, backoff_base=0.5),
        )
    """
    if config is None:
        config = FallbackConfig(max_attempts=max_attempts or 10)

    last_resource: Optional[T] = None

    for attempt in range(1, config.max_attempts + 1):
        # Acquire next resource (may raise if pool empty)
        resource = await acquire()
        last_resource = resource

        # Notify attempt start
        if on_attempt is not None:
            result = on_attempt(attempt, resource)
            if inspect.isawaitable(result):
                await result

        # Verify resource
        is_valid = verify(resource)
        if inspect.isawaitable(is_valid):
            is_valid = await is_valid

        if is_valid:
            return resource

        # Resource rejected - notify and maybe delay
        if on_reject is not None:
            result = on_reject(resource)
            if inspect.isawaitable(result):
                await result

        # Backoff before next attempt (if configured and not last attempt)
        if attempt < config.max_attempts:
            delay = _compute_delay(attempt, config)
            if delay > 0:
                await asyncio.sleep(delay)

    # All attempts exhausted
    if on_exhausted is not None:
        on_exhausted(config.max_attempts, last_resource)

    if raise_on_exhausted:
        raise FallbackExhaustedError(config.max_attempts, last_resource)

    return None


def with_fallback_sync(
    acquire: Callable[[], T],
    verify: Callable[[T], bool],
    on_reject: Optional[Callable[[T], None]] = None,
    on_attempt: Optional[Callable[[int, T], None]] = None,
    on_exhausted: Optional[Callable[[int, Optional[T]], None]] = None,
    config: Optional[FallbackConfig] = None,
    max_attempts: Optional[int] = None,
    raise_on_exhausted: bool = True,
) -> Optional[T]:
    """
    Synchronous version of with_fallback.

    Same API but for sync functions. Uses time.sleep instead of asyncio.sleep.
    """
    import time

    if config is None:
        config = FallbackConfig(max_attempts=max_attempts or 10)

    last_resource: Optional[T] = None

    for attempt in range(1, config.max_attempts + 1):
        resource = acquire()
        last_resource = resource

        if on_attempt is not None:
            on_attempt(attempt, resource)

        if verify(resource):
            return resource

        if on_reject is not None:
            on_reject(resource)

        if attempt < config.max_attempts:
            delay = _compute_delay(attempt, config)
            if delay > 0:
                time.sleep(delay)

    if on_exhausted is not None:
        on_exhausted(config.max_attempts, last_resource)

    if raise_on_exhausted:
        raise FallbackExhaustedError(config.max_attempts, last_resource)

    return None


__all__ = [
    "FallbackConfig",
    "FallbackExhaustedError",
    "with_fallback",
    "with_fallback_sync",
]
