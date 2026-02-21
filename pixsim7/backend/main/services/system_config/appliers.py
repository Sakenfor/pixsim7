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
