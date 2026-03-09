"""Tests for the shared analyzer capability contract — validation and compatibility."""

import pytest

from pixsim7.backend.main.services.analysis.capability_contract import (
    CapabilityMismatchError,
    CapabilityRequest,
    check_analyzer_capability,
    validate_analyzer_capability,
)
from pixsim7.backend.main.services.analysis.error_taxonomy import (
    AnalyzerErrorCategory,
    classify_analyzer_error,
)
from pixsim7.backend.main.services.prompt.parser.registry import (
    AnalyzerInfo,
    AnalyzerInputModality,
    AnalyzerKind,
    AnalyzerTarget,
    AnalyzerTaskFamily,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_analyzer(
    *,
    id: str = "test:analyzer",
    input_modality: AnalyzerInputModality = AnalyzerInputModality.TEXT,
    task_family: AnalyzerTaskFamily = AnalyzerTaskFamily.PARSE,
    supports_batch: bool = False,
    supports_streaming: bool = False,
    output_schema_id: str | None = None,
) -> AnalyzerInfo:
    return AnalyzerInfo(
        id=id,
        name="Test",
        description="Test analyzer",
        kind=AnalyzerKind.PARSER,
        target=AnalyzerTarget.PROMPT,
        input_modality=input_modality,
        task_family=task_family,
        supports_batch=supports_batch,
        supports_streaming=supports_streaming,
        output_schema_id=output_schema_id,
    )


# ---------------------------------------------------------------------------
# Input modality checks
# ---------------------------------------------------------------------------


class TestModalityValidation:
    def test_exact_match_passes(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.IMAGE)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.IMAGE)
        validate_analyzer_capability(analyzer, request)  # should not raise

    def test_mismatch_raises(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.TEXT)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.IMAGE)
        with pytest.raises(CapabilityMismatchError, match="input"):
            validate_analyzer_capability(analyzer, request)

    def test_multimodal_analyzer_accepts_image(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.MULTIMODAL)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.IMAGE)
        validate_analyzer_capability(analyzer, request)  # should not raise

    def test_multimodal_analyzer_accepts_text(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.MULTIMODAL)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.TEXT)
        validate_analyzer_capability(analyzer, request)  # should not raise

    def test_no_request_modality_passes(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.TEXT)
        request = CapabilityRequest()  # no modality constraint
        validate_analyzer_capability(analyzer, request)  # should not raise

    def test_no_analyzer_modality_passes(self):
        analyzer = _make_analyzer()
        # Force None (bypass inference)
        object.__setattr__(analyzer, "input_modality", None)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.VIDEO)
        validate_analyzer_capability(analyzer, request)  # should not raise


# ---------------------------------------------------------------------------
# Task family checks
# ---------------------------------------------------------------------------


class TestTaskFamilyValidation:
    def test_exact_match_passes(self):
        analyzer = _make_analyzer(task_family=AnalyzerTaskFamily.TAG)
        request = CapabilityRequest(task_family=AnalyzerTaskFamily.TAG)
        validate_analyzer_capability(analyzer, request)

    def test_mismatch_raises(self):
        analyzer = _make_analyzer(task_family=AnalyzerTaskFamily.PARSE)
        request = CapabilityRequest(task_family=AnalyzerTaskFamily.CAPTION)
        with pytest.raises(CapabilityMismatchError, match="output"):
            validate_analyzer_capability(analyzer, request)

    def test_no_request_family_passes(self):
        analyzer = _make_analyzer(task_family=AnalyzerTaskFamily.OCR)
        request = CapabilityRequest()
        validate_analyzer_capability(analyzer, request)


# ---------------------------------------------------------------------------
# Batch / streaming checks
# ---------------------------------------------------------------------------


class TestBatchStreamingValidation:
    def test_batch_required_but_unsupported(self):
        analyzer = _make_analyzer(supports_batch=False)
        request = CapabilityRequest(requires_batch=True)
        with pytest.raises(CapabilityMismatchError, match="batch"):
            validate_analyzer_capability(analyzer, request)

    def test_batch_required_and_supported(self):
        analyzer = _make_analyzer(supports_batch=True)
        request = CapabilityRequest(requires_batch=True)
        validate_analyzer_capability(analyzer, request)

    def test_streaming_required_but_unsupported(self):
        analyzer = _make_analyzer(supports_streaming=False)
        request = CapabilityRequest(requires_streaming=True)
        with pytest.raises(CapabilityMismatchError, match="streaming"):
            validate_analyzer_capability(analyzer, request)

    def test_streaming_required_and_supported(self):
        analyzer = _make_analyzer(supports_streaming=True)
        request = CapabilityRequest(requires_streaming=True)
        validate_analyzer_capability(analyzer, request)


# ---------------------------------------------------------------------------
# Output schema checks
# ---------------------------------------------------------------------------


class TestOutputSchemaValidation:
    def test_exact_match_passes(self):
        analyzer = _make_analyzer(output_schema_id="prompt-analysis-v1")
        request = CapabilityRequest(output_schema_id="prompt-analysis-v1")
        validate_analyzer_capability(analyzer, request)

    def test_mismatch_raises(self):
        analyzer = _make_analyzer(output_schema_id="prompt-analysis-v1")
        request = CapabilityRequest(output_schema_id="asset-analysis-v2")
        with pytest.raises(CapabilityMismatchError, match="output schema"):
            validate_analyzer_capability(analyzer, request)

    def test_no_analyzer_schema_passes(self):
        """Analyzer with no declared schema accepts any request."""
        analyzer = _make_analyzer(output_schema_id=None)
        request = CapabilityRequest(output_schema_id="prompt-analysis-v1")
        validate_analyzer_capability(analyzer, request)

    def test_no_request_schema_passes(self):
        """Request without schema requirement accepts any analyzer."""
        analyzer = _make_analyzer(output_schema_id="prompt-analysis-v1")
        request = CapabilityRequest()
        validate_analyzer_capability(analyzer, request)


# ---------------------------------------------------------------------------
# check_analyzer_capability (non-raising)
# ---------------------------------------------------------------------------


class TestCheckAnalyzerCapability:
    def test_returns_true_on_match(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.TEXT)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.TEXT)
        assert check_analyzer_capability(analyzer, request) is True

    def test_returns_false_on_mismatch(self):
        analyzer = _make_analyzer(input_modality=AnalyzerInputModality.TEXT)
        request = CapabilityRequest(input_modality=AnalyzerInputModality.VIDEO)
        assert check_analyzer_capability(analyzer, request) is False


# ---------------------------------------------------------------------------
# Error taxonomy integration
# ---------------------------------------------------------------------------


class TestCapabilityErrorTaxonomy:
    def test_classified_as_invalid_input(self):
        error = CapabilityMismatchError("test:a", "modality mismatch")
        category = classify_analyzer_error(error)
        assert category == AnalyzerErrorCategory.INVALID_INPUT


# ---------------------------------------------------------------------------
# Pipeline integration: resolve_analyzer_execution with capability
# ---------------------------------------------------------------------------


class TestPipelineCapabilityValidation:
    def test_execution_fails_fast_on_modality_mismatch(self):
        from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
            AnalyzerExecutionRequest,
            resolve_analyzer_execution,
        )

        with pytest.raises(CapabilityMismatchError):
            resolve_analyzer_execution(
                AnalyzerExecutionRequest(
                    analyzer_id="prompt:simple",
                    target=AnalyzerTarget.PROMPT,
                    require_enabled=False,
                    require_provider=False,
                    capability_request=CapabilityRequest(
                        input_modality=AnalyzerInputModality.VIDEO,
                    ),
                )
            )

    def test_execution_passes_with_matching_capability(self):
        from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
            AnalyzerExecutionRequest,
            resolve_analyzer_execution,
        )

        result = resolve_analyzer_execution(
            AnalyzerExecutionRequest(
                analyzer_id="prompt:simple",
                target=AnalyzerTarget.PROMPT,
                require_enabled=False,
                require_provider=False,
                capability_request=CapabilityRequest(
                    input_modality=AnalyzerInputModality.TEXT,
                ),
            )
        )
        assert result.analyzer_id == "prompt:simple"

    def test_execution_passes_without_capability_request(self):
        from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
            AnalyzerExecutionRequest,
            resolve_analyzer_execution,
        )

        result = resolve_analyzer_execution(
            AnalyzerExecutionRequest(
                analyzer_id="prompt:simple",
                target=AnalyzerTarget.PROMPT,
                require_enabled=False,
                require_provider=False,
            )
        )
        assert result.analyzer_id == "prompt:simple"


# ---------------------------------------------------------------------------
# Chain executor integration: mismatch skips to next candidate
# ---------------------------------------------------------------------------


class TestChainCapabilityFallthrough:
    @pytest.mark.asyncio
    async def test_capability_mismatch_tries_next_candidate(self):
        from pixsim7.backend.main.services.analysis.chain_executor import execute_first_success

        async def step_fn(analyzer_id: str):
            if analyzer_id == "a":
                raise CapabilityMismatchError("a", "wrong modality")
            return f"ok_{analyzer_id}"

        result = await execute_first_success(
            candidates=["a", "b"],
            step_fn=step_fn,
        )

        assert result.success is True
        assert result.selected_analyzer_id == "b"
        assert result.steps[0].error_category == AnalyzerErrorCategory.INVALID_INPUT
