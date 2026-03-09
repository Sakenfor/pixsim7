from types import SimpleNamespace

import pytest

import pixsim7.backend.main.services.llm.ai_hub_service as ai_hub_module
from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService


@pytest.mark.asyncio
async def test_resolve_provider_known_uses_provider_default_model(monkeypatch):
    service = AiHubService(db=None)

    async def _unexpected_default_model(*args, **kwargs):
        raise AssertionError("get_default_model should not be called when provider is known")

    monkeypatch.setattr(ai_hub_module, "get_default_model", _unexpected_default_model)
    monkeypatch.setattr(ai_hub_module.ai_model_registry, "get", lambda model_id: None)

    provider_id, model_id = await service._resolve_provider_and_model(
        provider_id="local-llm",
        model_id=None,
    )

    assert provider_id == "local-llm"
    assert model_id == "smollm2-1.7b"


@pytest.mark.asyncio
async def test_resolve_provider_model_mismatch_prefers_provider(monkeypatch):
    service = AiHubService(db=None)

    monkeypatch.setattr(
        ai_hub_module.ai_model_registry,
        "get",
        lambda model_id: SimpleNamespace(provider_id="openai-llm") if model_id == "gpt-4" else None,
    )

    provider_id, model_id = await service._resolve_provider_and_model(
        provider_id="local-llm",
        model_id="gpt-4",
    )

    assert provider_id == "local-llm"
    assert model_id == "smollm2-1.7b"


@pytest.mark.asyncio
async def test_resolve_infers_provider_from_known_model(monkeypatch):
    service = AiHubService(db=None)

    monkeypatch.setattr(
        ai_hub_module.ai_model_registry,
        "get",
        lambda model_id: SimpleNamespace(provider_id="anthropic-llm")
        if model_id == "claude-custom"
        else None,
    )

    provider_id, model_id = await service._resolve_provider_and_model(
        provider_id=None,
        model_id="claude-custom",
    )

    assert provider_id == "anthropic-llm"
    assert model_id == "claude-custom"


@pytest.mark.asyncio
async def test_resolve_fully_unspecified_uses_capability_default(monkeypatch):
    service = AiHubService(db=None)

    async def _mock_default_model(*args, **kwargs):
        return "catalog-default"

    monkeypatch.setattr(ai_hub_module, "get_default_model", _mock_default_model)
    monkeypatch.setattr(
        ai_hub_module.ai_model_registry,
        "get",
        lambda model_id: SimpleNamespace(provider_id="anthropic-llm")
        if model_id == "catalog-default"
        else None,
    )

    provider_id, model_id = await service._resolve_provider_and_model(
        provider_id=None,
        model_id=None,
    )

    assert provider_id == "anthropic-llm"
    assert model_id == "catalog-default"
