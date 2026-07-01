"""
Logging Settings

Per-domain log level overrides, persisted via system_config.
The applier triggers actual logger reconfiguration as a side effect.
"""
from __future__ import annotations

from typing import Dict

from pydantic import Field

from pixsim7.backend.main.services.system_config.settings_base import SettingsBase


class LoggingSettings(SettingsBase):
    """Logging configuration — domain levels, retention, ingestion."""

    _namespace = "logging"

    log_domain_levels: Dict[str, str] = Field(
        default_factory=dict,
        description="Per-domain log level overrides. Keys match pixsim_logging DOMAINS. Values: DEBUG/INFO/WARNING/ERROR/OFF.",
    )
    log_retention_days: int = Field(
        30,
        ge=1,
        le=365,
        description="Number of days to retain logs in the database. Older entries are purged by the cleanup task.",
    )
    log_level: str = Field(
        "INFO",
        description="Global log level (DEBUG/INFO/WARNING/ERROR). Overridden per-domain by log_domain_levels.",
    )
    log_db_min_level: str = Field(
        "INFO",
        description="Minimum level for DB log ingestion (DEBUG/INFO/WARNING/ERROR). "
        "Prevents DEBUG console logging from flooding the log database. "
        "FOOTGUN: setting this above INFO SILENTLY drops all app INFO/WARNING "
        "from the log DB (console is unaffected) — leave at INFO for full "
        "queryable history. Use per-domain overrides for targeted noise control.",
    )
    sql_logging: bool = Field(
        False,
        description="Echo every SQL statement (SQLAlchemy echo) across all DB engines. "
        "Debug only — very verbose. Applied live via the logging applier, no restart.",
    )


def get_logging_settings() -> LoggingSettings:
    """Get the global LoggingSettings instance."""
    return LoggingSettings.get()  # type: ignore[return-value]
