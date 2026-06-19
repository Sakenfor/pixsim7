"""
Embedder command resolver — analyzer-preset-driven config for embedder
subprocesses (plan: analyzer-preset-driven-embedder-config, Session A).

Replaces the bare ``os.getenv(...)`` calls in the embedding providers with a
layered lookup that respects the analyzer-presets system already scaffolded in
the codebase. The chain (highest precedence first):

1. **Explicit preset on the analyzer config.** If a ``preset_id`` is passed
   and ``analyzer.config["presets"][preset_id]["command"]`` exists, use it.
   Approved user presets land here via
   :func:`AnalyzerPresetService._apply_preset_to_registry`.
2. **Analyzer default config.** ``analyzer.config["command"]`` — the built-in
   default registered in
   :meth:`AnalyzerRegistry._seed_defaults` (or a plugin/API registration).
3. **Environment variable fallback.** Per-analyzer env var so dev machines can
   override without touching the DB or registry.
4. **Hardcoded default.** Last-ditch baked-in command so nothing breaks if the
   registry is empty (test fixtures, partial bootstrap, etc.).

The resolver is **sync** because the registry is an in-memory module
singleton; per-user preset *selection* (which preset wins) is a v2 concern
that does need an async DB lookup, and it's intentionally out of Session A
scope. See plan checkpoint p3.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from pixsim7.backend.main.services.prompt.parser import analyzer_registry


@dataclass(frozen=True, slots=True)
class EmbedderCommandConfig:
    """Resolved embedder subprocess config.

    ``command`` is the argv string the provider hands to its shell-arg parser.
    Other fields (``timeout``, ``model_id_hint``, ``dimensions``) carry the
    rest of the analyzer's config blob in case the caller wants it; they're
    informational for now.
    """

    command: str
    timeout: int | None = None
    source: str = "default"  # one of: preset, registry, env, default
    extra: dict[str, Any] | None = None


# Per-analyzer env var name + hardcoded fallback command. Keeping these here
# (rather than scattered in each provider) makes the fallback chain auditable
# from one place.
_FALLBACKS: dict[str, tuple[str, str]] = {
    # analyzer_id -> (env_var_name, hardcoded_default_command)
    "prompt:embedding": (
        "CMD_EMBEDDING_COMMAND",
        "python -m pixsim7.embedding.cli.text_local",
    ),
    "asset:embedding": (
        "PIXSIM_EMBEDDING_COMMAND",
        "python -m pixsim7.embedding.cli.image_local --serve",
    ),
}


def resolve_embedder_command(
    analyzer_id: str,
    *,
    preset_id: str | None = None,
) -> EmbedderCommandConfig:
    """Return the active subprocess config for the given embedder analyzer.

    Lookup chain documented in this module's docstring. Never raises for an
    unknown ``analyzer_id`` — it just falls through to the hardcoded default
    (or empty string if none registered), so the caller's existing
    error-handling for ``"No command configured"`` still fires.
    """
    analyzer = analyzer_registry.get(analyzer_id)
    config = (analyzer.config if analyzer else None) or {}

    # 1. Explicit preset selection
    if preset_id:
        presets = config.get("presets") or {}
        preset = presets.get(preset_id) or {}
        cmd = preset.get("command")
        if cmd:
            return EmbedderCommandConfig(
                command=str(cmd),
                timeout=_coerce_timeout(preset.get("timeout")),
                source="preset",
                extra={k: v for k, v in preset.items() if k not in {"command", "timeout"}},
            )

    # 2. Analyzer top-level default config
    cmd = config.get("command")
    if cmd:
        return EmbedderCommandConfig(
            command=str(cmd),
            timeout=_coerce_timeout(config.get("timeout")),
            source="registry",
            extra={
                k: v
                for k, v in config.items()
                if k not in {"command", "timeout", "presets"}
            },
        )

    # 3. Env var fallback
    env_var, hardcoded = _FALLBACKS.get(analyzer_id, ("", ""))
    if env_var:
        env_cmd = os.getenv(env_var, "").strip()
        if env_cmd:
            return EmbedderCommandConfig(command=env_cmd, source="env")

    # 4. Hardcoded fallback
    return EmbedderCommandConfig(command=hardcoded, source="default")


def _coerce_timeout(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
