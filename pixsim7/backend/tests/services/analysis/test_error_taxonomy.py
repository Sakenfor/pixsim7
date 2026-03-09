"""Tests for the shared error taxonomy — error classification and retry guidance."""

import pytest

from pixsim7.backend.main.services.analysis.analyzer_pipeline import AnalyzerPipelineError
from pixsim7.backend.main.services.analysis.error_taxonomy import (
    AnalyzerErrorCategory,
    classify_analyzer_error,
    is_retryable,
    should_try_next_in_chain,
)
from pixsim7.backend.main.shared.errors import (
    AccountCooldownError,
    AccountExhaustedError,
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
)


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


class TestClassifyAnalyzerError:
    """Each error type maps to the expected category."""

    @pytest.mark.parametrize(
        "error, expected",
        [
            (ProviderRateLimitError("p"), AnalyzerErrorCategory.TRANSIENT),
            (ProviderConcurrentLimitError("p"), AnalyzerErrorCategory.TRANSIENT),
            (AccountCooldownError(1, "later"), AnalyzerErrorCategory.TRANSIENT),
            (ProviderAuthenticationError("p"), AnalyzerErrorCategory.AUTH),
            (ProviderQuotaExceededError("p"), AnalyzerErrorCategory.QUOTA),
            (AccountExhaustedError(1, "p"), AnalyzerErrorCategory.QUOTA),
            (ProviderNotFoundError("p"), AnalyzerErrorCategory.PROVIDER_UNAVAILABLE),
            (UnsupportedOperationError("p", "op"), AnalyzerErrorCategory.PROVIDER_UNAVAILABLE),
            (ProviderContentFilteredError("p"), AnalyzerErrorCategory.CONTENT_FILTERED),
            (AnalyzerPipelineError("msg"), AnalyzerErrorCategory.INVALID_INPUT),
            (InvalidOperationError("msg"), AnalyzerErrorCategory.INVALID_INPUT),
            (ValidationError("field", "msg"), AnalyzerErrorCategory.INVALID_INPUT),
        ],
        ids=lambda v: type(v).__name__ if isinstance(v, Exception) else v.value,
    )
    def test_specific_error_types(self, error, expected):
        assert classify_analyzer_error(error) == expected

    def test_generic_retryable_provider_error(self):
        err = ProviderError("msg", retryable=True)
        assert classify_analyzer_error(err) == AnalyzerErrorCategory.TRANSIENT

    def test_generic_non_retryable_provider_error(self):
        err = ProviderError("msg", retryable=False)
        assert classify_analyzer_error(err) == AnalyzerErrorCategory.UNKNOWN

    def test_unknown_exception(self):
        assert classify_analyzer_error(RuntimeError("boom")) == AnalyzerErrorCategory.UNKNOWN


# ---------------------------------------------------------------------------
# Chain continuation
# ---------------------------------------------------------------------------


class TestShouldTryNextInChain:
    """Only transient and content-filtered errors stop chain progression."""

    def test_transient_stops_chain(self):
        assert should_try_next_in_chain(AnalyzerErrorCategory.TRANSIENT) is False

    def test_content_filtered_stops_chain(self):
        assert should_try_next_in_chain(AnalyzerErrorCategory.CONTENT_FILTERED) is False

    @pytest.mark.parametrize(
        "category",
        [
            AnalyzerErrorCategory.AUTH,
            AnalyzerErrorCategory.QUOTA,
            AnalyzerErrorCategory.INVALID_INPUT,
            AnalyzerErrorCategory.PROVIDER_UNAVAILABLE,
            AnalyzerErrorCategory.UNKNOWN,
        ],
    )
    def test_other_categories_continue_chain(self, category):
        assert should_try_next_in_chain(category) is True


# ---------------------------------------------------------------------------
# Retryability
# ---------------------------------------------------------------------------


class TestIsRetryable:
    def test_transient_is_retryable(self):
        assert is_retryable(AnalyzerErrorCategory.TRANSIENT) is True

    @pytest.mark.parametrize(
        "category",
        [
            AnalyzerErrorCategory.AUTH,
            AnalyzerErrorCategory.QUOTA,
            AnalyzerErrorCategory.INVALID_INPUT,
            AnalyzerErrorCategory.PROVIDER_UNAVAILABLE,
            AnalyzerErrorCategory.CONTENT_FILTERED,
            AnalyzerErrorCategory.UNKNOWN,
        ],
    )
    def test_non_transient_not_retryable(self, category):
        assert is_retryable(category) is False
