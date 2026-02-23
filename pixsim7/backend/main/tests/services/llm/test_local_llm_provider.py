import pytest

from pixsim7.backend.main.services.llm import adapters as llm_adapters
from pixsim7.backend.main.services.llm import providers as llm_providers
from pixsim7.backend.main.services.llm.models import LLMProvider, LLMRequest
from pixsim7.backend.main.shared.errors import ProviderError


class _RecordingEngine:
    def __init__(self, text: str = "ok"):
        self.text = text
        self.calls = []

    async def generate(self, prompt: str, **kwargs):
        self.calls.append({"prompt": prompt, **kwargs})
        return self.text


@pytest.mark.asyncio
async def test_local_llm_provider_edit_prompt_uses_instance_config(monkeypatch):
    engine = _RecordingEngine(text="edited")
    monkeypatch.setattr(llm_adapters, "get_local_llm_engine", lambda: engine)

    provider = llm_adapters.LocalLlmProvider()
    result = await provider.edit_prompt(
        model_id="smollm2-1.7b",
        prompt_before="Original prompt",
        instance_config={"max_tokens": "128", "temperature": "0.6"},
    )

    assert result == "edited"
    assert len(engine.calls) == 1
    assert engine.calls[0]["prompt"] == "Original prompt"
    assert engine.calls[0]["model_id"] == "smollm2-1.7b"
    assert engine.calls[0]["max_tokens"] == 128
    assert engine.calls[0]["temperature"] == 0.6


@pytest.mark.asyncio
async def test_local_llm_provider_uses_engine_overrides_from_instance_config(monkeypatch):
    engine = _RecordingEngine(text="edited")
    captured = {}

    def _fake_get_local_llm_engine(**kwargs):
        captured.update(kwargs)
        return engine

    monkeypatch.setattr(llm_adapters, "get_local_llm_engine", _fake_get_local_llm_engine)

    provider = llm_adapters.LocalLlmProvider()
    result = await provider.edit_prompt(
        model_id="smollm2-1.7b",
        prompt_before="Original prompt",
        instance_config={
            "model_path": "C:/models/custom.gguf",
            "n_ctx": "1024",
            "n_threads": "2",
            "auto_download": "false",
            "max_tokens": "128",
            "temperature": "0.6",
        },
    )

    assert result == "edited"
    assert captured["model_path"] == "C:/models/custom.gguf"
    assert captured["n_ctx"] == 1024
    assert captured["n_threads"] == 2
    assert captured["auto_download"] is False


@pytest.mark.asyncio
async def test_local_llm_provider_maps_missing_dependency_to_provider_error(monkeypatch):
    class _Engine:
        async def generate(self, prompt: str, **kwargs):
            raise ImportError("llama_cpp not installed")

    monkeypatch.setattr(llm_adapters, "get_local_llm_engine", lambda: _Engine())
    provider = llm_adapters.LocalLlmProvider()

    with pytest.raises(ProviderError) as exc_info:
        await provider.edit_prompt(model_id="smollm2-1.7b", prompt_before="hello")

    assert "dependencies missing" in str(exc_info.value).lower()
    assert exc_info.value.retryable is False


@pytest.mark.asyncio
async def test_local_llm_provider_maps_missing_model_to_provider_error(monkeypatch):
    class _Engine:
        async def generate(self, prompt: str, **kwargs):
            raise FileNotFoundError("model not found")

    monkeypatch.setattr(llm_adapters, "get_local_llm_engine", lambda: _Engine())
    provider = llm_adapters.LocalLlmProvider()

    with pytest.raises(ProviderError) as exc_info:
        await provider.edit_prompt(model_id="smollm2-1.7b", prompt_before="hello")

    assert "model file not found" in str(exc_info.value).lower()
    assert exc_info.value.retryable is False


@pytest.mark.asyncio
async def test_local_llm_general_provider_returns_valid_llm_response(monkeypatch):
    engine = _RecordingEngine(text="generated local text")
    monkeypatch.setattr(llm_providers, "get_local_llm_engine", lambda: engine)

    provider = llm_providers.LocalLLMProvider()
    request = LLMRequest(
        prompt="Describe the scene.",
        system_prompt="You are a parser.",
        model="smollm2-1.7b-test",
        max_tokens=64,
        temperature=0.2,
        metadata={"trace_id": "abc"},
    )

    response = await provider.generate(request)

    assert response.text == "generated local text"
    assert response.model == "smollm2-1.7b-test"
    assert response.cached is False
    assert response.cache_key is None
    assert response.usage is None
    assert response.estimated_cost == 0.0
    assert response.generation_time_ms is not None
    assert response.metadata == {"trace_id": "abc"}
    assert response.provider in {LLMProvider.LOCAL, LLMProvider.LOCAL.value, "local"}
    assert engine.calls[0]["prompt"] == "You are a parser.\n\nDescribe the scene."
