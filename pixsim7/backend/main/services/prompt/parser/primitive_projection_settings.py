"""
Primitive-projection LLM-fallback settings.

DB-backed via the ``system_config`` "primitive_projection" namespace. The
token-overlap engine (``primitive_projection.py``) stays pure and always-on;
these knobs gate the OPTIONAL LLM semantic fallback for weak/missing matches.

Defaults are deliberately conservative: ``llm_fallback_enabled`` is False so
the fallback is a no-op (and the eval/test suites and production behavior are
unaffected) until an admin opts in.
"""
from __future__ import annotations

from pydantic import Field

from pixsim_settings import SettingsBase


class PrimitiveProjectionSettings(SettingsBase):
    """LLM-fallback tuning for prompt primitive projection (admin-controlled)."""

    _namespace = "primitive_projection"

    llm_fallback_enabled: bool = Field(
        False,
        description=(
            "Enable the LLM semantic fallback for candidates the token-overlap "
            "engine leaves weak (no_signal / below_threshold / ambiguous). "
            "Off by default — the fallback is a pure no-op when disabled."
        ),
    )
    llm_fallback_max_candidates: int = Field(
        6,
        ge=1,
        le=24,
        description=(
            "Cap on weak candidates forwarded to the single batched LLM call "
            "per analyze request (latency/cost guard)."
        ),
    )
    llm_fallback_timeout_ms: int = Field(
        4000,
        ge=250,
        le=30000,
        description=(
            "Hard time budget for the LLM fallback call. On timeout the "
            "token-overlap result is kept unchanged (graceful degradation)."
        ),
    )
    llm_fallback_catalog_cap: int = Field(
        160,
        ge=20,
        le=600,
        description=(
            "Max primitive-catalog entries serialized into the LLM prompt "
            "(bounds prompt size / token cost)."
        ),
    )
    llm_fallback_min_confidence: float = Field(
        0.55,
        ge=0.0,
        le=1.0,
        description=(
            "Minimum LLM-reported confidence to accept a semantic match; "
            "lower-confidence picks are discarded and the weak result is kept."
        ),
    )


def get_primitive_projection_settings() -> PrimitiveProjectionSettings:
    """Return the global PrimitiveProjectionSettings instance."""
    return PrimitiveProjectionSettings.get()  # type: ignore[return-value]
