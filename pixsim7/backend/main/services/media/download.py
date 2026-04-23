"""
Media Download

Downloads remote files and optionally converts image format before storing.
Handles retries, size limits, content-addressed storage, and format conversion.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple, TYPE_CHECKING

import httpx

from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    has_retrievable_pixverse_media_url,
    is_pixverse_placeholder_url,
    normalize_url,
)
from pixsim_logging import get_logger

if TYPE_CHECKING:
    from pixsim7.backend.main.domain import Asset
    from pixsim7.backend.main.services.media.settings import MediaSettings

logger = get_logger()


async def download_file(
    asset: "Asset",
    settings: "MediaSettings",
    *,
    fast_single_attempt: bool = False,
) -> str:
    """
    Download file from remote URL to content-addressed storage.

    Uses StorageService with SHA256-based naming for automatic deduplication.
    Updates asset.local_path, stored_key, sha256, file_size_bytes, sync_status.

    ``fast_single_attempt=True`` is used by the status poller's inline-prefetch
    path to race the short-lived early-CDN window (Pixverse moderated content
    disappears ~1–2 s after the URL is advertised).  It skips the retry loop
    and uses a short HTTP timeout — if the file isn't fetchable right now, we
    bail out fast and let async ingestion (with its normal retry budget) take
    over.  The two paths share the same storage + hashing logic so the asset
    ends up in the same state either way.

    Returns:
        Path to downloaded file
    """
    url = asset.remote_url
    if not url:
        raise ValueError(f"Asset {asset.id} has no remote_url")

    normalized_url = normalize_url(url)
    if normalized_url:
        url = normalized_url

    if not url.startswith(("http://", "https://")):
        raise ValueError(f"Asset {asset.id} has invalid remote_url (missing protocol): {url[:100]}")

    if normalized_url and normalized_url != asset.remote_url:
        asset.remote_url = normalized_url
        logger.warning("download_url_fixed", asset_id=asset.id, fixed_url=normalized_url[:100])

    max_size = settings.max_download_size_mb * 1024 * 1024
    storage = get_storage_service()

    url_is_placeholder = is_pixverse_placeholder_url(url)
    url_is_retrievable = has_retrievable_pixverse_media_url(url)

    logger.info(
        "download_url_classified",
        asset_id=asset.id,
        url=url[:100],
        is_pixverse_placeholder=url_is_placeholder,
        has_retrievable_pixverse_url=url_is_retrievable,
        fast_single_attempt=fast_single_attempt,
    )
    logger.info(
        "download_starting",
        asset_id=asset.id,
        url=url[:100],
        fast_single_attempt=fast_single_attempt,
    )

    ext = guess_extension(asset)

    if fast_single_attempt:
        max_retries = 1
        retry_delay = 0.0
        http_timeout = 15.0
    else:
        max_retries = 6
        retry_delay = 2.0
        http_timeout = 120.0

    for attempt in range(max_retries):
        try:
            # Download to memory while computing hash
            content_chunks: list[bytes] = []
            total_size = 0
            sha256_hash = hashlib.sha256()

            async with httpx.AsyncClient(
                timeout=http_timeout,
                follow_redirects=True,
                headers={"User-Agent": "PixSim7/1.0"}
            ) as client:
                # Check content length first
                try:
                    head_resp = await client.head(url)
                    content_length = int(head_resp.headers.get("content-length", 0))
                    if content_length > max_size:
                        raise ValueError(
                            f"File too large: {content_length / (1024*1024):.1f}MB "
                            f"(max: {settings.max_download_size_mb}MB)"
                        )
                except httpx.HTTPError:
                    pass  # HEAD not supported, check during download

                # Stream download
                async with client.stream("GET", url) as resp:
                    resp.raise_for_status()

                    async for chunk in resp.aiter_bytes(chunk_size=1024*1024):
                        if total_size + len(chunk) > max_size:
                            raise ValueError(
                                f"Download exceeded max size: {settings.max_download_size_mb}MB"
                            )
                        content_chunks.append(chunk)
                        sha256_hash.update(chunk)
                        total_size += len(chunk)

            # Combine chunks
            content = b''.join(content_chunks)

            # Optional format conversion for images (e.g. PNG→WebP)
            content, ext = maybe_convert_image(
                asset, content, ext, settings,
            )
            # Recompute hash if content was converted
            sha256 = hashlib.sha256(content).hexdigest()
            total_size = len(content)

            # Store using content-addressed key (automatic deduplication)
            stored_key = await storage.store_with_hash(
                user_id=asset.user_id,
                sha256=sha256,
                content=content,
                extension=ext,
            )

            # Get local path from storage
            local_path = storage.get_path(stored_key)

            # Update asset with new storage location
            asset.local_path = local_path
            asset.stored_key = stored_key
            asset.file_size_bytes = total_size
            asset.sync_status = SyncStatus.DOWNLOADED
            asset.downloaded_at = datetime.now(timezone.utc)

            logger.info(
                "download_completed",
                asset_id=asset.id,
                sha256=sha256[:16],
                size_bytes=asset.file_size_bytes,
                stored_key=stored_key,
                local_path=local_path,
            )

            return local_path

        except (httpx.TimeoutException, httpx.NetworkError) as e:
            if attempt < max_retries - 1:
                logger.warning(
                    "download_retry",
                    asset_id=asset.id,
                    attempt=attempt + 1,
                    error=str(e),
                )
                await asyncio.sleep(retry_delay)
                retry_delay *= 2
            else:
                raise
        except httpx.HTTPStatusError as e:
            # Retry on 404 - CDN propagation delay after generation.
            # Provider CDNs (especially PixVerse) can take 30-90s to
            # propagate after reporting a video as "completed".
            if e.response.status_code == 404 and attempt < max_retries - 1:
                propagation_delay = 10.0 * (attempt + 1)
                logger.warning(
                    "download_retry_404",
                    asset_id=asset.id,
                    attempt=attempt + 1,
                    max_attempts=max_retries,
                    delay=propagation_delay,
                    detail="CDN propagation delay - retrying",
                    is_pixverse_placeholder=url_is_placeholder,
                    has_retrievable_pixverse_url=url_is_retrievable,
                )
                await asyncio.sleep(propagation_delay)
            else:
                raise


def guess_extension(asset: "Asset") -> str:
    """Guess file extension from asset info."""
    if asset.mime_type:
        ext = mimetypes.guess_extension(asset.mime_type)
        if ext:
            return ext

    if asset.remote_url:
        url_path = asset.remote_url.split('?')[0]
        ext = Path(url_path).suffix
        if ext:
            return ext

    if asset.media_type == MediaType.VIDEO:
        return ".mp4"
    elif asset.media_type == MediaType.IMAGE:
        return ".jpg"
    else:
        return ".bin"


def maybe_convert_image(
    asset: "Asset",
    content: bytes,
    ext: str,
    settings: "MediaSettings",
) -> Tuple[bytes, str]:
    """
    Optionally convert image to a more space-efficient format.

    Controlled by settings.storage_format / storage_quality.
    Only converts images; videos and non-image assets pass through unchanged.
    Stores original MIME type in asset.media_metadata["original_mime_type"]
    so the user can re-download the original from remote_url later.

    Returns:
        (possibly converted content bytes, possibly updated extension)
    """
    target_format = settings.storage_format_normalized
    if not target_format:
        return content, ext

    # Only convert images
    if asset.media_type != MediaType.IMAGE:
        return content, ext

    # Normalize format name
    fmt_upper = target_format.upper()
    if fmt_upper == "JPG":
        fmt_upper = "JPEG"

    # Map format to extension and mime
    fmt_map = {
        "WEBP": (".webp", "image/webp"),
        "JPEG": (".jpg", "image/jpeg"),
    }
    if fmt_upper not in fmt_map:
        logger.warning(
            "storage_format_unsupported",
            asset_id=asset.id,
            format=target_format,
        )
        return content, ext

    # Skip if already in target format
    current_ext = ext.lower()
    target_ext, target_mime = fmt_map[fmt_upper]
    if current_ext in (target_ext, target_ext.replace(".", "")):
        return content, ext

    try:
        from PIL import Image

        with Image.open(io.BytesIO(content)) as img:
            # Preserve original MIME for "get original" flow
            original_mime = asset.mime_type or mimetypes.guess_type(f"f{ext}")[0]
            if not asset.media_metadata:
                asset.media_metadata = {}
            asset.media_metadata["original_mime_type"] = original_mime

            # Convert RGBA/LA to RGB for JPEG (no alpha channel)
            if fmt_upper == "JPEG" and img.mode in ("RGBA", "LA", "P"):
                if img.mode == "RGBA":
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                else:
                    img = img.convert("RGB")

            buf = io.BytesIO()
            save_kwargs = {"quality": settings.storage_quality, "optimize": True}
            if fmt_upper == "WEBP":
                save_kwargs["method"] = 4  # balanced speed/compression
            img.save(buf, format=fmt_upper, **save_kwargs)
            converted = buf.getvalue()

        # Update asset MIME type
        asset.mime_type = target_mime

        original_size = len(content)
        new_size = len(converted)
        logger.info(
            "image_converted_for_storage",
            asset_id=asset.id,
            original_format=ext,
            target_format=target_format,
            original_bytes=original_size,
            converted_bytes=new_size,
            savings_pct=round((1 - new_size / original_size) * 100, 1) if original_size else 0,
        )

        return converted, target_ext

    except Exception as e:
        logger.warning(
            "image_conversion_failed",
            asset_id=asset.id,
            error=str(e),
            detail="Falling back to original format",
        )
        return content, ext
