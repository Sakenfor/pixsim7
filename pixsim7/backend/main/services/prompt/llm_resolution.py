"""
Shared LLM analyzer provider/model resolution helpers.
"""

from __future__ import annotations

from typing import Optional


_CANONICAL_PROVIDER_IDS = {
    "anthropic-llm",
    "openai-llm",
    "local-llm",
    "cmd-llm",
}

_PROVIDER_ALIASES = {
    "anthropic": "anthropic-llm",
    "openai": "openai-llm",
    "local": "local-llm",
    "cmd": "cmd-llm",
}


def normalize_llm_provider_id(provider_id: Optional[str]) -> Optional[str]:
    """Normalize provider IDs to canonical ``*-llm`` values."""
    if not isinstance(provider_id, str):
        return None
    normalized = provider_id.strip().lower()
    if not normalized:
        return None
    if normalized in _CANONICAL_PROVIDER_IDS:
        return normalized
    return _PROVIDER_ALIASES.get(normalized)


def resolve_llm_provider_id(
    *,
    explicit_provider_id: Optional[str],
    analyzer_provider_id: Optional[str],
    user_provider_id: Optional[str],
    fallback_provider_id: Optional[str] = None,
) -> Optional[str]:
    """
    Resolve effective LLM provider ID.

    Precedence:
    1. explicit request/instance provider
    2. analyzer default provider
    3. user preference provider
    4. fallback provider (optional)
    """
    return (
        normalize_llm_provider_id(explicit_provider_id)
        or normalize_llm_provider_id(analyzer_provider_id)
        or normalize_llm_provider_id(user_provider_id)
        or normalize_llm_provider_id(fallback_provider_id)
    )


def resolve_llm_model_id(
    *,
    explicit_model_id: Optional[str],
    analyzer_model_id: Optional[str],
    user_model_id: Optional[str],
    user_provider_id: Optional[str],
    resolved_provider_id: Optional[str],
) -> Optional[str]:
    """
    Resolve effective model ID.

    User default model only applies when the user's selected provider matches
    the resolved provider.
    """
    if explicit_model_id:
        return explicit_model_id
    if (
        user_model_id
        and resolved_provider_id
        and normalize_llm_provider_id(user_provider_id) == resolved_provider_id
    ):
        return user_model_id
    return analyzer_model_id
