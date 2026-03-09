import pytest

from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
    AnalyzerDefinitionRequest,
    AnalyzerExecutionRequest,
    AnalyzerPipelineError,
    resolve_analyzer_definition,
    resolve_analyzer_execution,
)
from pixsim7.backend.main.services.prompt.parser import (
    AnalyzerInfo,
    AnalyzerKind,
    AnalyzerTarget,
    analyzer_registry,
)


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


def test_resolve_analyzer_execution_llm_does_not_apply_implicit_provider_fallback(monkeypatch):
    custom_analyzer = AnalyzerInfo(
        id="prompt:custom-missing-provider",
        name="Custom Missing Provider",
        description="test analyzer",
        kind=AnalyzerKind.LLM,
        target=AnalyzerTarget.PROMPT,
        provider_id=None,
        model_id=None,
    )

    monkeypatch.setattr(analyzer_registry, "resolve_legacy", lambda analyzer_id: analyzer_id)
    monkeypatch.setattr(
        analyzer_registry,
        "get",
        lambda analyzer_id: custom_analyzer if analyzer_id == custom_analyzer.id else None,
    )

    with pytest.raises(AnalyzerPipelineError) as exc_info:
        resolve_analyzer_execution(
            AnalyzerExecutionRequest(
                analyzer_id=custom_analyzer.id,
                target=AnalyzerTarget.PROMPT,
                require_provider=True,
            )
        )

    assert "no resolved provider" in exc_info.value.message


def test_resolve_analyzer_execution_llm_uses_normalized_explicit_fallback_when_provided(monkeypatch):
    custom_analyzer = AnalyzerInfo(
        id="prompt:custom-fallback-provider",
        name="Custom Fallback Provider",
        description="test analyzer",
        kind=AnalyzerKind.LLM,
        target=AnalyzerTarget.PROMPT,
        provider_id=None,
        model_id=None,
    )

    monkeypatch.setattr(analyzer_registry, "resolve_legacy", lambda analyzer_id: analyzer_id)
    monkeypatch.setattr(
        analyzer_registry,
        "get",
        lambda analyzer_id: custom_analyzer if analyzer_id == custom_analyzer.id else None,
    )

    resolved = resolve_analyzer_execution(
        AnalyzerExecutionRequest(
            analyzer_id=custom_analyzer.id,
            target=AnalyzerTarget.PROMPT,
            fallback_provider_id="openai",
            require_provider=True,
        )
    )

    assert resolved.provider_id == "openai-llm"
