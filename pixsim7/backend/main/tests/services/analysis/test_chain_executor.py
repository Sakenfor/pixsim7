"""Tests for the shared chain executor — first_success strategy with provenance."""

import pytest

from pixsim7.backend.main.services.analysis.analyzer_pipeline import AnalyzerPipelineError
from pixsim7.backend.main.services.analysis.chain_executor import (
    ChainStrategy,
    execute_first_success,
)
from pixsim7.backend.main.services.analysis.error_taxonomy import AnalyzerErrorCategory
from pixsim7.backend.main.shared.errors import (
    InvalidOperationError,
    ProviderNotFoundError,
    ProviderRateLimitError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_step_fn(results: dict):
    """Create a step function that returns results or raises errors by analyzer_id."""

    async def step_fn(analyzer_id: str):
        value = results[analyzer_id]
        if isinstance(value, Exception):
            raise value
        return value

    return step_fn


# ---------------------------------------------------------------------------
# First success — happy paths
# ---------------------------------------------------------------------------


class TestFirstSuccessHappyPath:
    @pytest.mark.asyncio
    async def test_first_candidate_succeeds(self):
        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=_make_step_fn({"a": "ok_a", "b": "ok_b"}),
        )

        assert result.success is True
        assert result.result == "ok_a"
        assert result.selected_analyzer_id == "a"
        assert len(result.steps) == 1
        assert result.steps[0].success is True

    @pytest.mark.asyncio
    async def test_second_candidate_succeeds_after_first_fails(self):
        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=_make_step_fn({
                "a": InvalidOperationError("no provider"),
                "b": "ok_b",
            }),
        )

        assert result.success is True
        assert result.result == "ok_b"
        assert result.selected_analyzer_id == "b"
        assert len(result.steps) == 2
        assert result.steps[0].success is False
        assert result.steps[0].error_category == AnalyzerErrorCategory.INVALID_INPUT
        assert result.steps[1].success is True

    @pytest.mark.asyncio
    async def test_skips_multiple_failures_to_reach_success(self):
        result = await execute_first_success(
            candidates=["a", "b", "c"],
            step_fn=_make_step_fn({
                "a": AnalyzerPipelineError("not found"),
                "b": ProviderNotFoundError("missing-llm"),
                "c": "ok_c",
            }),
        )

        assert result.success is True
        assert result.selected_analyzer_id == "c"
        assert len(result.steps) == 3


# ---------------------------------------------------------------------------
# First success — failure paths
# ---------------------------------------------------------------------------


class TestFirstSuccessFailurePath:
    @pytest.mark.asyncio
    async def test_all_candidates_fail(self):
        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=_make_step_fn({
                "a": InvalidOperationError("no provider a"),
                "b": InvalidOperationError("no provider b"),
            }),
        )

        assert result.success is False
        assert result.result is None
        assert result.selected_analyzer_id is None
        assert len(result.steps) == 2

    @pytest.mark.asyncio
    async def test_empty_candidates_returns_failure(self):
        result = await execute_first_success(
            candidates=[],
            step_fn=_make_step_fn({}),
        )

        assert result.success is False
        assert len(result.steps) == 0

    @pytest.mark.asyncio
    async def test_error_summary_includes_all_failures(self):
        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=_make_step_fn({
                "a": InvalidOperationError("err_a"),
                "b": InvalidOperationError("err_b"),
            }),
        )

        assert "a:" in result.error_summary
        assert "b:" in result.error_summary


# ---------------------------------------------------------------------------
# Chain stopping behaviour
# ---------------------------------------------------------------------------


class TestChainStopping:
    @pytest.mark.asyncio
    async def test_transient_error_stops_chain(self):
        """Transient errors should NOT try next — the same analyzer may succeed on retry."""
        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=_make_step_fn({
                "a": ProviderRateLimitError("p"),
                "b": "ok_b",
            }),
        )

        assert result.success is False
        assert len(result.steps) == 1  # stopped at a, did not try b
        assert result.steps[0].error_category == AnalyzerErrorCategory.TRANSIENT

    @pytest.mark.asyncio
    async def test_invalid_input_continues_chain(self):
        """Invalid input errors should try next candidate."""
        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=_make_step_fn({
                "a": AnalyzerPipelineError("wrong target"),
                "b": "ok_b",
            }),
        )

        assert result.success is True
        assert result.selected_analyzer_id == "b"
        assert len(result.steps) == 2


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


class TestDeduplication:
    @pytest.mark.asyncio
    async def test_duplicate_candidates_are_skipped(self):
        call_count = 0

        async def counting_step(analyzer_id: str):
            nonlocal call_count
            call_count += 1
            return f"ok_{analyzer_id}"

        result = await execute_first_success(
            candidates=["a", "a", "a"],
            step_fn=counting_step,
        )

        assert result.success is True
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_duplicate_after_failure_is_skipped(self):
        call_count = {"a": 0, "b": 0}

        async def step(analyzer_id: str):
            call_count[analyzer_id] += 1
            if analyzer_id == "a":
                raise InvalidOperationError("fail")
            return "ok"

        result = await execute_first_success(
            candidates=["a", "b", "a"],
            step_fn=step,
        )

        assert result.success is True
        assert result.selected_analyzer_id == "b"
        assert call_count["a"] == 1  # not called again


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------


class TestProvenance:
    @pytest.mark.asyncio
    async def test_step_outcomes_carry_error_categories(self):
        result = await execute_first_success(
            candidates=["a", "b", "c"],
            step_fn=_make_step_fn({
                "a": AnalyzerPipelineError("not found"),
                "b": ProviderNotFoundError("missing"),
                "c": "ok_c",
            }),
        )

        assert result.steps[0].error_category == AnalyzerErrorCategory.INVALID_INPUT
        assert result.steps[1].error_category == AnalyzerErrorCategory.PROVIDER_UNAVAILABLE
        assert result.steps[2].error_category is None
        assert result.steps[2].success is True
