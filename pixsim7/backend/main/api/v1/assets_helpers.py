"""
Asset helper functions shared across asset endpoints.
"""
from typing import List

from fastapi import HTTPException

from pixsim7.backend.main.api.dependencies import DatabaseSession
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary
from pixsim7.backend.main.services.asset.lineage import AssetLineageService
from pixsim7.backend.main.services.asset.sibling_counts import AssetSiblingCountService
from pixsim7.backend.main.services.tag import TagAssignment
from pixsim7.backend.main.domain.assets.tag import AssetTag


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


def _compute_recovered(asset) -> bool:
    """True when the asset was CDN-salvaged from a Pixverse false-filter /
    stuck-processing state (provider_service._try_pixverse_image_cdn_salvage
    stamps media_metadata.image_false_filter_recovered)."""
    meta = getattr(asset, "media_metadata", None) or {}
    return bool(isinstance(meta, dict) and meta.get("image_false_filter_recovered"))


async def build_asset_response_with_tags(asset, db: DatabaseSession) -> AssetResponse:
    """
    Build AssetResponse with tags loaded from database.

    Args:
        asset: Asset model instance
        db: Database session

    Returns:
        AssetResponse with tags populated
    """
    asset_tags = TagAssignment(db, AssetTag, "asset_id")
    tags = await asset_tags.get_tags(asset.id)

    ar = AssetResponse.model_validate(asset)
    ar.provider_status = _compute_provider_status(asset)
    ar.recovered = _compute_recovered(asset)
    ar.tags = [TagSummary.model_validate(tag) for tag in tags]
    has_children_map = await AssetLineageService(db).has_children_map([asset.id])
    ar.has_children = has_children_map.get(asset.id, False)
    counts = await AssetSiblingCountService(db).counts_map([asset], asset.user_id)
    asset_counts = counts.get(asset.id, {})
    ar.same_inputs_count = asset_counts.get("same_inputs", 0)
    ar.same_prompt_count = asset_counts.get("same_prompt", 0)

    return ar


async def build_asset_responses_with_tags(assets, db: DatabaseSession) -> List[AssetResponse]:
    """
    Build AssetResponses with tags batch-loaded in a single query.
    """
    if not assets:
        return []

    asset_tags = TagAssignment(db, AssetTag, "asset_id")
    ids = [a.id for a in assets]
    tags_map = await asset_tags.get_tags_batch(ids)
    has_children_map = await AssetLineageService(db).has_children_map(ids)

    # Sibling counts are user-scoped; group by owner so a mixed-owner list
    # (e.g. admin views) still counts each asset within its own library.
    sibling_svc = AssetSiblingCountService(db)
    by_owner: dict[int, List] = {}
    for asset in assets:
        by_owner.setdefault(asset.user_id, []).append(asset)
    sibling_counts: dict = {}
    for owner_user_id, owned in by_owner.items():
        sibling_counts.update(await sibling_svc.counts_map(owned, owner_user_id))

    responses: List[AssetResponse] = []
    for asset in assets:
        ar = AssetResponse.model_validate(asset)
        ar.provider_status = _compute_provider_status(asset)
        ar.recovered = _compute_recovered(asset)
        ar.tags = [TagSummary.model_validate(tag) for tag in tags_map.get(asset.id, [])]
        ar.has_children = has_children_map.get(asset.id, False)
        asset_counts = sibling_counts.get(asset.id, {})
        ar.same_inputs_count = asset_counts.get("same_inputs", 0)
        ar.same_prompt_count = asset_counts.get("same_prompt", 0)
        responses.append(ar)

    return responses
