"""Tests for the shared result envelope — provenance building and serialization."""

import pytest

from pixsim7.backend.main.services.analysis.chain_executor import (
    ChainResult,
    ChainStepOutcome,
)
from pixsim7.backend.main.services.analysis.error_taxonomy import AnalyzerErrorCategory
from pixsim7.backend.main.services.analysis.result_envelope import (
    AnalyzerProvenance,
    StepTrace,
    build_provenance,
)


# ---------------------------------------------------------------------------
# build_provenance — success paths
# ---------------------------------------------------------------------------


class TestBuildProvenanceSuccess:
    def test_single_step_success(self):
        chain = ChainResult(
            success=True,
            result="ok",
            selected_analyzer_id="a",
            steps=[
                ChainStepOutcome(
                    analyzer_id="a",
                    success=True,
                    result="ok",
                    duration_ms=42.123,
                ),
            ],
            total_duration_ms=42.5,
        )

        prov = build_provenance(chain, provider_id="claude", model_id="sonnet")

        assert prov.analyzer_id == "a"
        assert prov.provider_id == "claude"
        assert prov.model_id == "sonnet"
        assert prov.duration_ms == 42.12
        assert prov.chain_duration_ms == 42.5
        assert prov.fallback_used is False
        assert prov.fallback_depth == 0
        assert prov.error_category is None
        assert len(prov.chain_trace) == 1
        assert prov.chain_trace[0].success is True

    def test_fallback_success(self):
        chain = ChainResult(
            success=True,
            result="ok_b",
            selected_analyzer_id="b",
            steps=[
                ChainStepOutcome(
                    analyzer_id="a",
                    success=False,
                    error=Exception("fail"),
                    error_category=AnalyzerErrorCategory.INVALID_INPUT,
                    duration_ms=10.0,
                ),
                ChainStepOutcome(
                    analyzer_id="b",
                    success=True,
                    result="ok_b",
                    duration_ms=20.0,
                ),
            ],
            total_duration_ms=30.5,
        )

        prov = build_provenance(chain, provider_id="openai", model_id="gpt4")

        assert prov.fallback_used is True
        assert prov.fallback_depth == 1
        assert prov.duration_ms == 20.0
        assert prov.chain_duration_ms == 30.5
        assert len(prov.chain_trace) == 2
        assert prov.chain_trace[0].error_category == "invalid_input"
        assert prov.chain_trace[1].success is True

    def test_multi_fallback_depth(self):
        chain = ChainResult(
            success=True,
            result="ok_c",
            selected_analyzer_id="c",
            steps=[
                ChainStepOutcome(analyzer_id="a", success=False, error=Exception(""), error_category=AnalyzerErrorCategory.PROVIDER_UNAVAILABLE, duration_ms=1.0),
                ChainStepOutcome(analyzer_id="b", success=False, error=Exception(""), error_category=AnalyzerErrorCategory.AUTH, duration_ms=2.0),
                ChainStepOutcome(analyzer_id="c", success=True, result="ok_c", duration_ms=3.0),
            ],
            total_duration_ms=6.5,
        )

        prov = build_provenance(chain)
        assert prov.fallback_depth == 2
        assert prov.fallback_used is True


# ---------------------------------------------------------------------------
# build_provenance — failure paths
# ---------------------------------------------------------------------------


class TestBuildProvenanceFailure:
    def test_all_failed(self):
        chain = ChainResult(
            success=False,
            steps=[
                ChainStepOutcome(
                    analyzer_id="a",
                    success=False,
                    error=Exception("fail"),
                    error_category=AnalyzerErrorCategory.AUTH,
                    duration_ms=5.0,
                ),
            ],
            total_duration_ms=5.5,
        )

        prov = build_provenance(chain)

        assert prov.analyzer_id == "unknown"
        assert prov.error_category == "auth"
        assert prov.duration_ms is None  # no successful step
        assert prov.chain_duration_ms == 5.5

    def test_empty_chain(self):
        chain = ChainResult(success=False, steps=[], total_duration_ms=0.1)

        prov = build_provenance(chain)

        assert prov.analyzer_id == "unknown"
        assert prov.error_category is None
        assert len(prov.chain_trace) == 0


# ---------------------------------------------------------------------------
# AnalyzerProvenance.to_dict — serialization
# ---------------------------------------------------------------------------


class TestProvenanceSerialization:
    def test_omits_none_values(self):
        prov = AnalyzerProvenance(
            analyzer_id="prompt:simple",
            fallback_used=False,
            fallback_depth=0,
        )

        d = prov.to_dict()

        assert "analyzer_id" in d
        assert "provider_id" not in d
        assert "model_id" not in d
        assert "duration_ms" not in d
        assert "error_category" not in d

    def test_includes_all_set_values(self):
        prov = AnalyzerProvenance(
            analyzer_id="prompt:claude",
            provider_id="claude",
            model_id="sonnet",
            duration_ms=100.0,
            chain_duration_ms=150.0,
            fallback_used=True,
            fallback_depth=2,
            chain_trace=[
                StepTrace(analyzer_id="a", success=False, duration_ms=50.0, error_category="auth"),
                StepTrace(analyzer_id="b", success=False, duration_ms=30.0, error_category="quota"),
                StepTrace(analyzer_id="c", success=True, duration_ms=100.0),
            ],
        )

        d = prov.to_dict()

        assert d["analyzer_id"] == "prompt:claude"
        assert d["provider_id"] == "claude"
        assert d["model_id"] == "sonnet"
        assert d["duration_ms"] == 100.0
        assert d["fallback_used"] is True
        assert d["fallback_depth"] == 2
        assert len(d["chain_trace"]) == 3


# ---------------------------------------------------------------------------
# ChainResult new properties
# ---------------------------------------------------------------------------


class TestChainResultProperties:
    def test_fallback_used_true_when_multiple_steps(self):
        chain = ChainResult(
            success=True,
            result="ok",
            selected_analyzer_id="b",
            steps=[
                ChainStepOutcome(analyzer_id="a", success=False),
                ChainStepOutcome(analyzer_id="b", success=True),
            ],
        )
        assert chain.fallback_used is True
        assert chain.fallback_depth == 1

    def test_fallback_used_false_when_first_succeeds(self):
        chain = ChainResult(
            success=True,
            result="ok",
            selected_analyzer_id="a",
            steps=[ChainStepOutcome(analyzer_id="a", success=True)],
        )
        assert chain.fallback_used is False
        assert chain.fallback_depth == 0

    def test_fallback_used_false_on_failure(self):
        chain = ChainResult(success=False, steps=[])
        assert chain.fallback_used is False

    def test_fallback_depth_on_total_failure(self):
        chain = ChainResult(
            success=False,
            steps=[
                ChainStepOutcome(analyzer_id="a", success=False),
                ChainStepOutcome(analyzer_id="b", success=False),
            ],
        )
        assert chain.fallback_depth == 2


# ---------------------------------------------------------------------------
# ChainStepOutcome duration_ms
# ---------------------------------------------------------------------------


class TestStepDuration:
    def test_step_has_duration(self):
        step = ChainStepOutcome(
            analyzer_id="a",
            success=True,
            duration_ms=42.5,
        )
        assert step.duration_ms == 42.5

    def test_step_duration_defaults_none(self):
        step = ChainStepOutcome(analyzer_id="a", success=True)
        assert step.duration_ms is None
