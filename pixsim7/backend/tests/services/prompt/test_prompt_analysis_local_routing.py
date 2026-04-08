from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.prompt import parser as prompt_parser
from pixsim7.backend.main.services.prompt.analysis import PromptAnalysisService
from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService
from pixsim7.backend.main.services.prompt.llm_resolution import normalize_llm_provider_id
from pixsim7.backend.main.services.prompt.parser import (
    analyzer_registry,
    analyze_prompt_with_llm,
)
from pixsim7.backend.main.shared.errors import ProviderError


def test_analyzer_registry_has_local_analyzer():
    analyzer = analyzer_registry.get("prompt:local")

    assert analyzer is not None
    assert analyzer.provider_id == "local-llm"


def test_local_provider_normalization():
    assert normalize_llm_provider_id("local") == "local-llm"
    assert normalize_llm_provider_id("local-llm") == "local-llm"


@pytest.mark.asyncio
async def test_prompt_analysis_routes_local_analyzer_to_local_provider(monkeypatch):
    service = PromptAnalysisService(db=None)
    monkeypatch.setattr(
        AiHubService,
        "get_user_llm_preferences",
        AsyncMock(return_value=(None, None)),
    )

    captured = {}

    async def _fake_analyze_prompt_with_llm(**kwargs):
        captured.update(kwargs)
        return {"prompt": kwargs["text"], "candidates": []}

    monkeypatch.setattr(prompt_parser, "analyze_prompt_with_llm", _fake_analyze_prompt_with_llm)

    result, selected_id, provenance = await service._run_analyzer("sample prompt", ["prompt:local"])
    assert result["prompt"] == "sample prompt"
    assert captured["provider_id"] == "local-llm"
    assert selected_id == "prompt:local"
    assert provenance.analyzer_id == "prompt:local"
    assert provenance.provider_id == "local-llm"


@pytest.mark.asyncio
async def test_local_provider_error_falls_back_to_simple_parser(monkeypatch):
    class _FailingProvider:
        async def edit_prompt(self, **kwargs):
            _ = kwargs
            raise ProviderError("local provider failure")

    from pixsim7.backend.main.services.llm.registry import llm_registry

    monkeypatch.setattr(llm_registry, "get", lambda provider_id: _FailingProvider())
    result = await analyze_prompt_with_llm(
        text="Point of view close up shot.",
        provider_id="local-llm",
        model_id="smollm2-1.7b",
    )

    assert "candidates" in result
    assert isinstance(result["candidates"], list)
