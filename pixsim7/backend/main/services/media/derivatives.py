"""
Media Derivatives

Generates thumbnails and preview images for assets.
Handles both image (Pillow) and video (ffmpeg) sources.
"""
from __future__ import annotations

import asyncio
import json
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


# ── Frame extraction (shared) ───────────────────────────────────────────────

# Default frame-grab resolution for embedding.  SigLIP2-large runs at 384px, so
# grab at model resolution rather than the 320px thumbnail size.
DEFAULT_FRAME_SIZE = (384, 384)


async def extract_video_frame(
    local_path: str,
    output_path: str,
    *,
    timestamp: float,
    target_size: tuple[int, int],
    rotation_filters: list[str] | None = None,
    qscale: int = 3,
    timeout: int = 30,
    asset_id: int | None = None,
    op: str = "frame",
) -> bool:
    """Extract one frame from ``local_path`` at ``timestamp``, scaled to fit
    ``target_size`` (aspect-ratio preserved), written as JPEG to ``output_path``.

    Shared by thumbnail/preview generation and the embedding frame-grab. The
    caller owns content validation (``_validate_extracted_frame``) and rotation
    discovery (``ensure_video_rotation`` + ``_get_video_rotation_filters``); this
    just runs ffmpeg.

    Returns True iff ffmpeg exited 0 and produced a file. ``op`` is woven into
    the structured-log event name (``ffmpeg_{op}_failed`` / ``_timeout``) so
    callers keep distinct log signals.
    """
    vf_parts = list(rotation_filters or [])
    vf_parts.append(
        f"scale={target_size[0]}:{target_size[1]}:force_original_aspect_ratio=decrease"
    )

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(timestamp),
        "-i", local_path,
        "-vframes", "1",
        "-vf", ",".join(vf_parts),
        "-q:v", str(qscale),
        output_path,
    ]

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(cmd, capture_output=True, timeout=timeout),
        )
    except subprocess.TimeoutExpired:
        logger.warning(f"ffmpeg_{op}_timeout", asset_id=asset_id, timestamp=timestamp)
        return False
    except FileNotFoundError:
        logger.warning(
            "ffmpeg_not_found",
            asset_id=asset_id,
            detail=f"ffmpeg not available for video {op} generation",
        )
        return False

    if result.returncode != 0:
        logger.warning(
            f"ffmpeg_{op}_failed",
            asset_id=asset_id,
            timestamp=timestamp,
            stderr=result.stderr.decode()[:200],
        )
        return False

    return Path(output_path).exists()


def evenly_spaced_timestamps(duration_sec: float | None, count: int) -> list[float]:
    """``count`` timestamps spread across a clip's duration.

    Interior points at ``(i+1)/(count+1)`` of the duration, so the often
    black / letterboxed very-first and very-last frames are skipped. Falls back
    to a single ``0.0`` grab when the duration is unknown (best-effort first
    frame) rather than emitting duplicate timestamps.
    """
    n = max(1, count)
    duration = float(duration_sec or 0.0)
    if duration <= 0:
        return [0.0]
    return [duration * (i + 1) / (n + 1) for i in range(n)]


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

    # Validate video is actually playable before attempting frame extraction.
    # Provider CDNs can return HTTP 200 for not-yet-encoded videos; these
    # files either make ffmpeg fail or produce blank grey frames.
    if not _validate_video_for_thumbnail(asset, local_path):
        return

    # Ensure rotation metadata is available so thumbnails are oriented correctly.
    ensure_video_rotation(asset, local_path)

    # Extract frame at 1 second (or middle if shorter)
    timestamp = min(1.0, (asset.duration_sec or 0) / 2)

    thumb_key = get_thumbnail_key(asset)
    thumb_path = storage.get_path(thumb_key)

    ok = await extract_video_frame(
        local_path,
        thumb_path,
        timestamp=timestamp,
        target_size=settings.thumbnail_size,
        rotation_filters=_get_video_rotation_filters(asset),
        qscale=3,
        asset_id=asset.id,
        op="thumbnail",
    )
    if not ok:
        return

    # Verify the extracted frame is a valid, non-degenerate image.
    # Partially-encoded videos can produce tiny grey placeholder frames.
    if not _validate_extracted_frame(thumb_path, asset.id):
        try:
            Path(thumb_path).unlink(missing_ok=True)
        except OSError:
            pass
        return

    asset.thumbnail_key = thumb_key

    logger.debug(
        "video_thumbnail_generated",
        asset_id=asset.id,
        sha256=asset.sha256[:16] if asset.sha256 else None,
        key=thumb_key,
    )


# ── Previews ──────────────────────────────────────────────────────────────

# Below this source dimension we skip preview generation entirely — the asset
# uses just the thumbnail (320).  Threshold is independent of ``preview_size``
# so bumping the preview cap doesn't silently strip previews from medium-res
# sources.  PIL.thumbnail() never upscales, so an 800×800 source with a
# preview cap of 1600 produces an 800×800 preview (re-encoded for size
# savings vs the original).
_MIN_PREVIEW_SOURCE_SIZE = 800


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

        # Skip preview generation only when source is too small to add value
        # over the thumbnail.  Decoupled from ``preview_size`` so bumping the
        # cap doesn't strip previews from medium-res sources (e.g. 1024×1024
        # AI-generated content with a 1600 cap — preview stays at 1024).
        max_dimension = max(img.size)
        if max_dimension < _MIN_PREVIEW_SOURCE_SIZE:
            logger.debug(
                "skip_image_preview_low_quality",
                asset_id=asset.id,
                resolution=f"{img.size[0]}x{img.size[1]}",
                reason=f"Image resolution ({max_dimension}px) below preview source threshold ({_MIN_PREVIEW_SOURCE_SIZE}px)",
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

    # Validate video is playable (same check as thumbnail)
    if not _validate_video_for_thumbnail(asset, local_path):
        return

    # Ensure rotation metadata is available so previews are oriented correctly.
    ensure_video_rotation(asset, local_path)

    preview_size = settings.preview_size

    # Skip preview generation only when source is too small to add value
    # over the thumbnail.  See _MIN_PREVIEW_SOURCE_SIZE comment above.
    if asset.width and asset.height:
        max_dimension = max(asset.width, asset.height)
        if max_dimension < _MIN_PREVIEW_SOURCE_SIZE:
            logger.debug(
                "skip_video_preview_low_quality",
                asset_id=asset.id,
                resolution=f"{asset.width}x{asset.height}",
                reason=f"Video resolution ({max_dimension}p) below preview source threshold ({_MIN_PREVIEW_SOURCE_SIZE}px)",
            )
            return

    # Extract frame at 1 second (or middle if shorter)
    timestamp = min(1.0, (asset.duration_sec or 0) / 2)

    preview_key = f"u/{asset.user_id}/previews/{asset.id}.jpg"
    preview_path = storage.get_path(preview_key)

    preview_quality = settings.preview_quality

    # Map quality (1-100) to ffmpeg qscale (2-31, lower is better)
    qscale = max(2, min(31, int(2 + (100 - preview_quality) / 10)))

    ok = await extract_video_frame(
        local_path,
        preview_path,
        timestamp=timestamp,
        target_size=preview_size,
        rotation_filters=_get_video_rotation_filters(asset),
        qscale=qscale,
        asset_id=asset.id,
        op="preview",
    )
    if not ok:
        return

    if not _validate_extracted_frame(preview_path, asset.id):
        try:
            Path(preview_path).unlink(missing_ok=True)
        except OSError:
            pass
        return

    asset.preview_key = preview_key

    logger.debug(
        "video_preview_generated",
        asset_id=asset.id,
        key=preview_key,
    )


# ── Validation ────────────────────────────────────────────────────────────

# Minimum file size (bytes) for a valid JPEG frame.  A fully grey/blank
# 256×144 JPEG compresses to well under 1 KB; real video frames are larger.
_MIN_FRAME_SIZE_BYTES = 1024


def _validate_video_for_thumbnail(asset: "Asset", local_path: str) -> bool:
    """
    Quick-check that a downloaded video is complete enough for frame extraction.

    Provider CDNs sometimes return HTTP 200 with a file that is still being
    encoded.  ffmpeg may then either fail or extract a blank grey frame.
    We use ffprobe to verify the file has a decodable video stream with
    non-zero duration before attempting extraction.
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=duration,nb_frames,codec_name:format=duration",
            "-of", "json",
            local_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            logger.warning(
                "video_thumbnail_skipped_probe_failed",
                asset_id=asset.id,
                stderr=result.stderr[:200],
            )
            return False

        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        if not streams:
            logger.warning(
                "video_thumbnail_skipped_no_stream",
                asset_id=asset.id,
            )
            return False

        # Check for non-zero duration (prefer stream, fallback to format)
        stream_dur = streams[0].get("duration")
        format_dur = (data.get("format") or {}).get("duration")
        duration = float(stream_dur or format_dur or 0)
        if duration <= 0:
            logger.warning(
                "video_thumbnail_skipped_zero_duration",
                asset_id=asset.id,
                detail="Video has zero duration — likely not fully encoded yet",
            )
            return False

        return True

    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
        logger.warning(
            "video_thumbnail_skipped_probe_error",
            asset_id=asset.id,
            error=str(e),
        )
        return False


def _validate_extracted_frame(frame_path: str, asset_id: int) -> bool:
    """
    Verify an ffmpeg-extracted frame is a real image, not a blank/grey
    placeholder.  Checks file size and pixel variance.
    """
    path = Path(frame_path)
    if not path.exists():
        logger.warning("extracted_frame_missing", asset_id=asset_id)
        return False

    size = path.stat().st_size
    if size < _MIN_FRAME_SIZE_BYTES:
        logger.warning(
            "extracted_frame_too_small",
            asset_id=asset_id,
            size_bytes=size,
            detail="Extracted frame is suspiciously small — likely blank",
        )
        return False

    # Check that the image has meaningful content (not a uniform grey frame).
    # A real video frame will have pixel variance; a placeholder won't.
    try:
        from PIL import Image
        from statistics import stdev as _stdev

        with Image.open(frame_path) as img:
            # Sample a small thumbnail to keep this fast
            small = img.resize((32, 32)).convert("L")
            pixels = list(small.getdata())
            if len(set(pixels)) <= 2:
                # Effectively uniform — blank or near-blank frame
                logger.warning(
                    "extracted_frame_blank",
                    asset_id=asset_id,
                    unique_values=len(set(pixels)),
                    detail="Frame appears blank (uniform grey) — video likely not ready",
                )
                return False
            # Also check standard deviation — very low stdev means near-uniform
            stdev = _stdev(pixels)
            if stdev < 3.0:
                logger.warning(
                    "extracted_frame_near_blank",
                    asset_id=asset_id,
                    stdev=round(stdev, 2),
                    detail="Frame has extremely low variance — likely placeholder",
                )
                return False
    except Exception as e:
        logger.warning(
            "extracted_frame_validation_error",
            asset_id=asset_id,
            error=str(e),
        )
        # If we can't validate, allow it (better than blocking all thumbnails)
        return True

    return True


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
