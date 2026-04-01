"""
LLM cache settings.

DB-backed via system_config "llm" namespace. Controls response caching
behavior for LLM calls.
"""
from __future__ import annotations

from pydantic import Field

from pixsim_settings import SettingsBase


class LLMSettings(SettingsBase):
    """LLM cache tuning settings (admin-controlled)."""

    _namespace = "llm"

    llm_cache_enabled: bool = Field(
        True,
        description="Enable LLM response caching",
    )
    llm_cache_ttl: int = Field(
        3600, ge=0, le=86400,
        description="Cache TTL in seconds",
    )
    llm_cache_freshness: float = Field(
        0.0, ge=0.0, le=1.0,
        description="Cache freshness threshold (0.0=always use cache, 1.0=always regenerate)",
    )


def get_llm_settings() -> LLMSettings:
    """Get the global LLMSettings instance."""
    return LLMSettings.get()  # type: ignore[return-value]
