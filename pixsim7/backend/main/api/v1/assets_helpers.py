"""
Asset helper functions shared across asset endpoints.
"""
from pixsim7.backend.main.api.dependencies import DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary
from pixsim7.backend.main.services.tag_service import TagService


async def build_asset_response_with_tags(asset, db: DatabaseSession) -> AssetResponse:
    """
    Build AssetResponse with tags loaded from database.

    Args:
        asset: Asset model instance
        db: Database session

    Returns:
        AssetResponse with tags populated
    """
    # Get tags for this asset
    tag_service = TagService(db)
    tags = await tag_service.get_asset_tags(asset.id)

    # Compute provider_status
    provider_asset_id = getattr(asset, "provider_asset_id", None)
    provider_flagged = getattr(asset, "provider_flagged", False)
    remote_url = getattr(asset, "remote_url", None)

    if provider_flagged:
        status = "flagged"
    elif remote_url and (remote_url.startswith("http://") or remote_url.startswith("https://")):
        status = "ok"
    elif provider_asset_id and not provider_asset_id.startswith("local_"):
        status = "ok"
    elif provider_asset_id and provider_asset_id.startswith("local_"):
        status = "local_only"
    else:
        status = "unknown"

    # Build response
    ar = AssetResponse.model_validate(asset)
    ar.provider_status = status
    ar.tags = [TagSummary.model_validate(tag) for tag in tags]

    return ar
