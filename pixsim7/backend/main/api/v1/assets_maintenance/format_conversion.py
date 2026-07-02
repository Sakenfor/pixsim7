from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger
from .base import BackfillResultBase

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class FormatBreakdown(BaseModel):
    """Per-format count and size"""
    mime_type: str
    count: int
    size_bytes: int
    size_human: str


class FormatConversionStatsResponse(BaseModel):
    """Statistics for image format distribution and conversion potential"""
    total_images: int
    formats: list[FormatBreakdown]
    convertible_count: int
    convertible_size_bytes: int
    convertible_size_human: str
    target_format: str
    estimated_savings_pct: float


class FormatConversionResponse(BackfillResultBase):
    """Response from format conversion operation"""
    converted: int
    bytes_before: int
    bytes_after: int
    savings_bytes: int
    savings_human: str
    error_ids: list[int] = []


def _human_size(size_bytes: int | float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(size_bytes) < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# Estimated compression ratios (source → webp)
_ESTIMATED_SAVINGS: dict[str, float] = {
    "image/png": 65.0,
    "image/jpeg": 15.0,
    "image/bmp": 90.0,
    "image/tiff": 85.0,
}


@router.get("/format-conversion-stats", response_model=FormatConversionStatsResponse)
async def get_format_conversion_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    target_format: str = Query("webp", description="Target format to estimate savings for: 'webp' or 'jpeg'"),
    source_format: str = Query("", description="Only count this source MIME type (empty = all non-target)"),
):
    """
    Preview image format distribution and potential conversion savings.

    Returns per-format breakdown and how many images could be converted
    to the target format.
    """

    target_mime = {
        "webp": "image/webp",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
    }.get(target_format.lower(), f"image/{target_format.lower()}")

    try:
        # Per-format breakdown
        fmt_result = await db.execute(
            select(
                Asset.mime_type,
                func.count().label("cnt"),
                func.coalesce(func.sum(Asset.file_size_bytes), 0).label("total_bytes"),
            ).where(
                Asset.stored_key.isnot(None),
                Asset.media_type == "image",
                Asset.mime_type.isnot(None),
            ).group_by(Asset.mime_type).order_by(func.sum(Asset.file_size_bytes).desc())
        )
        rows = fmt_result.fetchall()

        formats = []
        total_images = 0
        convertible_count = 0
        convertible_bytes = 0
        weighted_savings = 0.0

        for row in rows:
            mime, count, size_bytes = row.mime_type, row.cnt, row.total_bytes
            total_images += count
            formats.append(FormatBreakdown(
                mime_type=mime,
                count=count,
                size_bytes=size_bytes,
                size_human=_human_size(size_bytes),
            ))

            # Is this format convertible to target?
            if mime != target_mime:
                if not source_format or mime == source_format:
                    convertible_count += count
                    convertible_bytes += size_bytes
                    savings = _ESTIMATED_SAVINGS.get(mime, 30.0)
                    weighted_savings += savings * size_bytes

        est_pct = (weighted_savings / convertible_bytes) if convertible_bytes > 0 else 0.0

        return FormatConversionStatsResponse(
            total_images=total_images,
            formats=formats,
            convertible_count=convertible_count,
            convertible_size_bytes=convertible_bytes,
            convertible_size_human=_human_size(convertible_bytes),
            target_format=target_format,
            estimated_savings_pct=round(est_pct, 1),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/convert-format", response_model=FormatConversionResponse)
async def convert_asset_format(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    target_format: str = Query("webp", description="Target format: 'webp' or 'jpeg'"),
    quality: int = Query(90, ge=60, le=100, description="Conversion quality (1-100)"),
    limit: int = Query(50, ge=1, le=500, description="Max assets to process per batch"),
    source_format: str = Query("image/png", description="Source MIME type to convert"),
    dry_run: bool = Query(False, description="Preview what would be converted without modifying anything"),
    require_smaller: bool = Query(
        False,
        description=(
            "Skip assets when the converted output is not smaller than the "
            "original. Opt-in safety guard — off by default so the endpoint "
            "stays usable as a generic format converter."
        ),
    ),
):
    """
    Convert existing images to a more space-efficient format.

    Processes in batches — call repeatedly until png_count reaches 0.
    The original remains available on the provider CDN via remote_url.
    """
    import hashlib
    import io
    import os
    from sqlalchemy.orm import attributes
    from pixsim7.backend.main.services.storage import get_storage_service

    fmt_upper = target_format.upper()
    if fmt_upper == "JPG":
        fmt_upper = "JPEG"
    if fmt_upper not in ("WEBP", "JPEG"):
        raise HTTPException(status_code=400, detail=f"Unsupported format: {target_format}")

    target_ext = ".webp" if fmt_upper == "WEBP" else ".jpg"
    target_mime = "image/webp" if fmt_upper == "WEBP" else "image/jpeg"

    try:
        from PIL import Image

        storage = get_storage_service()

        result = await db.execute(
            select(Asset).where(
                Asset.mime_type == source_format,
                Asset.stored_key.isnot(None),
                Asset.media_type == "image",
            ).order_by(Asset.id.asc()).limit(limit)
        )
        assets = result.scalars().all()

        processed = 0
        converted = 0
        skipped = 0
        errors = 0
        error_ids: list[int] = []
        bytes_before = 0
        bytes_after = 0

        for asset in assets:
            processed += 1

            # Get source file path
            source_path = storage.get_path(asset.stored_key)
            if not os.path.exists(source_path):
                skipped += 1
                continue

            original_size = os.path.getsize(source_path)

            if dry_run:
                # Estimate: WebP ~65% smaller, JPEG ~50% smaller for PNGs.
                # Guard is a live-only check — we can't know the exact output
                # size without actually encoding.
                est_ratio = 0.35 if fmt_upper == "WEBP" else 0.50
                bytes_before += original_size
                bytes_after += int(original_size * est_ratio)
                converted += 1
                continue

            try:
                # Convert
                with Image.open(source_path) as img:
                    if fmt_upper == "JPEG" and img.mode in ("RGBA", "LA", "P"):
                        if img.mode == "RGBA":
                            background = Image.new("RGB", img.size, (255, 255, 255))
                            background.paste(img, mask=img.split()[3])
                            img = background
                        else:
                            img = img.convert("RGB")

                    buf = io.BytesIO()
                    save_kwargs = {"quality": quality, "optimize": True}
                    if fmt_upper == "WEBP":
                        save_kwargs["method"] = 4
                    img.save(buf, format=fmt_upper, **save_kwargs)
                    new_content = buf.getvalue()

                new_size = len(new_content)

                # Opt-in guard: skip when the converted output isn't smaller.
                # Bytes counters are untouched for skipped assets so the final
                # savings number only reflects real conversions.
                if require_smaller and new_size >= original_size:
                    skipped += 1
                    logger.info(
                        "format_conversion_skipped_not_smaller",
                        asset_id=asset.id,
                        original_bytes=original_size,
                        would_be_bytes=new_size,
                    )
                    continue

                bytes_before += original_size
                bytes_after += new_size

                # Store with new hash
                new_sha256 = hashlib.sha256(new_content).hexdigest()
                new_key = await storage.store_with_hash(
                    user_id=asset.user_id,
                    sha256=new_sha256,
                    content=new_content,
                    extension=target_ext,
                )
                new_path = storage.get_path(new_key)

                # Preserve original MIME in metadata
                if not asset.media_metadata:
                    asset.media_metadata = {}
                asset.media_metadata["original_mime_type"] = asset.mime_type
                asset.media_metadata["original_stored_key"] = asset.stored_key

                # Update asset
                old_key = asset.stored_key
                asset.stored_key = new_key
                asset.local_path = new_path
                asset.sha256 = new_sha256
                asset.mime_type = target_mime
                asset.file_size_bytes = new_size
                asset.logical_size_bytes = new_size
                attributes.flag_modified(asset, "media_metadata")

                # Commit per-asset so a failure partway through a long batch
                # doesn't discard earlier successful conversions.
                await db.commit()

                # Post-commit: delete old blob if no other asset references it.
                # Done after commit so the row's new stored_key is persisted
                # before we remove the old file (avoids races with readers).
                sibling_count = (await db.execute(
                    select(func.count()).select_from(Asset).where(
                        Asset.stored_key == old_key,
                    )
                )).scalar() or 0
                if sibling_count == 0 and os.path.exists(source_path):
                    try:
                        os.remove(source_path)
                    except OSError as del_err:
                        logger.warning(
                            "format_conversion_old_blob_delete_failed",
                            asset_id=asset.id,
                            old_key=old_key,
                            error=str(del_err),
                        )

                converted += 1

                logger.info(
                    "format_conversion_success",
                    asset_id=asset.id,
                    original_bytes=original_size,
                    new_bytes=new_size,
                    savings_pct=round((1 - new_size / original_size) * 100, 1),
                )

            except Exception as exc:
                # Roll back the current asset's pending mutations so the next
                # iteration starts from a clean session state.
                try:
                    await db.rollback()
                except Exception:
                    pass
                errors += 1
                error_ids.append(asset.id)
                logger.warning(
                    "format_conversion_failed",
                    asset_id=asset.id,
                    error=str(exc),
                )

        savings = bytes_before - bytes_after

        return FormatConversionResponse(
            success=True,
            processed=processed,
            converted=converted,
            skipped=skipped,
            errors=errors,
            bytes_before=bytes_before,
            bytes_after=bytes_after,
            savings_bytes=savings,
            savings_human=_human_size(savings),
            error_ids=error_ids[:20],
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "format_conversion_error",
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to convert formats: {str(exc)}"
        )
