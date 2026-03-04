"""
Shared Execution Policy — provider/model precedence resolution.

Phase 1 of the analyzer shared-kernel consolidation plan
(work item: ``kernel-exec-policy``).

This module unifies two previously separate resolution tiers:

  1. **Preference-tier** (explicit > analyzer > user > fallback)
     Previously scattered across ``resolve_llm_provider_id`` /
     ``resolve_llm_model_id`` calls in ``analyzer_pipeline.py``.

  2. **Runtime-tier** (model catalog inference, conflict detection,
     provider default models)
     Previously only in ``AiHubService._resolve_provider_and_model``.

Both ``PromptAnalysisService`` and ``AnalysisService`` now route through
``resolve_provider_model_precedence`` via ``resolve_analyzer_execution()``
in ``analyzer_pipeline.py``.

Design constraints
------------------
* This function is **synchronous** — no DB session required.
* Capability-scoped defaults (async DB lookup) and hardcoded global
  fallbacks remain in ``AiHubService`` for fully-unspecified calls.
* The function returns ``None`` for provider/model when nothing resolves,
  to avoid hidden implicit drift.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from pixsim7.backend.main.services.ai_model import ai_model_registry
from pixsim7.backend.main.services.prompt.llm_resolution import (
    normalize_llm_provider_id,
    resolve_llm_model_id,
    resolve_llm_provider_id,
)

logger = logging.getLogger(__name__)


# Canonical default models per provider.
# Shared single source between execution policy and AiHubService.
DEFAULT_MODEL_BY_PROVIDER: dict[str, str] = {
    "anthropic-llm": "claude-sonnet-4-20250514",
    "openai-llm": "gpt-4",
    "local-llm": "smollm2-1.7b",
}


@dataclass(frozen=True)
class ProviderModelPrecedenceRequest:
    """All inputs to the shared provider/model precedence resolution."""

    # Explicit overrides — highest priority
    explicit_provider_id: Optional[str] = None
    explicit_model_id: Optional[str] = None

    # Analyzer definition defaults
    analyzer_provider_id: Optional[str] = None
    analyzer_model_id: Optional[str] = None

    # User preferences (model only applies when provider matches)
    user_provider_id: Optional[str] = None
    user_model_id: Optional[str] = None

    # Fallback (e.g., asset provider)
    fallback_provider_id: Optional[str] = None


@dataclass(frozen=True)
class ProviderModelPrecedenceResult:
    """Resolved provider/model after precedence + runtime validation."""

    provider_id: Optional[str]
    model_id: Optional[str]
    provider_source: str
    model_source: str
    conflict_detected: bool = False


def resolve_provider_model_precedence(
    request: ProviderModelPrecedenceRequest,
    *,
    use_model_catalog: bool = True,
    apply_provider_defaults: bool = True,
) -> ProviderModelPrecedenceResult:
    """
    Unified precedence resolution for provider/model.

    Combines preference-tier and runtime-tier into one deterministic path:

      1. **Preference provider**: explicit > analyzer > user > fallback
      2. **Preference model**: explicit > user (if provider matches) > analyzer
      3. **Model catalog inference**: if model known in catalog, infer provider
      4. **Conflict detection**: if provider and model disagree on provider,
         keep provider → drop model
      5. **Provider default model**: if provider known but model missing,
         fill from ``DEFAULT_MODEL_BY_PROVIDER``

    For fully-unspecified calls (both None after these steps), the caller
    is responsible for capability-scoped defaults.
    """

    # --- Steps 1–2: Preference-tier resolution ---
    pref_provider_id = resolve_llm_provider_id(
        explicit_provider_id=request.explicit_provider_id,
        analyzer_provider_id=request.analyzer_provider_id,
        user_provider_id=request.user_provider_id,
        fallback_provider_id=request.fallback_provider_id,
    )
    pref_model_id = resolve_llm_model_id(
        explicit_model_id=request.explicit_model_id,
        analyzer_model_id=request.analyzer_model_id,
        user_model_id=request.user_model_id,
        user_provider_id=request.user_provider_id,
        resolved_provider_id=pref_provider_id,
    )

    provider_source = _identify_provider_source(request, pref_provider_id)
    model_source = _identify_model_source(request, pref_model_id)

    resolved_provider_id = pref_provider_id
    resolved_model_id = pref_model_id
    conflict_detected = False

    # --- Step 3: Model catalog inference ---
    model_provider_id: Optional[str] = None
    if use_model_catalog and resolved_model_id:
        model_provider_id = _infer_provider_from_model_catalog(resolved_model_id)

        if not resolved_provider_id and model_provider_id:
            resolved_provider_id = model_provider_id
            provider_source = "model_catalog"

    # --- Step 4: Conflict detection ---
    if (
        resolved_provider_id
        and model_provider_id
        and model_provider_id != resolved_provider_id
    ):
        logger.warning(
            "execution_policy_provider_model_mismatch "
            "provider=%s model=%s model_provider=%s",
            resolved_provider_id,
            resolved_model_id,
            model_provider_id,
        )
        resolved_model_id = None
        model_source = "dropped_conflict"
        conflict_detected = True

    # --- Step 5: Provider default model ---
    if apply_provider_defaults and resolved_provider_id and not resolved_model_id:
        default_model = DEFAULT_MODEL_BY_PROVIDER.get(resolved_provider_id)
        if default_model:
            resolved_model_id = default_model
            model_source = "provider_default"

    return ProviderModelPrecedenceResult(
        provider_id=resolved_provider_id,
        model_id=resolved_model_id,
        provider_source=provider_source,
        model_source=model_source,
        conflict_detected=conflict_detected,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _identify_provider_source(
    request: ProviderModelPrecedenceRequest,
    resolved: Optional[str],
) -> str:
    """Identify which precedence level provided the provider."""
    if not resolved:
        return "none"
    if normalize_llm_provider_id(request.explicit_provider_id) == resolved:
        return "explicit"
    if normalize_llm_provider_id(request.analyzer_provider_id) == resolved:
        return "analyzer"
    if normalize_llm_provider_id(request.user_provider_id) == resolved:
        return "user"
    if normalize_llm_provider_id(request.fallback_provider_id) == resolved:
        return "fallback"
    return "unknown"


def _identify_model_source(
    request: ProviderModelPrecedenceRequest,
    resolved: Optional[str],
) -> str:
    """Identify which precedence level provided the model."""
    if not resolved:
        return "none"
    if request.explicit_model_id == resolved:
        return "explicit"
    if request.user_model_id == resolved:
        return "user"
    if request.analyzer_model_id == resolved:
        return "analyzer"
    return "unknown"


def _infer_provider_from_model_catalog(model_id: str) -> Optional[str]:
    """Look up model in AI model catalog and return its provider, if known."""
    try:
        model = ai_model_registry.get(model_id)
        if model:
            return normalize_llm_provider_id(model.provider_id) or model.provider_id
    except Exception:
        pass
    return None
