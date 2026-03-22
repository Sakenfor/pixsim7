"""
Generation Worker Settings

Declarative configuration for worker runtime behavior:
- Content filter retry / backoff
- Provider concurrency & cooldowns
- Dispatch stagger
- Adaptive concurrency probing

Single source of truth — the API models, applier, and OpenAPI spec
all derive from this class automatically via SettingsBase.
"""
from __future__ import annotations

from pydantic import Field

from pixsim7.backend.main.services.system_config.settings_base import SettingsBase


class GenerationWorkerSettings(SettingsBase):
    """Generation worker runtime config (backoff/dispatch tuning)."""

    _namespace = "generation_worker"

    # ── ARQ Worker ────────────────────────────────────────────────────────

    arq_max_jobs: int = Field(
        30, ge=1, le=100,
        description="Max concurrent jobs per worker",
    )

    # ── Content Filter Retry ──────────────────────────────────────────────

    content_filter_submit_max_retries: int = Field(
        3, ge=1, le=20,
        description="Worker-local retry budget for submit-time retryable content-filter errors",
    )
    content_filter_rotate_after_retries: int = Field(
        2, ge=0, le=20,
        description="After this many content-filter retries, clear account affinity for non-pinned generations",
    )
    content_filter_pinned_yield_after_retries: int = Field(
        1, ge=0, le=20,
        description="Pinned generations start yielding after this many content-filter retries when siblings are queued",
    )
    content_filter_retry_defer_seconds: int = Field(
        10, ge=1, le=600,
        description="Base defer delay in seconds when yielding due to content-filter retry fairness",
    )
    content_filter_pinned_yield_defer_multiplier: int = Field(
        3, ge=1, le=20,
        description="Multiplier applied to content_filter_retry_defer_seconds for pinned-yield defers",
    )
    content_filter_yield_counts_as_retry: bool = Field(
        False,
        description="Whether fairness-only content-filter yields consume retry_count",
    )
    content_filter_max_yields: int = Field(
        12, ge=0, le=200,
        description="Maximum fairness-only content-filter yields per generation before falling back to normal retry/rotation (0 disables cap)",
    )
    content_filter_yield_counter_ttl_seconds: int = Field(
        86400, ge=60, le=2592000,
        description="Redis TTL for per-generation content-filter yield counters",
    )

    # ── Provider Cooldowns ────────────────────────────────────────────────

    pixverse_concurrent_cooldown_seconds: int = Field(
        6, ge=1, le=600,
        description="Base cooldown after provider concurrent-limit errors for Pixverse (non-I2I operations)",
    )
    pixverse_i2i_concurrent_cooldown_seconds: int = Field(
        2, ge=1, le=600,
        description="Base cooldown after provider concurrent-limit errors for Pixverse image_to_image operations",
    )

    # ── Dispatch Stagger ──────────────────────────────────────────────────

    dispatch_stagger_per_slot_seconds: float = Field(
        1.5, ge=0.0, le=30.0,
        description="Random stagger multiplier per occupied local slot before provider submit",
    )
    dispatch_stagger_max_seconds: float = Field(
        12.0, ge=0.0, le=300.0,
        description="Maximum dispatch stagger before provider submit",
    )

    # ── Pinned Wait ───────────────────────────────────────────────────────

    pinned_wait_padding_seconds: int = Field(
        1, ge=0, le=60,
        description="Padding added to pinned-account cooldown/capacity defers",
    )
    min_pinned_cooldown_defer_seconds: int = Field(
        2, ge=1, le=300,
        description="Minimum defer for pinned-account cooldown waits",
    )
    max_pinned_concurrent_waits: int = Field(
        72, ge=1, le=10000,
        description="Guardrail on fairness/adaptive pinned concurrent waits before failing the generation",
    )
    pinned_concurrent_wait_counter_ttl_seconds: int = Field(
        172800, ge=60, le=2592000,
        description="Redis TTL for per-generation pinned concurrent wait counters",
    )

    # ── Adaptive Provider Concurrency ─────────────────────────────────────

    adaptive_provider_concurrency_enabled: bool = Field(
        True,
        description="Enable adaptive per-account/provider submit throttling when provider concurrency limits are lower than configured caps",
    )
    adaptive_provider_concurrency_state_ttl_seconds: int = Field(
        21600, ge=60, le=604800,
        description="Redis TTL for adaptive provider concurrency state",
    )
    adaptive_provider_concurrency_probe_min_seconds: int = Field(
        120, ge=30, le=3600,
        description="Minimum delay before probing whether provider concurrency has recovered",
    )
    adaptive_provider_concurrency_probe_max_seconds: int = Field(
        180, ge=30, le=3600,
        description="Maximum delay before probing whether provider concurrency has recovered",
    )
    adaptive_provider_concurrency_probe_lock_ttl_seconds: int = Field(
        300, ge=30, le=3600,
        description="Redis lock TTL used to ensure one adaptive concurrency probe at a time per account/provider key",
    )
    adaptive_provider_concurrency_defer_jitter_max_seconds: int = Field(
        6, ge=0, le=120,
        description="Additional jitter added to adaptive concurrent-limit defers to avoid synchronized retries",
    )
    adaptive_provider_concurrency_lower_after_consecutive_rejects: int = Field(
        10, ge=1, le=1000,
        description="Consecutive provider concurrency-limit rejects required before lowering the learned effective cap",
    )
    adaptive_provider_concurrency_raise_after_consecutive_probe_successes: int = Field(
        2, ge=1, le=1000,
        description="Consecutive successful probe submits required before raising the learned effective cap",
    )


def get_worker_settings() -> GenerationWorkerSettings:
    """Get the global GenerationWorkerSettings instance."""
    return GenerationWorkerSettings.get()  # type: ignore[return-value]
