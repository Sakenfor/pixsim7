"""
Config appliers — one function per namespace.

Each applier projects a persisted config dict onto in-memory runtime state.
Import this module to ensure all appliers are registered before
``apply_all_from_db`` is called.
"""
from .service import register_applier


# ---------------------------------------------------------------------------
# "generation" — rate limits, retry, per-user caps
# ---------------------------------------------------------------------------

def _apply_generation_config(data: dict) -> None:
    from pixsim7.backend.main.shared.config import settings
    from pixsim7.backend.main.shared.rate_limit import job_create_limiter, login_limiter

    job_create_limiter.update_limits(
        max_requests=data.get("rate_limit_max_requests"),
        window_seconds=data.get("rate_limit_window_seconds"),
    )
    login_limiter.update_limits(
        max_requests=data.get("login_rate_limit_max_requests"),
        window_seconds=data.get("login_rate_limit_window_seconds"),
    )
    if "auto_retry_enabled" in data:
        settings.auto_retry_enabled = data["auto_retry_enabled"]
    if "auto_retry_max_attempts" in data:
        settings.auto_retry_max_attempts = data["auto_retry_max_attempts"]
    if "max_jobs_per_user" in data:
        settings.max_jobs_per_user = data["max_jobs_per_user"]
    if "max_accounts_per_user" in data:
        settings.max_accounts_per_user = data["max_accounts_per_user"]


register_applier("generation", _apply_generation_config)


# ---------------------------------------------------------------------------
# "generation_worker" - worker runtime backoff/dispatch tuning
# ---------------------------------------------------------------------------

def _apply_generation_worker_config(data: dict) -> None:
    from pixsim7.backend.main.shared.config import settings

    worker_keys = (
        "content_filter_submit_max_retries",
        "content_filter_rotate_after_retries",
        "content_filter_pinned_yield_after_retries",
        "content_filter_retry_defer_seconds",
        "content_filter_pinned_yield_defer_multiplier",
        "content_filter_yield_counts_as_retry",
        "content_filter_max_yields",
        "content_filter_yield_counter_ttl_seconds",
        "pixverse_concurrent_cooldown_seconds",
        "pixverse_i2i_concurrent_cooldown_seconds",
        "dispatch_stagger_per_slot_seconds",
        "dispatch_stagger_max_seconds",
        "pinned_wait_padding_seconds",
        "min_pinned_cooldown_defer_seconds",
        "adaptive_provider_concurrency_enabled",
        "adaptive_provider_concurrency_state_ttl_seconds",
        "adaptive_provider_concurrency_probe_min_seconds",
        "adaptive_provider_concurrency_probe_max_seconds",
        "adaptive_provider_concurrency_probe_lock_ttl_seconds",
        "adaptive_provider_concurrency_defer_jitter_max_seconds",
        "adaptive_provider_concurrency_lower_after_consecutive_rejects",
        "adaptive_provider_concurrency_raise_after_consecutive_probe_successes",
        "max_pinned_concurrent_waits",
        "pinned_concurrent_wait_counter_ttl_seconds",
    )
    for key in worker_keys:
        if key in data:
            setattr(settings, key, data[key])


register_applier("generation_worker", _apply_generation_worker_config)


# ---------------------------------------------------------------------------
# "llm" — cache tuning
# ---------------------------------------------------------------------------

def _apply_llm_config(data: dict) -> None:
    from pixsim7.backend.main.shared.config import settings

    if "llm_cache_enabled" in data:
        settings.llm_cache_enabled = data["llm_cache_enabled"]
    if "llm_cache_ttl" in data:
        settings.llm_cache_ttl = data["llm_cache_ttl"]
    if "llm_cache_freshness" in data:
        settings.llm_cache_freshness = data["llm_cache_freshness"]


register_applier("llm", _apply_llm_config)
