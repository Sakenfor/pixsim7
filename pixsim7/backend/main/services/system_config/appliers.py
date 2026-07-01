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

    if "sql_logging" in data:
        from pixsim7.backend.main.infrastructure.database.session import set_sql_echo
        set_sql_echo(bool(data["sql_logging"]))

    # Announce the EFFECTIVE thresholds after applying. This was previously
    # silent, which let a persisted db_min_level clamp (e.g. ERROR) invisibly
    # blackhole app INFO/WARNING from the log DB for weeks — the only earlier
    # signal ("log_db_ingestion_ready" at startup) reports the PRE-clamp state.
    # Emitted to the console (never clamped by db_min_level) so a raised floor is
    # always discoverable; escalated to WARNING when above INFO, the case that
    # silently drops history.
    try:
        from pixsim_logging import get_logger
        _log = get_logger().bind(service="api")
        _db_min = str(data.get("log_db_min_level") or "").upper()
        if _db_min in {"WARNING", "ERROR", "CRITICAL"}:
            _log.warning(
                "log_db_ingestion_clamped_above_info",
                db_min_level=_db_min,
                note="app INFO/WARNING are NOT written to the log DB at this level",
            )
        _log.info(
            "logging_config_applied",
            global_level=data.get("log_level"),
            db_min_level=data.get("log_db_min_level"),
            domain_overrides=len(data.get("log_domain_levels") or {}),
            sql_logging=data.get("sql_logging"),
        )
    except Exception:
        pass


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


# ---------------------------------------------------------------------------
# "primitive_projection" — LLM-fallback tuning for prompt primitive projection
# ---------------------------------------------------------------------------

def _apply_primitive_projection_config(data: dict) -> None:
    from pixsim7.backend.main.services.system_config.settings_store import apply_settings

    # Populate the SettingsBase cache — consumers read fresh via
    # get_primitive_projection_settings() at analyze time.
    apply_settings("primitive_projection", data)


register_applier("primitive_projection", _apply_primitive_projection_config)


# ---------------------------------------------------------------------------
# "storage_roots" — DB/UI-managed media storage roots (tiered storage)
# ---------------------------------------------------------------------------

def _apply_storage_roots_config(data: dict) -> None:
    from pixsim7.backend.main.services.storage.storage_service import apply_storage_roots

    # Override the env-configured roots and rebuild the tiered storage service.
    apply_storage_roots(data)


register_applier("storage_roots", _apply_storage_roots_config)
