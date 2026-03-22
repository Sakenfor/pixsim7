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
    """Per-domain log level configuration."""

    _namespace = "logging"

    log_domain_levels: Dict[str, str] = Field(
        default_factory=dict,
        description="Per-domain log level overrides. Keys: generation, account, provider, cron, system. Values: DEBUG/INFO/WARNING/ERROR/OFF.",
    )


def get_logging_settings() -> LoggingSettings:
    """Get the global LoggingSettings instance."""
    return LoggingSettings.get()  # type: ignore[return-value]
