"""
Upload Preferences (per-user)

Controls deduplication behavior when uploading assets.
Stored in users.preferences["upload"] via UserSettingsBase.
"""
from __future__ import annotations

from pydantic import Field

from pixsim7.backend.main.services.system_config.settings_base import UserSettingsBase


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
    phash_threshold: int = Field(
        5, ge=0, le=32,
        description="Max Hamming distance for phash match (0 = exact, lower = stricter)",
    )
