"""
Derivatives processor worker — generates thumbnails & previews off the ingestion path.

Split out of ``AssetIngestionService.ingest_asset`` so that heavy ffmpeg work
(video poster extraction, image resize) does not block the request/event loop
when a lot of videos are generated concurrently.

Enqueued by ``ingest_asset`` when ``MediaSettings.derivatives_async`` is True
(the default), and by ``serve_media`` when a thumbnail/preview file is found
to be missing on disk.  The task is idempotent — it re-applies the same
self-heal rules used by the inline path, so re-running on an already-derived
asset is a no-op.

Selective flags (``generate_thumbnails`` / ``generate_previews``) are
forwarded to ``service.generate_derivatives`` so callers that only need one
side can scope the work.  ``None`` falls back to the media-settings defaults.
"""
from __future__ import annotations

from typing import Optional

from pixsim7.backend.main.workers.asset_job import run_asset_job


async def process_derivatives(
    ctx: dict,
    asset_id: int,
    *,
    force: bool = False,
    generate_thumbnails: Optional[bool] = None,
    generate_previews: Optional[bool] = None,
) -> dict:
    """Generate thumbnail + preview + signal-analysis metrics for ``asset_id``."""
    return await run_asset_job(
        "derivatives",
        asset_id,
        operation=lambda service: service.generate_derivatives(
            asset_id,
            force=force,
            generate_thumbnails=generate_thumbnails,
            generate_previews=generate_previews,
        ),
        success_payload=lambda asset: {
            "thumbnail_generated": asset.thumbnail_generated_at is not None,
            "preview_generated": asset.preview_generated_at is not None,
        },
        extra_log_fields={
            "force": force,
            "generate_thumbnails": generate_thumbnails,
            "generate_previews": generate_previews,
        },
    )
