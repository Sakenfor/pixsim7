"""
Unit tests for the embedder command resolver — fallback chain coverage.

Resolver chain (highest → lowest precedence):
1. preset (analyzer.config["presets"][preset_id]["command"])
2. registry (analyzer.config["command"])
3. env var (per-analyzer name from _FALLBACKS)
4. hardcoded fallback (per-analyzer from _FALLBACKS)

All four levels exercised here. Plus the wired CommandEmbeddingProvider path
that consumes the resolver.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.services.embedding.adapters import CommandEmbeddingProvider
from pixsim7.backend.main.services.embedding.preset_resolver import (
    EmbedderCommandConfig,
    resolve_embedder_command,
)
from pixsim7.backend.main.services.prompt.parser import (
    AnalyzerInfo,
    AnalyzerKind,
    AnalyzerTarget,
    AnalyzerTaskFamily,
    analyzer_registry,
)


# ── helpers ─────────────────────────────────────────────────────────────


@pytest.fixture
def restore_prompt_embedding():
    """Snapshot + restore the prompt:embedding analyzer config across a test."""
    original = analyzer_registry.get("prompt:embedding")
    original_config = dict(original.config) if original else None
    try:
        yield
    finally:
        if original is not None and original_config is not None:
            original.config = original_config
            analyzer_registry.register(original)


def _make_analyzer(analyzer_id: str, config: dict | None) -> AnalyzerInfo:
    return AnalyzerInfo(
        id=analyzer_id,
        name="test",
        description="",
        kind=AnalyzerKind.LLM,
        target=AnalyzerTarget.PROMPT,
        task_family=AnalyzerTaskFamily.EMBEDDING,
        config=config or {},
        source_plugin_id="test",
    )


# ── resolver: registry layer (default config) ───────────────────────────


def test_resolver_reads_analyzer_default_config():
    """prompt:embedding's seeded config['command'] wins by default."""
    resolved = resolve_embedder_command("prompt:embedding")
    assert resolved.source == "registry"
    assert resolved.command == "python -m pixsim7.embedding.cli.text_local"
    assert resolved.timeout == 120
    assert resolved.extra == {
        "model_id_hint": "BAAI/bge-base-en-v1.5",
        "dimensions": 768,
    }


# ── resolver: preset layer (overrides registry default) ─────────────────


def test_resolver_preset_id_overrides_registry(restore_prompt_embedding):
    """When preset_id is passed and present in config['presets'], it wins."""
    analyzer = analyzer_registry.get("prompt:embedding")
    analyzer.config = dict(analyzer.config)
    analyzer.config["presets"] = {
        "custom-gpu": {"command": "python my_custom_embedder.py", "timeout": 300},
    }
    analyzer_registry.register(analyzer)

    resolved = resolve_embedder_command("prompt:embedding", preset_id="custom-gpu")
    assert resolved.source == "preset"
    assert resolved.command == "python my_custom_embedder.py"
    assert resolved.timeout == 300


def test_resolver_missing_preset_falls_through_to_registry(restore_prompt_embedding):
    """Asking for a preset that doesn't exist falls through to default config."""
    resolved = resolve_embedder_command("prompt:embedding", preset_id="nonexistent")
    assert resolved.source == "registry"
    assert resolved.command == "python -m pixsim7.embedding.cli.text_local"


# ── resolver: env-var layer (registry config empty) ─────────────────────


def test_resolver_env_var_fallback_when_registry_empty(
    restore_prompt_embedding, monkeypatch
):
    """If analyzer config has no command, the env var wins."""
    analyzer = analyzer_registry.get("prompt:embedding")
    analyzer.config = {}  # wipe the seeded command
    analyzer_registry.register(analyzer)

    monkeypatch.setenv("CMD_EMBEDDING_COMMAND", "python /tmp/devbox_embedder.py")
    resolved = resolve_embedder_command("prompt:embedding")
    assert resolved.source == "env"
    assert resolved.command == "python /tmp/devbox_embedder.py"


# ── resolver: hardcoded fallback (registry empty + env unset) ───────────


def test_resolver_hardcoded_fallback_when_registry_and_env_empty(
    restore_prompt_embedding, monkeypatch
):
    """With both empty, the hardcoded default in _FALLBACKS wins."""
    analyzer = analyzer_registry.get("prompt:embedding")
    analyzer.config = {}
    analyzer_registry.register(analyzer)

    monkeypatch.delenv("CMD_EMBEDDING_COMMAND", raising=False)
    resolved = resolve_embedder_command("prompt:embedding")
    assert resolved.source == "default"
    assert resolved.command == "python -m pixsim7.embedding.cli.text_local"


# ── resolver: unknown analyzer doesn't raise ────────────────────────────


def test_resolver_unknown_analyzer_returns_empty_command():
    """Unknown analyzer with no _FALLBACKS entry returns empty (caller errors)."""
    resolved = resolve_embedder_command("does-not-exist:embedder")
    assert resolved.command == ""
    assert resolved.source == "default"


# ── EmbedderCommandConfig dataclass is frozen ────────────────────────────


def test_command_config_is_frozen():
    cfg = EmbedderCommandConfig(command="x")
    with pytest.raises((AttributeError, TypeError)):
        cfg.command = "y"  # type: ignore[misc]


# ── integration: CommandEmbeddingProvider uses the resolver ─────────────


def test_command_provider_uses_resolver_for_command():
    """The wired provider routes through the resolver (registry source)."""
    provider = CommandEmbeddingProvider()
    parts = provider._get_command_parts()
    assert parts == ["python", "-m", "pixsim7.embedding.cli.text_local"]
    assert provider._get_timeout() == 120


def test_command_provider_constructor_command_overrides_resolver():
    """An explicit constructor command bypasses the resolver."""
    provider = CommandEmbeddingProvider(command="custom_cmd --arg")
    parts = provider._get_command_parts()
    assert parts == ["custom_cmd", "--arg"]


def test_command_provider_instance_config_overrides_constructor():
    """Per-call instance_config['command'] has the highest priority."""
    provider = CommandEmbeddingProvider(command="constructor_cmd")
    parts = provider._get_command_parts(instance_config={"command": "instance_cmd"})
    assert parts == ["instance_cmd"]


def test_command_provider_no_command_anywhere_raises(
    restore_prompt_embedding, monkeypatch
):
    """Empty registry + no env var + provider with no constructor cmd raises."""
    analyzer = analyzer_registry.get("prompt:embedding")
    analyzer.config = {}
    analyzer_registry.register(analyzer)
    monkeypatch.delenv("CMD_EMBEDDING_COMMAND", raising=False)
    # Remove the hardcoded fallback so resolver returns empty
    from pixsim7.backend.main.services.embedding import preset_resolver

    monkeypatch.setitem(preset_resolver._FALLBACKS, "prompt:embedding", ("CMD_EMBEDDING_COMMAND", ""))

    provider = CommandEmbeddingProvider()
    from pixsim7.backend.main.shared.errors import ProviderError

    with pytest.raises(ProviderError) as exc_info:
        provider._get_command_parts()
    # ProviderError stringifies to provider_id; the "No command configured"
    # detail lives on the .code attribute.
    assert "No command configured" in (exc_info.value.code or "")
