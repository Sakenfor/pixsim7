"""
Asset helper functions shared across asset endpoints.
"""
from typing import List

from fastapi import HTTPException

from pixsim7.backend.main.api.dependencies import DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary
from pixsim7.backend.main.services.asset.lineage import AssetLineageService
from pixsim7.backend.main.services.tag import TagAssignment
from pixsim7.backend.main.domain.assets.tag import AssetTag


def _tag_summary_with_source(tag, source: str | None) -> TagSummary:
    """Build a TagSummary carrying the per-assignment provenance source."""
    summary = TagSummary.model_validate(tag)
    summary.source = source
    return summary


def get_effective_owner_user_id(user) -> int:
    """Resolve the request's effective owner user ID or fail with 403."""
    owner_user_id = resolve_effective_user_id(user)
    if owner_user_id is None:
        raise HTTPException(status_code=403, detail="User-scoped principal required")
    return owner_user_id


def _metadata_truthy(value) -> bool:
    return value is True or (isinstance(value, str) and value.lower() == "true")


def _compute_provider_status(asset) -> str:
    provider_asset_id = getattr(asset, "provider_asset_id", None)
    provider_flagged = getattr(asset, "provider_flagged", False)
    remote_url = getattr(asset, "remote_url", None)
    provider_uploads = getattr(asset, "provider_uploads", None) or {}
    provider_removed = False

    # Also check media_metadata for flagged status (set on upload rejection)
    meta = getattr(asset, "media_metadata", None) or {}
    if isinstance(meta, dict):
        provider_removed = _metadata_truthy(meta.get("provider_removed"))
    if not provider_flagged:
        if isinstance(meta, dict) and _metadata_truthy(meta.get("provider_flagged")):
            provider_flagged = True

    if provider_flagged:
        return "flagged"
    elif provider_removed:
        return "local_only"
    elif remote_url and (remote_url.startswith("http://") or remote_url.startswith("https://")):
        return "ok"
    elif provider_asset_id and not provider_asset_id.startswith("local_"):
        return "ok"
    elif provider_uploads:
        return "ok"
    elif provider_asset_id and provider_asset_id.startswith("local_"):
        return "local_only"
    return "unknown"


def _compute_provider_removal_failed(asset) -> bool:
    """True when a provider-side removal was attempted but failed
    (media_metadata.provider_removal_failed) — the remote copy is still there."""
    meta = getattr(asset, "media_metadata", None) or {}
    return bool(isinstance(meta, dict) and _metadata_truthy(meta.get("provider_removal_failed")))


def _compute_recovered(asset) -> bool:
    """True when the asset was CDN-salvaged from a Pixverse false-filter /
    stuck-processing state (provider_service._try_pixverse_image_cdn_salvage
    stamps media_metadata.image_false_filter_recovered)."""
    meta = getattr(asset, "media_metadata", None) or {}
    return bool(isinstance(meta, dict) and meta.get("image_false_filter_recovered"))


def _compute_signal_suspicious(asset) -> bool:
    """The broken-video heuristic's own verdict
    (media_metadata.signal_metrics.suspicious). Distinct from signal_override,
    which is the user's manual keep/flag decision."""
    meta = getattr(asset, "media_metadata", None) or {}
    sm = meta.get("signal_metrics") if isinstance(meta, dict) else None
    return bool(isinstance(sm, dict) and sm.get("suspicious"))


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
    tags = await asset_tags.get_tags_with_source(asset.id)

    ar = AssetResponse.model_validate(asset)
    ar.provider_status = _compute_provider_status(asset)
    ar.provider_removal_failed = _compute_provider_removal_failed(asset)
    ar.recovered = _compute_recovered(asset)
    ar.tags = [_tag_summary_with_source(tag, source) for tag, source in tags]
    has_children_map = await AssetLineageService(db).has_children_map([asset.id])
    ar.has_children = has_children_map.get(asset.id, False)
    # Cohort/sibling counts are intentionally NOT computed here — they ran ~7
    # GROUP BY queries per asset on the hot path. The hover-gated similarity
    # badge fetches them lazily from GET /assets/{id}/cohort-counts instead.
    ar.gen_seed = asset.gen_seed
    ar.signal_suspicious = _compute_signal_suspicious(asset)

    return ar


async def build_asset_responses_with_tags(
    assets, db: DatabaseSession
) -> List[AssetResponse]:
    """
    Build AssetResponses with tags batch-loaded in a single query.

    Cohort/sibling counts are intentionally NOT computed here — they ran ~7
    GROUP BY queries per owner-group on the hot path (gallery page loads, bulk
    refreshes). The hover-gated similarity badge now fetches them lazily from
    GET /assets/{id}/cohort-counts (single) / POST /assets/cohort-counts
    (batch). See plan media-card-sibling-badges.
    """
    if not assets:
        return []

    asset_tags = TagAssignment(db, AssetTag, "asset_id")
    ids = [a.id for a in assets]
    tags_map = await asset_tags.get_tags_batch_with_source(ids)
    has_children_map = await AssetLineageService(db).has_children_map(ids)

    responses: List[AssetResponse] = []
    for asset in assets:
        ar = AssetResponse.model_validate(asset)
        ar.provider_status = _compute_provider_status(asset)
        ar.provider_removal_failed = _compute_provider_removal_failed(asset)
        ar.recovered = _compute_recovered(asset)
        ar.tags = [
            _tag_summary_with_source(tag, source)
            for tag, source in tags_map.get(asset.id, [])
        ]
        ar.has_children = has_children_map.get(asset.id, False)
        ar.gen_seed = asset.gen_seed
        ar.signal_suspicious = _compute_signal_suspicious(asset)
        responses.append(ar)

    return responses
