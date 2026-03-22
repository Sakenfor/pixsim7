"""
Media Derivatives

Generates thumbnails and preview images for assets.
Handles both image (Pillow) and video (ffmpeg) sources.
"""
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim_logging import get_logger

if TYPE_CHECKING:
    from pixsim7.backend.main.domain import Asset
    from pixsim7.backend.main.services.media.settings import MediaSettings

logger = get_logger()


# ── Thumbnails ────────────────────────────────────────────────────────────

async def generate_thumbnail(
    asset: "Asset", local_path: str, settings: "MediaSettings",
) -> None:
    """
    Generate thumbnail for asset.

    For images: Resize to thumbnail size
    For videos: Extract frame and resize
    """
    try:
        if asset.media_type == MediaType.IMAGE:
            await _generate_image_thumbnail(asset, local_path, settings)
        elif asset.media_type == MediaType.VIDEO:
            await _generate_video_thumbnail(asset, local_path, settings)

    except Exception as e:
        logger.warning(
            "thumbnail_generation_failed",
            asset_id=asset.id,
            error=str(e),
        )


async def _generate_image_thumbnail(
    asset: "Asset", local_path: str, settings: "MediaSettings",
) -> None:
    """Generate thumbnail for image."""
    from PIL import Image, ImageOps

    storage = get_storage_service()
    thumb_size = settings.thumbnail_size
    thumb_quality = settings.thumbnail_quality
    thumb_key = get_thumbnail_key(asset)
    thumb_path = storage.get_path(thumb_key)
    Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)

    with Image.open(local_path) as img:
        # Handle EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Convert to RGB if needed (for PNG with alpha)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')

        # Create thumbnail (maintains aspect ratio)
        img.thumbnail(thumb_size, Image.Resampling.LANCZOS)
        img.save(thumb_path, "JPEG", quality=thumb_quality, optimize=True)

    asset.thumbnail_key = thumb_key

    logger.debug(
        "thumbnail_generated",
        asset_id=asset.id,
        sha256=asset.sha256[:16] if asset.sha256 else None,
        key=thumb_key,
    )


async def _generate_video_thumbnail(
    asset: "Asset", local_path: str, settings: "MediaSettings",
) -> None:
    """Generate thumbnail for video by extracting a frame."""
    from .metadata import ensure_video_rotation

    storage = get_storage_service()

    # Ensure rotation metadata is available so thumbnails are oriented correctly.
    ensure_video_rotation(asset, local_path)

    # Extract frame at 1 second (or middle if shorter)
    timestamp = min(1.0, (asset.duration_sec or 0) / 2)

    thumb_key = get_thumbnail_key(asset)
    thumb_path = storage.get_path(thumb_key)
    Path(thumb_path).parent.mkdir(parents=True, exist_ok=True)

    thumb_size = settings.thumbnail_size
    vf_parts = _get_video_rotation_filters(asset)
    vf_parts.append(
        f"scale={thumb_size[0]}:{thumb_size[1]}:force_original_aspect_ratio=decrease"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(timestamp),
        "-i", local_path,
        "-vframes", "1",
        "-vf", ",".join(vf_parts),
        "-q:v", "3",
        thumb_path
    ]

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(cmd, capture_output=True, timeout=30)
        )

        if result.returncode != 0:
            logger.warning(
                "ffmpeg_thumbnail_failed",
                asset_id=asset.id,
                stderr=result.stderr.decode()[:200],
            )
            return

        asset.thumbnail_key = thumb_key

        logger.debug(
            "video_thumbnail_generated",
            asset_id=asset.id,
            sha256=asset.sha256[:16] if asset.sha256 else None,
            key=thumb_key,
        )

    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg_thumbnail_timeout", asset_id=asset.id)
    except FileNotFoundError:
        logger.warning(
            "ffmpeg_not_found",
            asset_id=asset.id,
            detail="ffmpeg not available for video thumbnail generation"
        )


# ── Previews ──────────────────────────────────────────────────────────────

async def generate_preview(
    asset: "Asset", local_path: str, settings: "MediaSettings",
) -> None:
    """
    Generate preview derivative for asset.

    For images: Larger, higher-quality resize
    For videos: Extract HD poster frame
    """
    try:
        if asset.media_type == MediaType.IMAGE:
            await _generate_image_preview(asset, local_path, settings)
        elif asset.media_type == MediaType.VIDEO:
            await _generate_video_preview(asset, local_path, settings)
    except Exception as e:
        logger.warning(
            "preview_generation_failed",
            asset_id=asset.id,
            error=str(e),
        )


async def _generate_image_preview(
    asset: "Asset", local_path: str, settings: "MediaSettings",
) -> None:
    """Generate high-quality preview for image."""
    from PIL import Image, ImageOps

    storage = get_storage_service()
    preview_size = settings.preview_size
    preview_quality = settings.preview_quality

    with Image.open(local_path) as img:
        # Handle EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Skip preview generation for low-quality images (avoid upscaling)
        max_dimension = max(img.size)
        if max_dimension < preview_size[0]:
            logger.debug(
                "skip_image_preview_low_quality",
                asset_id=asset.id,
                resolution=f"{img.size[0]}x{img.size[1]}",
                reason=f"Image resolution ({max_dimension}px) is lower than preview size ({preview_size[0]}px)",
            )
            return

        # Convert to RGB if needed
        if img.mode in ('RGBA', 'LA', 'P'):
            # Create white background for transparent images
            if img.mode == 'RGBA':
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])  # Use alpha as mask
                img = background
            else:
                img = img.convert('RGB')

        # Create preview (maintains aspect ratio)
        img.thumbnail(preview_size, Image.Resampling.LANCZOS)

        # Save to storage
        preview_key = f"u/{asset.user_id}/previews/{asset.id}.jpg"
        preview_path = storage.get_path(preview_key)

        Path(preview_path).parent.mkdir(parents=True, exist_ok=True)

        img.save(preview_path, "JPEG", quality=preview_quality, optimize=True)

    asset.preview_key = preview_key

    logger.debug(
        "preview_generated",
        asset_id=asset.id,
        key=preview_key,
        quality=preview_quality,
    )


async def _generate_video_preview(
    asset: "Asset", local_path: str, settings: "MediaSettings",
) -> None:
    """Generate high-quality poster frame for video."""
    from .metadata import ensure_video_rotation

    storage = get_storage_service()

    # Ensure rotation metadata is available so previews are oriented correctly.
    ensure_video_rotation(asset, local_path)

    preview_size = settings.preview_size

    # Skip preview generation for low-quality videos (avoid upscaling)
    if asset.width and asset.height:
        max_dimension = max(asset.width, asset.height)
        if max_dimension < preview_size[0]:
            logger.debug(
                "skip_video_preview_low_quality",
                asset_id=asset.id,
                resolution=f"{asset.width}x{asset.height}",
                reason=f"Video resolution ({max_dimension}p) is lower than preview size ({preview_size[0]}px)",
            )
            return

    # Extract frame at 1 second (or middle if shorter)
    timestamp = min(1.0, (asset.duration_sec or 0) / 2)

    preview_key = f"u/{asset.user_id}/previews/{asset.id}.jpg"
    preview_path = storage.get_path(preview_key)

    Path(preview_path).parent.mkdir(parents=True, exist_ok=True)

    preview_quality = settings.preview_quality

    # Map quality (1-100) to ffmpeg qscale (2-31, lower is better)
    qscale = max(2, min(31, int(2 + (100 - preview_quality) / 10)))

    vf_parts = _get_video_rotation_filters(asset)
    vf_parts.append(
        f"scale={preview_size[0]}:{preview_size[1]}:force_original_aspect_ratio=decrease"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(timestamp),
        "-i", local_path,
        "-vframes", "1",
        "-vf", ",".join(vf_parts),
        "-q:v", str(qscale),
        preview_path
    ]

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(cmd, capture_output=True, timeout=30)
        )

        if result.returncode != 0:
            logger.warning(
                "ffmpeg_preview_failed",
                asset_id=asset.id,
                stderr=result.stderr.decode()[:200],
            )
            return

        asset.preview_key = preview_key

        logger.debug(
            "video_preview_generated",
            asset_id=asset.id,
            key=preview_key,
        )

    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg_preview_timeout", asset_id=asset.id)
    except FileNotFoundError:
        logger.warning(
            "ffmpeg_not_found",
            asset_id=asset.id,
            detail="ffmpeg not available for video preview generation"
        )


# ── Helpers ───────────────────────────────────────────────────────────────

def get_thumbnail_key(asset: "Asset") -> str:
    """
    Get the storage key for an asset's thumbnail.

    Uses SHA256-based naming for deduplication when available,
    falls back to asset ID for legacy assets.
    """
    if asset.sha256:
        hash_prefix = asset.sha256[:2]
        return f"u/{asset.user_id}/thumbnails/{hash_prefix}/{asset.sha256}.jpg"
    else:
        return f"u/{asset.user_id}/thumbnails/{asset.id}.jpg"


def _get_video_rotation_filters(asset: "Asset") -> list[str]:
    """
    Get ffmpeg video filter parts for rotation correction.

    Reads rotation from asset.media_metadata.video_info.rotation
    and returns appropriate transpose/flip filters.
    """
    rotation = None
    if asset.media_metadata and isinstance(asset.media_metadata, dict):
        rotation = (
            asset.media_metadata.get("video_info", {}) or {}
        ).get("rotation")

    filters: list[str] = []
    if rotation in (90, -270):
        filters.append("transpose=1")
    elif rotation in (-90, 270):
        filters.append("transpose=2")
    elif rotation in (180, -180):
        filters.append("hflip,vflip")

    return filters
