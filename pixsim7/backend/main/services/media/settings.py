"""
Media Settings

Declarative configuration for the media pipeline.
Add a field here and it automatically appears in the API response/update models.

Backed by system_config DB table (namespace: "media_settings").
"""
from __future__ import annotations

from typing import Optional

from pydantic import Field

from pixsim7.backend.main.services.system_config.settings_base import SettingsBase


class MediaSettings(SettingsBase):
    """
    Media pipeline settings — single source of truth.

    Each field is automatically:
    - Exposed in the GET /media/settings response
    - Accepted (as Optional) in the PATCH /media/settings body
    - Described in the OpenAPI spec via the Field description
    """

    _namespace = "media_settings"

    # ── Download & Ingestion ──────────────────────────────────────────────

    ingest_on_asset_add: bool = Field(
        True,
        description="Auto-ingest when assets are created",
    )
    prefer_local_over_provider: bool = Field(
        True,
        description="Serve from local storage instead of provider CDN",
    )
    max_download_size_mb: int = Field(
        500,
        description="Maximum file size to download (MB)",
    )
    concurrency_limit: int = Field(
        4,
        description="Maximum concurrent ingestion jobs",
    )

    download_on_generate: bool = Field(
        False,
        description="Auto-download generated assets to local storage when generation completes",
    )

    # ── Storage Format ────────────────────────────────────────────────────

    storage_format: Optional[str] = Field(
        None,
        description="Convert images to this format on download (null=keep original, 'webp', 'jpeg')",
    )
    storage_quality: int = Field(
        90,
        description="Quality for storage format conversion (1-100)",
    )

    # ── Derivatives ───────────────────────────────────────────────────────

    generate_thumbnails: bool = Field(
        True,
        description="Generate thumbnails for images and videos",
    )
    thumbnail_size: list[int] = Field(
        default_factory=lambda: [320, 320],
        description="Thumbnail dimensions [width, height]",
    )
    thumbnail_quality: int = Field(
        85,
        description="JPEG quality for thumbnails (1-100)",
    )
    generate_previews: bool = Field(
        False,
        description="Generate preview derivatives",
    )
    derivatives_async: bool = Field(
        True,
        description=(
            "Run thumbnail/preview/signal-analysis generation in an ARQ worker "
            "after the core ingestion commits.  Disable to force inline "
            "ffmpeg inside the request path (debugging / single-process setups)."
        ),
    )
    preview_size: list[int] = Field(
        default_factory=lambda: [800, 800],
        description="Preview dimensions [width, height]",
    )
    preview_quality: int = Field(
        92,
        description="JPEG quality for previews (1-100)",
    )

    # ── Serving ───────────────────────────────────────────────────────────

    cache_control_max_age_seconds: int = Field(
        86400,
        description="Cache-Control max-age for served media",
    )

    # ── Frame Extraction ──────────────────────────────────────────────────

    frame_extraction_upload: str = Field(
        "source_provider",
        description="Frame extraction upload behavior: 'source_provider', 'always', or 'never'",
    )
    default_upload_provider: str = Field(
        "pixverse",
        description="Default provider for uploads when frame_extraction_upload is 'always'",
    )

    # ── Computed helpers (not serialized) ─────────────────────────────────

    @property
    def storage_format_normalized(self) -> Optional[str]:
        """Normalized storage_format: treats '' as None."""
        return self.storage_format if self.storage_format else None


# ── Singleton accessor ────────────────────────────────────────────────────

def get_media_settings() -> MediaSettings:
    """Get the global MediaSettings instance."""
    return MediaSettings.get()  # type: ignore[return-value]
