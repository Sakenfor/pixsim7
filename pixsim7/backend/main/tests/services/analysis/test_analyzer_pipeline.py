import pytest

from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
    AnalyzerDefinitionRequest,
    AnalyzerExecutionRequest,
    AnalyzerPipelineError,
    resolve_analyzer_definition,
    resolve_analyzer_execution,
)
from pixsim7.backend.main.services.prompt.parser import AnalyzerTarget


def test_resolve_analyzer_definition_validates_target_and_canonicalizes():
    resolved = resolve_analyzer_definition(
        AnalyzerDefinitionRequest(
            analyzer_id="llm:local",
            target=AnalyzerTarget.PROMPT,
            require_enabled=True,
        )
    )

    assert resolved.analyzer_id == "prompt:local"
    assert resolved.analyzer.target == AnalyzerTarget.PROMPT


def test_resolve_analyzer_execution_prompt_llm_uses_analyzer_provider_and_user_model_when_provider_matches():
    resolved = resolve_analyzer_execution(
        AnalyzerExecutionRequest(
            analyzer_id="prompt:local",
            target=AnalyzerTarget.PROMPT,
            user_llm_provider_id="local",
            user_llm_model_id="my-local-model",
            require_provider=True,
        )
    )

    assert resolved.provider_id == "local-llm"
    assert resolved.model_id == "my-local-model"


def test_resolve_analyzer_execution_asset_uses_fallback_provider():
    resolved = resolve_analyzer_execution(
        AnalyzerExecutionRequest(
            analyzer_id="asset:object-detection",
            target=AnalyzerTarget.ASSET,
            fallback_provider_id="vision-provider-x",
            require_provider=True,
        )
    )

    assert resolved.analyzer_id == "asset:object-detection"
    assert resolved.provider_id == "vision-provider-x"


def test_resolve_analyzer_execution_raises_when_provider_required_and_missing():
    with pytest.raises(AnalyzerPipelineError) as exc_info:
        resolve_analyzer_execution(
            AnalyzerExecutionRequest(
                analyzer_id="asset:object-detection",
                target=AnalyzerTarget.ASSET,
                require_provider=True,
            )
        )

    assert "no resolved provider" in exc_info.value.message
