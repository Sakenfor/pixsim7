"""
Upload Preferences (per-user)

Controls deduplication behavior when uploading assets.
Stored in users.preferences["similarityChecks"]["upload"] (legacy path)
or users.preferences["upload"] via UserSettingsBase.

Replaces the old resolve_upload_checks() + UploadSimilarityChecks pattern.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import Field

from pixsim7.backend.main.services.system_config.settings_base import UserSettingsBase

if TYPE_CHECKING:
    from pixsim7.backend.main.domain import User


class UploadPreferences(UserSettingsBase):
    """Per-user upload deduplication settings."""

    _namespace = "upload"

    sha256: bool = Field(
        True,
        description="Check exact byte-match (SHA-256) before uploading",
    )
    phash: bool = Field(
        True,
        description="Check perceptual hash similarity before uploading",
    )
    # camelCase to match existing frontend/stored data
    phashThreshold: int = Field(
        5, ge=0, le=32,
        description="Max Hamming distance for phash match (0 = exact, lower = stricter)",
    )

    @classmethod
    def for_user(cls, user: "User") -> "UploadPreferences":
        """Load from user preferences, handling legacy storage paths.

        Checks (in priority order):
        1. preferences["similarityChecks"]["upload"]  (current frontend format)
        2. preferences["upload"]                      (new namespace)
        3. preferences["skipSimilarCheck"]            (legacy boolean compat)
        4. defaults
        """
        prefs = (user.preferences or {}) if hasattr(user, "preferences") else {}

        # Current frontend format: nested under similarityChecks.upload
        sim = prefs.get("similarityChecks")
        if isinstance(sim, dict) and "upload" in sim:
            return cls(**(sim["upload"] if isinstance(sim["upload"], dict) else {}))

        # New flat namespace
        section = prefs.get(cls._namespace)
        if isinstance(section, dict):
            return cls(**section)

        # Legacy compat: skipSimilarCheck disables phash
        if prefs.get("skipSimilarCheck"):
            return cls(phash=False)

        return cls()
