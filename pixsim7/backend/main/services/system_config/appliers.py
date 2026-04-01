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
    from pixsim7.backend.main.services.system_config.settings_store import apply_settings
    from pixsim7.backend.main.shared.rate_limit import job_create_limiter, login_limiter

    # Populate the SettingsBase cache — consumers read via
    # GenerationSettings.get() (no global settings sync needed)
    apply_settings("generation", data)

    # Side effect: update rate limiter state
    job_create_limiter.update_limits(
        max_requests=data.get("rate_limit_max_requests"),
        window_seconds=data.get("rate_limit_window_seconds"),
    )
    login_limiter.update_limits(
        max_requests=data.get("login_rate_limit_max_requests"),
        window_seconds=data.get("login_rate_limit_window_seconds"),
    )


register_applier("generation", _apply_generation_config)


# ---------------------------------------------------------------------------
# "generation_worker" - worker runtime backoff/dispatch tuning
# ---------------------------------------------------------------------------

def _apply_generation_worker_config(data: dict) -> None:
    from pixsim7.backend.main.services.system_config.settings_store import apply_settings

    # Populate the SettingsBase cache — consumers read via
    # GenerationWorkerSettings.get() (no global settings sync needed)
    apply_settings("generation_worker", data)


register_applier("generation_worker", _apply_generation_worker_config)


# ---------------------------------------------------------------------------
# "llm" — cache tuning
# ---------------------------------------------------------------------------

def _apply_llm_config(data: dict) -> None:
    from pixsim7.backend.main.services.system_config.settings_store import apply_settings

    # Populate the SettingsBase cache — consumers read via
    # LLMSettings.get() (no global settings sync needed)
    apply_settings("llm", data)


register_applier("llm", _apply_llm_config)


# ---------------------------------------------------------------------------
# "logging" — per-domain log level overrides
# ---------------------------------------------------------------------------

def _apply_logging_config(data: dict) -> None:
    from pixsim7.backend.main.shared.config import settings
    from pixsim7.backend.main.services.system_config.settings_store import apply_settings
    from pixsim_logging.domains import update_domain_config, update_global_level
    from pixsim_logging.config import set_db_min_level

    # Populate the generic SettingsBase cache
    apply_settings("logging", data)

    # Side effect: reconfigure loggers + sync to global settings
    if "log_level" in data:
        update_global_level(data["log_level"])

    if "log_db_min_level" in data:
        set_db_min_level(data["log_db_min_level"])

    if "log_domain_levels" in data:
        levels = data["log_domain_levels"]
        settings.log_domain_levels = levels
        update_domain_config(levels)


register_applier("logging", _apply_logging_config)


# ---------------------------------------------------------------------------
# "provider_settings" — per-provider reauth / password config
# ---------------------------------------------------------------------------

def _apply_provider_settings(data: dict) -> None:
    from .settings_store import apply_provider_settings
    apply_provider_settings(data)


register_applier("provider_settings", _apply_provider_settings)


# ---------------------------------------------------------------------------
# "media_settings" — ingestion, thumbnails, caching
# ---------------------------------------------------------------------------

def _apply_media_settings(data: dict) -> None:
    from .settings_store import apply_media_settings
    apply_media_settings(data)


register_applier("media_settings", _apply_media_settings)
