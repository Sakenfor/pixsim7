"""
Error classification helpers for the generation job processor.

Extracted from job_processor.py to keep the main processing pipeline focused
on orchestration while error-handling logic lives here.
"""
from pixsim7.backend.main.shared.errors import (
    ProviderAuthenticationError,
    ProviderContentFilteredError,
    ProviderQuotaExceededError,
    ProviderRateLimitError,
    ProviderConcurrentLimitError,
    NoAccountAvailableError,
    AccountExhaustedError,
    AccountCooldownError,
)

# Expected errors that don't need stack traces - these are business logic, not bugs
EXPECTED_ERRORS = (
    ProviderAuthenticationError,
    ProviderContentFilteredError,
    ProviderQuotaExceededError,
    ProviderRateLimitError,
    ProviderConcurrentLimitError,
    NoAccountAvailableError,
    AccountExhaustedError,
    AccountCooldownError,
)

# Errors that should NOT trigger ARQ retry - these are permanent failures
# (validation errors, configuration issues, etc. that won't be fixed by retry)
NON_RETRYABLE_ERROR_PATTERNS = (
    "requires at least one",  # Missing required params (image_url, video_url, etc.)
    "is required for",  # Missing required params
    "is not valid for",  # Invalid param format
    "must contain",  # Validation failure
    "has no resolvable",  # Asset resolution failure
    "needs to be re-uploaded",  # Asset needs manual intervention
    "invalid param",  # Provider rejected param as invalid (400 error)
    "invalid parameter",  # Alternative wording
    "too-long parameters",  # Prompt/param length exceeded (e.g. Pixverse 400018)
    "cannot exceed",  # Generic length limit exceeded
)


def _is_non_retryable_error(error: Exception) -> bool:
    """Check if an error should NOT be retried by ARQ.

    Primary path: use the structured `retryable` attribute on ProviderError.
    Fallback: string pattern matching for plain exceptions or legacy errors
    without structured attributes.
    """
    # Structured path: ProviderError subclasses carry .retryable
    if hasattr(error, 'retryable'):
        return not error.retryable

    # Fallback: string pattern matching for unstructured errors
    error_msg = str(error).lower()
    for pattern in NON_RETRYABLE_ERROR_PATTERNS:
        if pattern.lower() in error_msg:
            return True
    return False


def _extract_error_code(error: Exception) -> str | None:
    """Extract structured error_code from an exception, if available."""
    return getattr(error, 'error_code', None)


def _is_auth_rotation_error(error: Exception) -> bool:
    """
    Return True when a provider error should rotate to a different account.

    Covers structured auth errors plus Pixverse session-invalid signals that may
    surface as generic ProviderError messages.
    """
    if isinstance(error, ProviderAuthenticationError):
        return True

    error_code = _extract_error_code(error)
    if error_code == "provider_auth":
        return True

    message = str(error).lower()
    session_markers = (
        "10005",
        "10003",
        "10002",
        "logged in elsewhere",
        "logged_elsewhere",
        "user is not login",
        "token is expired",
        "session expired",
        "authentication failed for provider",
    )
    return any(marker in message for marker in session_markers)


import os


def _get_max_tries() -> int:
    """Get ARQ max_tries setting."""
    return int(os.getenv("ARQ_MAX_TRIES", "3"))


def _is_final_try(ctx: dict) -> bool:
    """Check if this is the final ARQ try (no more retries after this)."""
    job_try = ctx.get("job_try", 1)
    max_tries = _get_max_tries()
    return job_try >= max_tries
