"""
Generation Settings (business rules).

DB-backed via system_config "generation" namespace. Controls retry policy
and per-user limits. Separate from worker runtime tuning
(GenerationWorkerSettings) which lives in the "generation_worker" namespace.
"""
from __future__ import annotations

from pydantic import Field

from pixsim_settings import SettingsBase


class GenerationSettings(SettingsBase):
    """Generation business-rule settings (admin-controlled)."""

    _namespace = "generation"

    auto_retry_enabled: bool = Field(
        True,
        description="Enable automatic retry for failed generations",
    )
    auto_retry_max_attempts: int = Field(
        10, ge=1, le=50,
        description=(
            "Maximum auto-retry rounds per generation (each round is one full "
            "worker pickup → submission → failure → re-queue cycle). "
            "Lowered from 20 in 2026-04 — combined with the per-round rotation "
            "cap, max submission rows per generation is roughly "
            "auto_retry_max_attempts * auto_retry_max_quota_rotations_per_round."
        ),
    )
    auto_retry_max_quota_rotations_per_round: int = Field(
        3, ge=1, le=20,
        description=(
            "Cap on how many account-rotation attempts can fire within a "
            "single auto-retry round when the provider returns "
            "provider_quota errors. After this many failed rotations in a "
            "row, the generation bails out and lets auto_retry handle the "
            "next round (with retry_count++ + escalating defer). Without "
            "this cap, one round could rotate through every account, "
            "producing N submission rows per round for N accounts."
        ),
    )
    max_jobs_per_user: int = Field(
        10, ge=1, le=1000,
        description="Max concurrent generation jobs per user",
    )
    max_accounts_per_user: int = Field(
        5, ge=1, le=100,
        description="Max provider accounts per user",
    )


def get_generation_settings() -> GenerationSettings:
    """Get the global GenerationSettings instance."""
    return GenerationSettings.get()  # type: ignore[return-value]
