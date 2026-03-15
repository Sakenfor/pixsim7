"""
Asset helper functions shared across asset endpoints.
"""
from typing import List

from pixsim7.backend.main.api.dependencies import DatabaseSession
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary
from pixsim7.backend.main.services.tag_service import TagService


def _compute_provider_status(asset) -> str:
    provider_asset_id = getattr(asset, "provider_asset_id", None)
    provider_flagged = getattr(asset, "provider_flagged", False)
    remote_url = getattr(asset, "remote_url", None)
    provider_uploads = getattr(asset, "provider_uploads", None) or {}

    if provider_flagged:
        return "flagged"
    elif remote_url and (remote_url.startswith("http://") or remote_url.startswith("https://")):
        return "ok"
    elif provider_asset_id and not provider_asset_id.startswith("local_"):
        return "ok"
    elif provider_uploads:
        return "ok"
    elif provider_asset_id and provider_asset_id.startswith("local_"):
        return "local_only"
    return "unknown"


async def build_asset_response_with_tags(asset, db: DatabaseSession) -> AssetResponse:
    """
    Build AssetResponse with tags loaded from database.

    Args:
        asset: Asset model instance
        db: Database session

    Returns:
        AssetResponse with tags populated
    """
    tag_service = TagService(db)
    tags = await tag_service.get_asset_tags(asset.id)

    ar = AssetResponse.model_validate(asset)
    ar.provider_status = _compute_provider_status(asset)
    ar.tags = [TagSummary.model_validate(tag) for tag in tags]

    return ar


async def build_asset_responses_with_tags(assets, db: DatabaseSession) -> List[AssetResponse]:
    """
    Build AssetResponses with tags batch-loaded in a single query.
    """
    if not assets:
        return []

    tag_service = TagService(db)
    tags_map = await tag_service.get_tags_for_assets([a.id for a in assets])

    responses: List[AssetResponse] = []
    for asset in assets:
        ar = AssetResponse.model_validate(asset)
        ar.provider_status = _compute_provider_status(asset)
        ar.tags = [TagSummary.model_validate(tag) for tag in tags_map.get(asset.id, [])]
        responses.append(ar)

    return responses
