"""
Shared LLM analyzer provider/model resolution helpers.
"""

from __future__ import annotations

from typing import Optional


_CANONICAL_PROVIDER_IDS = {
    "openai",
    "anthropic",
    "local",
    "cmd",
    # Legacy IDs still accepted
    "anthropic-llm",
    "openai-llm",
    "local-llm",
    "cmd-llm",
}

_PROVIDER_ALIASES = {
    # Legacy → clean
    "anthropic-llm": "anthropic",
    "openai-llm": "openai",
    "local-llm": "local",
    "cmd-llm": "cmd",
    "remote-cmd-llm": "remote",  # method, not provider — handled separately
}


def normalize_llm_provider_id(provider_id: Optional[str]) -> Optional[str]:
    """Normalize provider IDs to clean names (openai, anthropic, local, cmd).

    Also accepts legacy ``*-llm`` values for backward compatibility.
    """
    if not isinstance(provider_id, str):
        return None
    normalized = provider_id.strip().lower()
    if not normalized:
        return None
    # Already clean
    if normalized in ("openai", "anthropic", "local", "cmd"):
        return normalized
    # Legacy alias
    alias = _PROVIDER_ALIASES.get(normalized)
    if alias:
        return alias
    # Still in canonical set (legacy IDs)
    if normalized in _CANONICAL_PROVIDER_IDS:
        return normalized
    return None


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
