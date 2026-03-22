"""
Debug Settings (per-user)

Controls which debug log categories are enabled for the current user.
Categories are aligned with pixsim_logging.spec.DOMAINS.

Stored in users.preferences["debug"].
"""
from __future__ import annotations

from pydantic import Field

from pixsim7.backend.main.services.system_config.settings_base import UserSettingsBase


class DebugSettings(UserSettingsBase):
    """Per-user debug log category toggles."""

    _namespace = "debug"

    account: bool = Field(False, description="Account and auth operations")
    audit: bool = Field(False, description="Audit trail events")
    cron: bool = Field(False, description="Scheduled tasks and background jobs")
    generation: bool = Field(False, description="Generation pipeline, dedup, params")
    localFolders: bool = Field(False, description="Local folder hashing, sync, and backend checks")
    overlay: bool = Field(False, description="Media card overlay and badge system")
    persistence: bool = Field(False, description="Store persistence and rehydration")
    provider: bool = Field(False, description="Provider SDK calls and responses")
    sql: bool = Field(False, description="SQL query echo logging (verbose)")
    stores: bool = Field(False, description="Store initialization and creation")
    system: bool = Field(False, description="System, registry, and API sync")
    websocket: bool = Field(False, description="WebSocket connection and messages")
    worker: bool = Field(False, description="Job processing and status polling")
    validateCompositionVocabs: bool = Field(
        False,
        description="Validate composition vocab fields against registry",
    )
