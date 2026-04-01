"""
Asset helper functions shared across asset endpoints.
"""
from typing import List

from fastapi import HTTPException
from pixsim7.backend.main.api.dependencies import DatabaseSession
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary
from pixsim7.backend.main.services.tag_service import TagService


def get_effective_owner_user_id(user) -> int:
    """Resolve the request's effective owner user ID or fail with 403."""
    owner_user_id = resolve_effective_user_id(user)
    if owner_user_id is None:
        raise HTTPException(status_code=403, detail="User-scoped principal required")
    return owner_user_id


def _compute_provider_status(asset) -> str:
    provider_asset_id = getattr(asset, "provider_asset_id", None)
    provider_flagged = getattr(asset, "provider_flagged", False)
    remote_url = getattr(asset, "remote_url", None)
    provider_uploads = getattr(asset, "provider_uploads", None) or {}

    # Also check media_metadata for flagged status (set on upload rejection)
    if not provider_flagged:
        meta = getattr(asset, "media_metadata", None) or {}
        if isinstance(meta, dict) and meta.get("provider_flagged"):
            provider_flagged = True

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
