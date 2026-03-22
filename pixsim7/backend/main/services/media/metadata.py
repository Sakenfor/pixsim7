"""
Media Metadata Extraction

Extracts dimensions, duration, MIME type, and codec info from image and video files.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Dict, Any, Optional, TYPE_CHECKING

from pixsim7.backend.main.domain.enums import MediaType
from pixsim_logging import get_logger

if TYPE_CHECKING:
    from pixsim7.backend.main.domain import Asset

logger = get_logger()


async def extract_metadata(asset: "Asset", local_path: str) -> None:
    """
    Extract metadata from file.

    Updates: width, height, duration_sec, fps, mime_type
    """
    path = Path(local_path)

    # Guess MIME type
    mime_type, _ = mimetypes.guess_type(str(path))
    if mime_type:
        asset.mime_type = mime_type

    if asset.media_type == MediaType.IMAGE:
        await extract_image_metadata(asset, local_path)
    elif asset.media_type == MediaType.VIDEO:
        await extract_video_metadata(asset, local_path)


async def extract_image_metadata(asset: "Asset", local_path: str) -> None:
    """Extract metadata from image file."""
    try:
        from PIL import Image

        with Image.open(local_path) as img:
            asset.width = img.width
            asset.height = img.height

        logger.debug(
            "image_metadata_extracted",
            asset_id=asset.id,
            width=asset.width,
            height=asset.height,
        )

    except Exception as e:
        logger.warning(
            "image_metadata_extraction_failed",
            asset_id=asset.id,
            error=str(e),
        )


async def extract_video_metadata(asset: "Asset", local_path: str) -> None:
    """Extract metadata from video file using ffprobe."""
    try:
        from pixsim7.backend.main.shared.video_utils import get_video_metadata

        metadata = get_video_metadata(local_path)
        apply_video_metadata(asset, metadata)

        logger.debug(
            "video_metadata_extracted",
            asset_id=asset.id,
            width=asset.width,
            height=asset.height,
            duration=asset.duration_sec,
        )

    except Exception as e:
        logger.warning(
            "video_metadata_extraction_failed",
            asset_id=asset.id,
            error=str(e),
            detail="ffprobe may not be available"
        )


def apply_video_metadata(
    asset: "Asset",
    metadata: Dict[str, Any],
    *,
    fill_missing_only: bool = False,
) -> None:
    """
    Apply ffprobe metadata to the asset.

    When fill_missing_only is True, only backfill fields that are empty.
    """
    def should_update(value: Any) -> bool:
        return not fill_missing_only or value in (None, 0, "")

    if should_update(asset.width):
        asset.width = metadata.get("width")
    if should_update(asset.height):
        asset.height = metadata.get("height")
    if should_update(asset.duration_sec):
        asset.duration_sec = metadata.get("duration")
    if should_update(asset.fps):
        asset.fps = metadata.get("fps")

    if not asset.media_metadata:
        asset.media_metadata = {}
    video_info = asset.media_metadata.get("video_info") or {}

    for key in ("codec", "bitrate", "format", "rotation"):
        if key in metadata and (not fill_missing_only or video_info.get(key) in (None, 0, "")):
            video_info[key] = metadata.get(key)

    asset.media_metadata["video_info"] = video_info


def ensure_video_rotation(asset: "Asset", local_path: str) -> Optional[int]:
    """
    Ensure rotation metadata is available for video thumbnails/previews.

    Falls back to ffprobe if rotation is missing, and backfills width/height/duration
    when available. Returns the detected rotation (or None).
    """
    rotation = None
    if asset.media_metadata and isinstance(asset.media_metadata, dict):
        rotation = (asset.media_metadata.get("video_info", {}) or {}).get("rotation")

    if rotation is not None:
        return rotation

    try:
        from pixsim7.backend.main.shared.video_utils import get_video_metadata

        metadata = get_video_metadata(local_path)
        apply_video_metadata(asset, metadata, fill_missing_only=True)
        return metadata.get("rotation")
    except Exception:
        return rotation
