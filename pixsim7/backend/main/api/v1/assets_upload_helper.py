"""
Shared upload preparation helper

Consolidates common logic between upload_asset_to_provider and upload_asset_from_url:
- SHA256 computation
- Phash computation for images
- Deduplication checks (sha256 + phash)
- CAS storage
- Thumbnail queuing
- Upload history tracking
"""
import os
from typing import Optional, Tuple, NamedTuple
from dataclasses import dataclass

from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.asset.asset_hasher import compute_image_phash
from pixsim_logging import get_logger

logger = get_logger()


@dataclass
class UploadPrepResult:
    """Result of upload preparation"""
    sha256: Optional[str] = None
    image_hash: Optional[str] = None
    phash64: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    stored_key: Optional[str] = None
    local_path: Optional[str] = None
    existing_asset: Optional[object] = None  # Asset if dedup found
    dedup_note: Optional[str] = None


async def prepare_upload(
    tmp_path: str,
    user_id: int,
    media_type: MediaType,
    asset_service,
    provider_id: str,
    file_ext: str = ".bin",
) -> UploadPrepResult:
    """
    Prepare a file for upload - compute hashes, check for duplicates, store in CAS.

    Args:
        tmp_path: Path to temporary file
        user_id: User ID
        media_type: MediaType.IMAGE or MediaType.VIDEO
        asset_service: AssetService instance
        provider_id: Target provider ID
        file_ext: File extension

    Returns:
        UploadPrepResult with computed values and any existing asset found
    """
    result = UploadPrepResult()

    # 1. Compute SHA256
    try:
        result.sha256 = asset_service._compute_sha256(tmp_path)
    except Exception as e:
        logger.warning(
            "upload_sha256_failed",
            error=str(e),
            detail="Continuing without sha256",
        )

    # 2. Compute phash + dimensions for images
    if media_type == MediaType.IMAGE:
        try:
            from PIL import Image
            with Image.open(tmp_path) as img:
                result.width, result.height = img.size
            result.image_hash, result.phash64 = compute_image_phash(tmp_path)
        except Exception as e:
            logger.warning(
                "upload_phash_failed",
                error=str(e),
                detail="Continuing without phash",
            )

    # 3. Check SHA256 deduplication
    if result.sha256:
        try:
            existing = await asset_service.find_asset_by_hash(result.sha256, user_id)
            if existing:
                already_on_provider = (
                    existing.provider_id == provider_id or
                    provider_id in (existing.provider_uploads or {})
                )
                if already_on_provider:
                    result.existing_asset = existing
                    result.dedup_note = f"Deduplicated by sha256, already on {provider_id}"
                    return result
                else:
                    # Exists but not on this provider - will update provider_uploads
                    result.existing_asset = existing
                    result.dedup_note = "sha256_cross_provider"
        except Exception as e:
            logger.warning(
                "upload_dedup_sha256_failed",
                error=str(e),
            )

    # 4. Check phash near-duplicate (if no sha256 match)
    if result.phash64 is not None and not result.existing_asset:
        try:
            similar = await asset_service.find_similar_asset_by_phash(result.phash64, user_id, max_distance=5)
            if similar:
                already_on_provider = (
                    similar.provider_id == provider_id or
                    provider_id in (similar.provider_uploads or {})
                )
                if already_on_provider:
                    result.existing_asset = similar
                    result.dedup_note = f"Deduplicated by phash, already on {provider_id}"
                    return result
                else:
                    result.existing_asset = similar
                    result.dedup_note = "phash_cross_provider"
        except Exception as e:
            logger.warning(
                "upload_dedup_phash_failed",
                error=str(e),
            )

    # 5. Store in CAS (if we have sha256 and no complete dedup)
    if result.sha256 and result.dedup_note not in ["Deduplicated by sha256", "Deduplicated by phash"]:
        try:
            from pixsim7.backend.main.services.storage.storage_service import get_storage_service
            storage_service = get_storage_service()
            result.stored_key = await storage_service.store_from_path_with_hash(
                user_id=user_id,
                sha256=result.sha256,
                source_path=tmp_path,
                extension=file_ext
            )
            result.local_path = storage_service.get_path(result.stored_key)
            logger.info(
                "upload_cas_stored",
                user_id=user_id,
                sha256=result.sha256[:16],
                stored_key=result.stored_key,
            )
        except Exception as e:
            logger.warning(
                "upload_cas_failed",
                error=str(e),
                detail="Continuing with provider upload only",
            )

    return result


async def finalize_upload(
    asset,
    asset_service,
    db,
    provider_id: str,
    stored_key: Optional[str],
    source_context: Optional[str] = None,
):
    """
    Finalize upload - queue thumbnails and record history.

    Args:
        asset: Created/updated Asset
        asset_service: AssetService instance
        db: Database session
        provider_id: Provider ID
        stored_key: CAS storage key (if stored)
        source_context: Source context for history
    """
    if not asset:
        return

    # Queue thumbnail generation if we have a local copy
    if stored_key:
        try:
            from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService
            ingestion_service = AssetIngestionService(db)
            await ingestion_service.queue_ingestion(asset.id)
        except Exception as e:
            logger.warning(
                "upload_thumbnail_queue_failed",
                asset_id=asset.id,
                error=str(e),
            )

    # Record upload history
    try:
        await asset_service.record_upload_attempt(
            asset,
            provider_id=provider_id,
            status='success',
            method='upload',
            context={'source': source_context or 'direct'},
        )
    except Exception as e:
        logger.warning(
            "upload_history_failed",
            asset_id=asset.id,
            error=str(e),
        )
