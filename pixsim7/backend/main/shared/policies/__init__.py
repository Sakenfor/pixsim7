"""
Execution policies for resilience patterns.

Provides reusable policies for handling transient failures and resource cycling.

Usage:
    from pixsim7.backend.main.shared.policies import (
        # Retry policy - retry same operation with backoff
        with_retry,
        RetryConfig,
        is_retryable_http_status,

        # Fallback policy - cycle through resources until one works
        with_fallback,
        FallbackConfig,
        FallbackExhaustedError,
    )

    # Retry an API call
    result = await with_retry(
        lambda: client.post(url),
        config=RetryConfig(max_attempts=3, backoff_base=1.0),
    )

    # Cycle through accounts until one has credits
    account = await with_fallback(
        acquire=lambda: get_next_account(),
        verify=lambda a: a.credits > 0,
        on_reject=lambda a: mark_exhausted(a.id),
    )
"""

from pixsim7.backend.main.shared.policies.retry import (
    RetryConfig,
    with_retry,
    with_retry_sync,
    is_retryable_http_status,
)

from pixsim7.backend.main.shared.policies.fallback import (
    FallbackConfig,
    FallbackExhaustedError,
    with_fallback,
    with_fallback_sync,
)

__all__ = [
    # Retry
    "RetryConfig",
    "with_retry",
    "with_retry_sync",
    "is_retryable_http_status",
    # Fallback
    "FallbackConfig",
    "FallbackExhaustedError",
    "with_fallback",
    "with_fallback_sync",
]
