"""
Shared local LLM engine for llama-cpp-python based providers.

Design goals:
- Lazy model loading (no startup-time dependency on llama_cpp)
- Safe concurrent access from async code (serialize inference)
- Optional model auto-download behavior
"""

from __future__ import annotations

import asyncio
import gc
import importlib
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.path_registry import get_path_registry

logger = logging.getLogger(__name__)

DEFAULT_MODEL_FILENAME = "SmolLM2-1.7B-Instruct-Q4_K_M.gguf"
DEFAULT_HF_REPO_ID = "HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF"
DEFAULT_HF_REPO_FILENAME = "smollm2-1.7b-instruct-q4_k_m.gguf"


@dataclass(frozen=True)
class LocalLlmEngineKey:
    """Stable key for local engine pooling."""

    model_path: str | None
    n_ctx: int
    n_threads: int
    auto_download: bool


class LocalLlmEngine:
    """Single local llama-cpp engine instance for one model/runtime config."""

    def __init__(
        self,
        *,
        model_path: str | None = None,
        n_ctx: int | None = None,
        n_threads: int | None = None,
        auto_download: bool | None = None,
    ) -> None:
        self._llm: Any | None = None
        self._model_path_override = _normalize_model_path(model_path)
        self._n_ctx = _coerce_int(n_ctx, default=int(settings.local_llm_context_size), minimum=256)
        self._n_threads = _coerce_int(
            n_threads,
            default=int(settings.local_llm_threads),
            minimum=1,
        )
        self._auto_download = (
            _coerce_bool(auto_download, default=bool(settings.local_llm_auto_download))
            if auto_download is not None
            else bool(settings.local_llm_auto_download)
        )
        self._model_path: Path | None = None
        self._loaded = False
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()

    def is_loaded(self) -> bool:
        return self._loaded and self._llm is not None

    def ensure_loaded(self) -> None:
        if self.is_loaded():
            return

        with self._load_lock:
            if self.is_loaded():
                return

            model_path = self._resolve_model_path()
            llama_cpp = self._import_llama_cpp()

            logger.info(
                "Loading local LLM model from %s (ctx=%s, threads=%s)",
                model_path,
                self._n_ctx,
                self._n_threads,
            )
            self._llm = llama_cpp.Llama(
                model_path=str(model_path),
                n_ctx=self._n_ctx,
                n_threads=self._n_threads,
                n_gpu_layers=0,
                verbose=False,
            )
            self._model_path = model_path
            self._loaded = True

    @staticmethod
    def _import_llama_cpp() -> Any:
        try:
            return importlib.import_module("llama_cpp")
        except ImportError as exc:
            raise ImportError(
                "llama-cpp-python is not installed. "
                "Install optional local LLM dependencies with "
                "'pip install -r pixsim7/backend/main/requirements-local-llm.txt'."
            ) from exc

    def _resolve_model_path(self) -> Path:
        configured = self._model_path_override or settings.local_llm_model_path
        if configured:
            candidate = Path(configured).expanduser().resolve()
            if candidate.exists():
                return candidate
            source = "instance model_path" if self._model_path_override else "LOCAL_LLM_MODEL_PATH"
            raise FileNotFoundError(f"Configured {source} does not exist: {candidate}")

        default_path = get_path_registry().models_root / DEFAULT_MODEL_FILENAME
        if default_path.exists():
            return default_path

        if self._auto_download:
            return self._download_default_model(default_path.parent)

        raise FileNotFoundError(
            f"Local model file not found at {default_path}. "
            "Set LOCAL_LLM_MODEL_PATH or enable LOCAL_LLM_AUTO_DOWNLOAD=true."
        )

    @staticmethod
    def _download_default_model(target_dir: Path) -> Path:
        try:
            from huggingface_hub import hf_hub_download
        except ImportError as exc:
            raise ImportError(
                "huggingface-hub is required for model auto-download. "
                "Install optional local LLM dependencies with "
                "'pip install -r pixsim7/backend/main/requirements-local-llm.txt'."
            ) from exc

        target_dir.mkdir(parents=True, exist_ok=True)
        downloaded = hf_hub_download(
            repo_id=DEFAULT_HF_REPO_ID,
            filename=DEFAULT_HF_REPO_FILENAME,
            local_dir=str(target_dir),
            local_dir_use_symlinks=False,
        )
        model_path = Path(downloaded).resolve()
        logger.info("Downloaded local LLM model to %s", model_path)
        return model_path

    async def generate(
        self,
        prompt: str,
        *,
        model_id: str | None = None,
        max_tokens: int = 500,
        temperature: float = 0.3,
    ) -> str:
        return await asyncio.to_thread(
            self.generate_sync,
            prompt,
            model_id=model_id,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    def generate_sync(
        self,
        prompt: str,
        *,
        model_id: str | None = None,
        max_tokens: int = 500,
        temperature: float = 0.3,
    ) -> str:
        self.ensure_loaded()
        if not self._llm:
            raise RuntimeError("Local LLM failed to initialize")

        # model_id is accepted for interface parity, but llama-cpp uses loaded GGUF.
        _ = model_id

        with self._inference_lock:
            response = self._llm.create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max(1, int(max_tokens)),
                temperature=max(0.0, float(temperature)),
            )

        text = self._extract_text(response)
        return text.strip()

    @staticmethod
    def _extract_text(response: Any) -> str:
        if not isinstance(response, dict):
            raise RuntimeError("Unexpected local LLM response type")

        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("Local LLM response missing choices")

        first = choices[0]
        if not isinstance(first, dict):
            raise RuntimeError("Local LLM response choice is invalid")

        message = first.get("message")
        if isinstance(message, dict):
            content = message.get("content")
        else:
            content = first.get("text")

        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    maybe_text = item.get("text")
                    if isinstance(maybe_text, str):
                        parts.append(maybe_text)
            content = "".join(parts)

        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Local LLM response missing text content")

        return content

    def unload(self) -> None:
        with self._load_lock:
            with self._inference_lock:
                self._llm = None
                self._model_path = None
                self._loaded = False
        gc.collect()


def _normalize_model_path(model_path: str | None) -> str | None:
    if not model_path:
        return None
    return str(Path(model_path).expanduser().resolve())


def _coerce_int(value: object, *, default: int, minimum: int) -> int:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, parsed)


def _coerce_bool(value: object, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _engine_key(
    *,
    model_path: str | None,
    n_ctx: int | None,
    n_threads: int | None,
    auto_download: bool | None,
) -> LocalLlmEngineKey:
    return LocalLlmEngineKey(
        model_path=_normalize_model_path(model_path),
        n_ctx=_coerce_int(n_ctx, default=int(settings.local_llm_context_size), minimum=256),
        n_threads=_coerce_int(n_threads, default=int(settings.local_llm_threads), minimum=1),
        auto_download=(
            _coerce_bool(auto_download, default=bool(settings.local_llm_auto_download))
            if auto_download is not None
            else bool(settings.local_llm_auto_download)
        ),
    )


_engine_pool: dict[LocalLlmEngineKey, LocalLlmEngine] = {}
_engine_lock = threading.Lock()


def get_local_llm_engine(
    *,
    model_path: str | None = None,
    n_ctx: int | None = None,
    n_threads: int | None = None,
    auto_download: bool | None = None,
) -> LocalLlmEngine:
    key = _engine_key(
        model_path=model_path,
        n_ctx=n_ctx,
        n_threads=n_threads,
        auto_download=auto_download,
    )
    existing = _engine_pool.get(key)
    if existing is not None:
        return existing

    with _engine_lock:
        engine = _engine_pool.get(key)
        if engine is None:
            engine = LocalLlmEngine(
                model_path=key.model_path,
                n_ctx=key.n_ctx,
                n_threads=key.n_threads,
                auto_download=key.auto_download,
            )
            _engine_pool[key] = engine
        return engine


def unload_local_llm_engines() -> None:
    """Unload and clear all pooled local engines."""
    with _engine_lock:
        engines = list(_engine_pool.values())
        _engine_pool.clear()

    for engine in engines:
        engine.unload()
