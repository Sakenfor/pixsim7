import asyncio
import importlib
import threading
import time

import pytest

from pixsim7.backend.main.services.llm.local_llm_engine import (
    LocalLlmEngine,
    get_local_llm_engine,
    unload_local_llm_engines,
)
from pixsim7.backend.main.shared.config import settings


def test_local_llm_engine_initializes_unloaded():
    engine = LocalLlmEngine()
    assert engine.is_loaded() is False


def test_local_llm_engine_missing_llama_cpp_fails_only_on_load(monkeypatch, tmp_path):
    model_path = tmp_path / "model.gguf"
    model_path.write_text("fake", encoding="utf-8")

    engine = LocalLlmEngine()
    monkeypatch.setattr(settings, "local_llm_model_path", str(model_path), raising=False)

    real_import_module = importlib.import_module

    def _fake_import(name: str, *args, **kwargs):
        if name == "llama_cpp":
            raise ImportError("No module named llama_cpp")
        return real_import_module(name, *args, **kwargs)

    monkeypatch.setattr(importlib, "import_module", _fake_import)

    with pytest.raises(ImportError) as exc_info:
        engine.ensure_loaded()

    assert "llama-cpp-python is not installed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_local_llm_engine_serializes_concurrent_inference():
    class _DummyLlama:
        def __init__(self):
            self._lock = threading.Lock()
            self.concurrent = 0
            self.max_concurrent = 0

        def create_chat_completion(self, **kwargs):
            _ = kwargs
            with self._lock:
                self.concurrent += 1
                self.max_concurrent = max(self.max_concurrent, self.concurrent)
            time.sleep(0.03)
            with self._lock:
                self.concurrent -= 1
            return {"choices": [{"message": {"content": "ok"}}]}

    engine = LocalLlmEngine()
    dummy = _DummyLlama()
    engine._llm = dummy
    engine._loaded = True

    results = await asyncio.gather(
        engine.generate("prompt 1"),
        engine.generate("prompt 2"),
        engine.generate("prompt 3"),
    )

    assert results == ["ok", "ok", "ok"]
    assert dummy.max_concurrent == 1


def test_local_llm_engine_pool_is_keyed_by_runtime_settings(tmp_path):
    unload_local_llm_engines()
    model_a = tmp_path / "model-a.gguf"
    model_b = tmp_path / "model-b.gguf"
    model_a.write_text("a", encoding="utf-8")
    model_b.write_text("b", encoding="utf-8")

    engine_a1 = get_local_llm_engine(
        model_path=str(model_a),
        n_ctx=2048,
        n_threads=4,
        auto_download=False,
    )
    engine_a2 = get_local_llm_engine(
        model_path=str(model_a),
        n_ctx=2048,
        n_threads=4,
        auto_download=False,
    )
    engine_b = get_local_llm_engine(
        model_path=str(model_b),
        n_ctx=2048,
        n_threads=4,
        auto_download=False,
    )
    engine_ctx = get_local_llm_engine(
        model_path=str(model_a),
        n_ctx=1024,
        n_threads=4,
        auto_download=False,
    )

    assert engine_a1 is engine_a2
    assert engine_a1 is not engine_b
    assert engine_a1 is not engine_ctx

    unload_local_llm_engines()
