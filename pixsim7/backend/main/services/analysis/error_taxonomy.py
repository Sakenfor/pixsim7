"""
Shared Error Taxonomy — analyzer error classification and retry guidance.

Phase 2 of the analyzer shared-kernel consolidation plan
(work item: ``kernel-chain-executor``).

Maps the existing PixSim error hierarchy into a small set of categories
that drive two decisions:

  1. **Chain continuation**: should the chain executor try the next
     analyzer candidate, or stop?
  2. **Worker retry**: should the worker retry the same analyzer later?
"""

from __future__ import annotations

from enum import Enum

from pixsim7.backend.main.services.analysis.analyzer_pipeline import AnalyzerPipelineError
from pixsim7.backend.main.services.analysis.capability_contract import CapabilityMismatchError
from pixsim7.backend.main.shared.errors import (
    InvalidOperationError,
    ProviderAuthenticationError,
    ProviderConcurrentLimitError,
    ProviderContentFilteredError,
    ProviderError,
    ProviderNotFoundError,
    ProviderQuotaExceededError,
    ProviderRateLimitError,
    UnsupportedOperationError,
    ValidationError,
    AccountCooldownError,
    AccountExhaustedError,
)


class AnalyzerErrorCategory(Enum):
    """Normalized error categories for analyzer execution."""

    TRANSIENT = "transient"
    AUTH = "auth"
    QUOTA = "quota"
    INVALID_INPUT = "invalid_input"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    CONTENT_FILTERED = "content_filtered"
    UNKNOWN = "unknown"


# Ordered from most specific to least specific.
# First match wins, so subclasses must come before parent classes.
_ERROR_CATEGORY_MAP: list[tuple[type, AnalyzerErrorCategory]] = [
    (ProviderRateLimitError, AnalyzerErrorCategory.TRANSIENT),
    (ProviderConcurrentLimitError, AnalyzerErrorCategory.TRANSIENT),
    (AccountCooldownError, AnalyzerErrorCategory.TRANSIENT),
    (ProviderAuthenticationError, AnalyzerErrorCategory.AUTH),
    (ProviderQuotaExceededError, AnalyzerErrorCategory.QUOTA),
    (AccountExhaustedError, AnalyzerErrorCategory.QUOTA),
    (ProviderNotFoundError, AnalyzerErrorCategory.PROVIDER_UNAVAILABLE),
    (UnsupportedOperationError, AnalyzerErrorCategory.PROVIDER_UNAVAILABLE),
    (ProviderContentFilteredError, AnalyzerErrorCategory.CONTENT_FILTERED),
    (CapabilityMismatchError, AnalyzerErrorCategory.INVALID_INPUT),
    (AnalyzerPipelineError, AnalyzerErrorCategory.INVALID_INPUT),
    (InvalidOperationError, AnalyzerErrorCategory.INVALID_INPUT),
    (ValidationError, AnalyzerErrorCategory.INVALID_INPUT),
]


def classify_analyzer_error(error: Exception) -> AnalyzerErrorCategory:
    """
    Classify an exception into an ``AnalyzerErrorCategory``.

    Uses isinstance checks in specificity order so that subclasses
    (e.g. ``ProviderRateLimitError``) are matched before parents
    (e.g. ``ProviderError``).
    """
    for error_type, category in _ERROR_CATEGORY_MAP:
        if isinstance(error, error_type):
            return category

    # Fall back to retryable flag on generic ProviderError.
    if isinstance(error, ProviderError):
        if getattr(error, "retryable", False):
            return AnalyzerErrorCategory.TRANSIENT
        return AnalyzerErrorCategory.UNKNOWN

    return AnalyzerErrorCategory.UNKNOWN


def should_try_next_in_chain(category: AnalyzerErrorCategory) -> bool:
    """
    Whether the chain executor should advance to the next candidate.

    Returns ``False`` for categories where trying another analyzer
    will not help:
      * ``TRANSIENT`` — same analyzer may succeed on retry.
      * ``CONTENT_FILTERED`` — input-specific; a different analyzer
        with the same input will likely hit the same filter.
    """
    return category not in {
        AnalyzerErrorCategory.TRANSIENT,
        AnalyzerErrorCategory.CONTENT_FILTERED,
    }


def is_retryable(category: AnalyzerErrorCategory) -> bool:
    """Whether a worker should retry the same analyzer later."""
    return category == AnalyzerErrorCategory.TRANSIENT
