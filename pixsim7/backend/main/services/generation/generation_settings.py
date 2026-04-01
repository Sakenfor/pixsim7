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
        20, ge=1, le=50,
        description="Maximum retry attempts per generation",
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
