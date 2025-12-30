"""
Pixverse Asset Sync API

First-class endpoints for syncing Pixverse videos/images into Assets,
without triggering lineage creation.
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import get_current_user, get_database
from pixsim7.backend.main.domain import Asset, User
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/providers/pixverse", tags=["pixverse", "sync"])


def _extract_video_id(video: Dict[str, Any]) -> Optional[str]:
    """
    Best-effort extraction of a video ID from Pixverse video payload.
    Tries common keys ('video_id', 'VideoId', 'id'). Returns string or None.
    """
    for key in ("video_id", "VideoId", "id"):
        if key in video and video[key] is not None:
            return str(video[key])
    return None


def _extract_image_id(image: Dict[str, Any]) -> Optional[str]:
    """
    Best-effort extraction of an image ID from Pixverse image payload.
    Tries common keys ('image_id', 'ImageId', 'id'). Returns string or None.
    """
    for key in ("image_id", "ImageId", "id"):
        if key in image and image[key] is not None:
            return str(image[key])
    return None


def _extract_video_url(video: Dict[str, Any]) -> Optional[str]:
    """Extract the best video URL from a Pixverse video payload."""
    for key in ("video_url", "url", "customer_video_url"):
        if key in video and video[key]:
            return str(video[key])
    return None


def _extract_video_thumbnail(video: Dict[str, Any]) -> Optional[str]:
    """Extract a thumbnail URL from a Pixverse video payload."""
    for key in ("customer_video_last_frame_url", "first_frame", "thumbnail", "cover"):
        if key in video and video[key]:
            return str(video[key])
    return None


def _extract_image_url(image: Dict[str, Any]) -> Optional[str]:
    """Extract the best image URL from a Pixverse image payload."""
    for key in ("image_url", "url"):
        if key in image and image[key]:
            return str(image[key])
    return None


async def _get_pixverse_account(
    account_id: int,
    current_user: User,
    db: AsyncSession,
) -> ProviderAccount:
    """Load and validate a Pixverse ProviderAccount for the current user."""
    stmt = select(ProviderAccount).where(
        ProviderAccount.id == account_id,
        ProviderAccount.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()

    if not account or account.provider_id != "pixverse":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pixverse account not found for current user",
        )
    return account


def _get_pixverse_provider_and_client(account: ProviderAccount):
    """Instantiate PixverseProvider and create a client for the given account."""
    try:
        provider = PixverseProvider()
    except ImportError as e:
        logger.error("pixverse_py_not_installed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="pixverse-py is not installed on the backend",
        )

    client = provider._create_client(account)
    return provider, client


@router.get("/accounts/{account_id}/sync-dry-run")
async def pixverse_sync_dry_run(
    account_id: int,
    limit: int = Query(50, ge=1, le=200, description="Max items to inspect"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    include_images: bool = Query(True, description="Include images in the scan"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """
    Dry-run Pixverse library sync for a single account.

    - Scans Pixverse videos and optionally images using the stored account credentials.
    - Compares remote IDs against local Asset rows for the same user/provider.
    - Returns counts and per-item `already_imported` flags.
    - This endpoint does not create or modify any assets.
    """
    account = await _get_pixverse_account(account_id, current_user, db)
    provider, client = _get_pixverse_provider_and_client(account)

    # Fetch videos (client.list_videos now returns a coroutine)
    try:
        videos: List[Dict[str, Any]] = await client.list_videos(limit=limit, offset=offset)
    except Exception as e:
        logger.error(
            "pixverse_list_videos_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            account_id=account_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to list Pixverse videos: {e}",
        )

    # Extract video IDs
    video_items: List[Dict[str, Any]] = []
    video_ids: List[str] = []
    for v in videos:
        vid = _extract_video_id(v)
        video_items.append({"video_id": vid, "raw": v})
        if vid:
            video_ids.append(vid)

    # Look up existing video assets
    existing_video_ids: set[str] = set()
    if video_ids:
        stmt = select(Asset.provider_asset_id).where(
            Asset.user_id == current_user.id,
            Asset.provider_id == "pixverse",
            Asset.provider_asset_id.in_(video_ids),
        )
        result = await db.execute(stmt)
        existing_video_ids = {row[0] for row in result.fetchall()}

    video_response = {
        "total_remote": len(videos),
        "existing_count": len(existing_video_ids),
        "items": [
            {
                "video_id": item["video_id"],
                "already_imported": bool(item["video_id"] and item["video_id"] in existing_video_ids),
                "raw": item["raw"],
            }
            for item in video_items
        ],
    }

    # Fetch images if requested
    image_response = None
    if include_images:
        try:
            images: List[Dict[str, Any]] = await client.list_images(limit=limit, offset=offset)
        except Exception as e:
            logger.warning(
                "pixverse_list_images_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                account_id=account_id,
            )
            images = []

        image_items: List[Dict[str, Any]] = []
        image_ids: List[str] = []
        for img in images:
            img_id = _extract_image_id(img)
            image_items.append({"image_id": img_id, "raw": img})
            if img_id:
                image_ids.append(img_id)

        existing_image_ids: set[str] = set()
        if image_ids:
            stmt = select(Asset.provider_asset_id).where(
                Asset.user_id == current_user.id,
                Asset.provider_id == "pixverse",
                Asset.provider_asset_id.in_(image_ids),
            )
            result = await db.execute(stmt)
            existing_image_ids = {row[0] for row in result.fetchall()}

        image_response = {
            "total_remote": len(images),
            "existing_count": len(existing_image_ids),
            "items": [
                {
                    "image_id": item["image_id"],
                    "already_imported": bool(item["image_id"] and item["image_id"] in existing_image_ids),
                    "raw": item["raw"],
                }
                for item in image_items
            ],
        }

    response = {
        "provider_id": "pixverse",
        "account_id": account_id,
        "limit": limit,
        "offset": offset,
        "videos": video_response,
    }
    if image_response is not None:
        response["images"] = image_response

    return response


class SyncAssetsRequest(BaseModel):
    """Request body for sync-assets endpoint."""
    mode: str = Field("both", description="'videos', 'images', or 'both'")
    limit: int = Field(100, ge=1, le=500, description="Max items to sync per type")
    offset: int = Field(0, ge=0, description="Pagination offset")


@router.post("/accounts/{account_id}/sync-assets")
async def sync_pixverse_assets(
    account_id: int,
    body: SyncAssetsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """
    Import missing Pixverse videos/images as Asset rows.

    - Creates Asset records for remote items that don't already exist locally.
    - Attaches the full Pixverse payload as `media_metadata` for each Asset.
    - Extracts embedded assets (source images) and creates lineage.
    - Creates synthetic Generation records for full audit trail.
    """
    from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService
    from pixsim7.backend.main.services.generation.synthetic import SyntheticGenerationService

    account = await _get_pixverse_account(account_id, current_user, db)
    provider, client = _get_pixverse_provider_and_client(account)

    # Initialize services
    enrichment_service = AssetEnrichmentService(db)
    synthetic_service = SyntheticGenerationService(db)

    include_videos = body.mode in ("videos", "both")
    include_images = body.mode in ("images", "both")

    video_stats = {"created": 0, "skipped_existing": 0}
    image_stats = {"created": 0, "skipped_existing": 0}

    # Sync videos
    if include_videos:
        try:
            videos: List[Dict[str, Any]] = await client.list_videos(limit=body.limit, offset=body.offset)
        except Exception as e:
            logger.error(
                "pixverse_sync_videos_failed",
                error=str(e),
                account_id=account_id,
            )
            videos = []

        for v in videos:
            vid = _extract_video_id(v)
            if not vid:
                continue

            # Check if already exists
            stmt = select(Asset.id).where(
                Asset.user_id == current_user.id,
                Asset.provider_id == "pixverse",
                Asset.provider_asset_id == vid,
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                video_stats["skipped_existing"] += 1
                continue

            # Create asset
            remote_url = _extract_video_url(v)

            if not remote_url:
                logger.warning(
                    "pixverse_video_no_url",
                    video_id=vid,
                    account_id=account_id,
                )
                continue

            asset = await add_asset(
                db,
                user_id=current_user.id,
                media_type=MediaType.VIDEO,
                provider_id="pixverse",
                provider_asset_id=vid,
                provider_account_id=account.id,
                remote_url=remote_url,
                sync_status=SyncStatus.REMOTE,
                media_metadata=v,  # Full Pixverse payload
            )

            # Extract embedded assets (source images) and create lineage
            try:
                await enrichment_service._extract_and_register_embedded(asset, current_user)
            except Exception as e:
                logger.warning(
                    "pixverse_video_enrichment_failed",
                    video_id=vid,
                    asset_id=asset.id,
                    error=str(e),
                )

            # Create synthetic generation for full audit trail
            try:
                await synthetic_service.create_for_asset(asset, current_user, v)
            except Exception as e:
                logger.warning(
                    "pixverse_video_synthetic_gen_failed",
                    video_id=vid,
                    asset_id=asset.id,
                    error=str(e),
                )

            video_stats["created"] += 1
            logger.debug(
                "pixverse_video_imported",
                video_id=vid,
                account_id=account_id,
                asset_id=asset.id,
            )

    # Sync images
    if include_images:
        try:
            images: List[Dict[str, Any]] = await client.list_images(limit=body.limit, offset=body.offset)
        except Exception as e:
            logger.warning(
                "pixverse_sync_images_failed",
                error=str(e),
                account_id=account_id,
            )
            images = []

        for img in images:
            img_id = _extract_image_id(img)
            if not img_id:
                continue

            # Check if already exists
            stmt = select(Asset.id).where(
                Asset.user_id == current_user.id,
                Asset.provider_id == "pixverse",
                Asset.provider_asset_id == img_id,
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                image_stats["skipped_existing"] += 1
                continue

            # Create asset
            remote_url = _extract_image_url(img)
            if not remote_url:
                logger.warning(
                    "pixverse_image_no_url",
                    image_id=img_id,
                    account_id=account_id,
                )
                continue

            await add_asset(
                db,
                user_id=current_user.id,
                media_type=MediaType.IMAGE,
                provider_id="pixverse",
                provider_asset_id=img_id,
                provider_account_id=account.id,
                remote_url=remote_url,
                sync_status=SyncStatus.REMOTE,
                media_metadata=img,  # Full Pixverse payload
            )
            image_stats["created"] += 1
            logger.debug(
                "pixverse_image_imported",
                image_id=img_id,
                account_id=account_id,
            )

    logger.info(
        "pixverse_sync_completed",
        account_id=account_id,
        videos_created=video_stats["created"],
        videos_skipped=video_stats["skipped_existing"],
        images_created=image_stats["created"],
        images_skipped=image_stats["skipped_existing"],
    )

    return {
        "provider_id": "pixverse",
        "account_id": account_id,
        "videos": video_stats,
        "images": image_stats,
    }


# ===== SINGLE ASSET SYNC (from extension badge click) =====


class SyncSingleAssetRequest(BaseModel):
    """Request to sync a single PixVerse asset by its known ID."""
    pixverse_asset_id: str = Field(description="The PixVerse UUID from the media URL")
    media_url: str = Field(description="The full media.pixverse.ai URL")
    pixverse_media_type: Optional[str] = Field(
        None,
        description="Type from URL path (e.g., 'i2i', 't2v')"
    )
    is_video: bool = Field(False, description="Whether this is a video asset")
    source_url: Optional[str] = Field(None, description="Page URL where asset was found")
    account_id: Optional[int] = Field(None, description="PixVerse account ID from browser session")


class SyncSingleAssetResponse(BaseModel):
    """Response from single asset sync."""
    asset_id: int
    existed: bool
    provider_asset_id: str
    media_type: str
    remote_url: str


# Create a separate router for the simpler sync endpoint (mounted at /assets level)
sync_single_router = APIRouter(tags=["assets", "pixverse"])


@sync_single_router.post("/assets/sync-pixverse", response_model=SyncSingleAssetResponse)
async def sync_single_pixverse_asset(
    body: SyncSingleAssetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """
    Sync a single PixVerse asset to PixSim7 by its known ID.

    Used by the Chrome extension badge when clicking on images on pixverse.ai.
    This does NOT call the PixVerse API - it just registers the asset with
    the known URL and ID extracted from the media URL.

    If the asset already exists (same provider_asset_id), returns the existing one.
    """
    asset_id = body.pixverse_asset_id
    media_url = body.media_url

    # Clean the URL (remove processing params)
    clean_url = media_url.split('?')[0] if media_url else media_url

    # Check if already exists
    stmt = select(Asset).where(
        Asset.user_id == current_user.id,
        Asset.provider_id == "pixverse",
        Asset.provider_asset_id == asset_id,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        logger.debug(
            "pixverse_single_sync_exists",
            asset_id=asset_id,
            local_asset_id=existing.id,
        )
        return SyncSingleAssetResponse(
            asset_id=existing.id,
            existed=True,
            provider_asset_id=asset_id,
            media_type=existing.media_type.value,
            remote_url=existing.remote_url or clean_url,
        )

    # Determine media type
    media_type = MediaType.VIDEO if body.is_video else MediaType.IMAGE

    # Build metadata
    media_metadata = {
        "source": "extension_badge",
        "pixverse_media_type": body.pixverse_media_type,
    }
    if body.source_url:
        media_metadata["source_url"] = body.source_url

    # Create new asset
    asset = await add_asset(
        db,
        user_id=current_user.id,
        media_type=media_type,
        provider_id="pixverse",
        provider_asset_id=asset_id,
        provider_account_id=body.account_id,  # Link to browser session account
        remote_url=clean_url,
        sync_status=SyncStatus.REMOTE,
        media_metadata=media_metadata,
    )

    logger.info(
        "pixverse_single_sync_created",
        pixverse_asset_id=asset_id,
        local_asset_id=asset.id,
        media_type=media_type.value,
    )

    return SyncSingleAssetResponse(
        asset_id=asset.id,
        existed=False,
        provider_asset_id=asset_id,
        media_type=media_type.value,
        remote_url=clean_url,
    )
