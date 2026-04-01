"""
Asset enrichment API endpoints

Sync metadata from provider and run synthetic generation.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from pixsim7.backend.main.api.dependencies import CurrentUser, AssetSvc, DatabaseSession
from pixsim7.backend.main.api.v1.assets_helpers import get_effective_owner_user_id
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-enrich"])
logger = get_logger()


# ===== SCHEMAS =====

class EnrichAssetResponse(BaseModel):
    """Response from asset enrichment"""
    asset_id: int
    enriched: bool
    generation_id: Optional[int] = None
    message: str


# ===== ENDPOINTS =====

@router.post("/{asset_id}/test-enrich")
async def test_enrich(asset_id: int):
    """Minimal test endpoint - no auth, no dependencies"""
    return {"test": "success", "asset_id": asset_id}


@router.post("/{asset_id}/enrich", response_model=EnrichAssetResponse)
async def enrich_asset(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    asset_service: AssetSvc,
    force: bool = Query(default=False, description="Force re-enrichment even if generation exists"),
):
    """
    Enrich an asset by fetching metadata from the provider and running synthetic generation.

    This will:
    1. Fetch full metadata from the provider API (e.g., prompt, settings, source images)
    2. Extract embedded assets and create lineage links
    3. Create a synthetic Generation record with prompt/params

    Useful for assets synced without full metadata (e.g., from extension badge click).

    Set force=true to re-enrich assets that already have generations (for debugging/re-sync).
    """
    from pixsim7.backend.main.domain import Asset, Generation
    from pixsim7.backend.main.domain.providers import ProviderAccount
    from pixsim7.backend.main.domain.assets.lineage import AssetLineage
    from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService
    from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
    from sqlalchemy import select, delete

    owner_user_id = get_effective_owner_user_id(user)

    # Get the asset
    asset = await asset_service.get_asset_for_user(asset_id, user)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    logger.info(
        "enrich_asset_start",
        asset_id=asset.id,
        provider_id=asset.provider_id,
        provider_asset_id=asset.provider_asset_id,
        media_type=asset.media_type.value if asset.media_type else None,
        provider_account_id=asset.provider_account_id,
        force=force,
    )

    # Only supported for pixverse currently
    if asset.provider_id != "pixverse":
        raise HTTPException(
            status_code=400,
            detail=f"Enrichment not supported for provider: {asset.provider_id}"
        )

    # Need provider_account_id to fetch metadata
    if not asset.provider_account_id:
        raise HTTPException(
            status_code=400,
            detail="Asset has no linked provider account. Cannot fetch metadata."
        )

    # Get the account
    account_stmt = select(ProviderAccount).where(
        ProviderAccount.id == asset.provider_account_id,
        ProviderAccount.user_id == owner_user_id,
    )
    result = await db.execute(account_stmt)
    account = result.scalar_one_or_none()

    if not account:
        raise HTTPException(
            status_code=400,
            detail="Provider account not found or not accessible"
        )

    # Fetch metadata from provider
    try:
        provider = PixverseProvider()
        provider_metadata = None
        parent_video_id = None
        is_synthetic_source = False

        # Workaround: Detect synthetic _src_X IDs (e.g., "12345_src_0", "12345_src_video")
        # These are source assets extracted from video metadata that can't be looked up directly.
        # Instead, we fetch the parent video's metadata.
        # Pattern handles:
        #   - Numeric IDs: 12345_src_0, 12345_src_video
        #   - UUIDs: abc123de-f456-7890-abcd-ef1234567890_src_0
        import re
        synthetic_match = re.match(
            r'^(\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})_src_(?:video|\d+)$',
            asset.provider_asset_id or '',
            re.IGNORECASE
        )
        if synthetic_match:
            parent_video_id = synthetic_match.group(1)
            is_synthetic_source = True
            logger.info(
                "enrich_asset_synthetic_id_detected",
                asset_id=asset.id,
                provider_asset_id=asset.provider_asset_id,
                parent_video_id=parent_video_id,
            )

        if is_synthetic_source and parent_video_id:
            # Fetch parent video metadata - it contains source image/video info
            client = provider._create_client(account)
            provider_metadata = await client.get_video(parent_video_id)
            if provider_metadata:
                # Convert Pydantic model to dict if needed
                if hasattr(provider_metadata, 'model_dump'):
                    provider_metadata = provider_metadata.model_dump()
                elif hasattr(provider_metadata, 'dict'):
                    provider_metadata = provider_metadata.dict()
                logger.info(
                    "enrich_asset_parent_video_fetched",
                    asset_id=asset.id,
                    parent_video_id=parent_video_id,
                    has_prompt=bool(provider_metadata.get("prompt") or provider_metadata.get("customer_paths", {}).get("prompt") if isinstance(provider_metadata, dict) else False),
                )
        elif asset.media_type.value == "VIDEO":
            client = provider._create_client(account)
            provider_metadata = await client.get_video(asset.provider_asset_id)
        else:
            provider_metadata = await provider.fetch_image_metadata(
                account=account,
                provider_asset_id=asset.provider_asset_id,
                asset_id=asset.id,
                remote_url=asset.remote_url,
                media_metadata=asset.media_metadata,
                max_pages=20,
                limit=100,
                log_prefix="enrich_asset",
            )
    except Exception as e:
        logger.warning(
            "enrich_asset_fetch_failed",
            asset_id=asset.id,
            error=str(e),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch metadata from provider: {str(e)}"
        )

    if not provider_metadata:
        return EnrichAssetResponse(
            asset_id=asset.id,
            enriched=False,
            message="No metadata returned from provider"
        )

    if asset.media_metadata and isinstance(provider_metadata, dict):
        merged_metadata = dict(asset.media_metadata)
        merged_metadata.update(provider_metadata)
        provider_metadata = merged_metadata

    # Update asset's media_metadata
    asset.media_metadata = provider_metadata
    await db.commit()

    # Debug logging to see what metadata we got
    customer_img_urls = (
        provider_metadata.get("customer_img_urls")
        or provider_metadata.get("customer_paths", {}).get("customer_img_urls")
    )
    if not isinstance(customer_img_urls, list):
        customer_img_urls = [customer_img_urls] if customer_img_urls else []

    logger.info(
        "enrich_asset_metadata_fetched",
        asset_id=asset.id,
        has_customer_paths=bool(provider_metadata.get("customer_paths")),
        has_prompt=bool(provider_metadata.get("prompt") or provider_metadata.get("customer_paths", {}).get("prompt")),
        has_customer_img_url=bool(
            provider_metadata.get("customer_img_url")
            or provider_metadata.get("customer_paths", {}).get("customer_img_url")
            or customer_img_urls
        ),
        customer_img_url_count=len(customer_img_urls),
        create_mode=provider_metadata.get("customer_paths", {}).get("create_mode") or provider_metadata.get("create_mode"),
        metadata_keys=list(provider_metadata.keys()) if provider_metadata else [],
    )

    # Run enrichment pipeline
    enrichment_service = AssetEnrichmentService(db)

    # If already has generation and force=true, re-enrich (update existing)
    # Otherwise, create new generation
    if asset.source_generation_id and force:
        logger.info(
            "enrich_asset_re_populate",
            asset_id=asset.id,
            generation_id=asset.source_generation_id,
        )
        generation = await enrichment_service.re_enrich_synced_asset(asset, user, provider_metadata)
    elif asset.source_generation_id:
        # Already has generation, skip
        return EnrichAssetResponse(
            asset_id=asset.id,
            enriched=False,
            generation_id=asset.source_generation_id,
            message="Asset already has generation record (use force=true to re-enrich)"
        )
    else:
        # No generation yet, create one
        generation = await enrichment_service.enrich_synced_asset(asset, user, provider_metadata)

    logger.info(
        "enrich_asset_generation_result",
        asset_id=asset.id,
        generation_id=generation.id if generation else None,
        has_generation=bool(generation),
        source_generation_id=asset.source_generation_id,
        force=force,
    )

    return EnrichAssetResponse(
        asset_id=asset.id,
        enriched=True,
        generation_id=generation.id if generation else None,
        message="Asset enriched successfully" if generation else "Enriched but no generation created"
    )
