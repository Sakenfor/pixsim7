from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from sqlalchemy import select, text
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


class SignalReferenceItem(BaseModel):
    """A curated `signalref:*` reference clip + its stored fingerprint."""

    asset: AssetResponse
    chroma_fp: Optional[List[float]] = Field(
        default=None, description="Stored 12×N melody fingerprint (null if unprobed)"
    )
    audio_ref_match: Optional[float] = None
    loudness_range_db: Optional[float] = None
    score: Optional[int] = None
    cohesion: Optional[Dict[str, float]] = Field(
        default=None,
        description=(
            "Per-category leave-one-out match (full signalref:* slug → 0..1): how "
            "well this clip fits the rest of that category. Low = odd-one-out. "
            "Absent for a clip that is the only member of its category."
        ),
    )


class SignalReferenceListResponse(BaseModel):
    items: List[SignalReferenceItem]
    total: int


@router.get("/signal-references", response_model=SignalReferenceListResponse)
async def list_signal_references(
    admin: CurrentAdminUser,
    db: DatabaseSession,
) -> SignalReferenceListResponse:
    """List the curated `signalref:*` reference clips with their fingerprints.

    These are the templates the broken-audio matcher cross-correlates against
    (see audio_fingerprint.load_reference_fingerprints). The Video-Health
    "References" panel renders each clip's chroma heatmap + melody from the
    stored `chroma_fp`, grouped by voice (the signalref:* tag), so the curator
    can hear/trim the reference set before a rescore. Read-only.
    """
    from pixsim7.backend.main.api.v1.assets_helpers import (
        build_asset_responses_with_tags,
    )

    # Distinct asset ids tagged signalref:* for this user (matcher's own scope).
    id_rows = await db.execute(
        text(
            """
            SELECT DISTINCT a.id
            FROM assets a
            JOIN asset_tag at ON at.asset_id = a.id
            JOIN tag t ON t.id = at.tag_id
            WHERE t.namespace = 'signalref' AND a.user_id = :uid
            """
        ),
        {"uid": admin.id},
    )
    ids = [r[0] for r in id_rows.all()]
    if not ids:
        return SignalReferenceListResponse(items=[], total=0)

    assets = (
        await db.execute(
            select(Asset).where(Asset.id.in_(ids)).order_by(Asset.id.desc())
        )
    ).scalars().all()
    responses = await build_asset_responses_with_tags(assets, db)

    # Per-category leave-one-out cohesion: for each signalref:* category, score
    # how well each member matches the REST of that category (the same matcher a
    # rescore uses). Surfaces odd-one-out references — a clip that doesn't sound
    # like its group. Deterministic + cheap (numpy over the stored fingerprints),
    # so it's computed inline here rather than persisted.
    from pixsim7.backend.main.services.asset.audio_fingerprint import (
        _to_chroma,
        self_cohesion,
    )

    fp_by_id = {
        a.id: _to_chroma(((a.media_metadata or {}).get("signal_metrics") or {}).get("chroma_fp"))
        for a in assets
    }
    # (asset_id, full signalref:* slug) — group members by category.
    cat_rows = await db.execute(
        text(
            """
            SELECT at.asset_id, t.namespace || ':' || t.name AS slug
            FROM asset_tag at
            JOIN tag t ON t.id = at.tag_id
            WHERE t.namespace = 'signalref' AND at.asset_id = ANY(:ids)
            """
        ),
        {"ids": ids},
    )
    members_by_cat: Dict[str, List[int]] = {}
    for asset_id, slug in cat_rows.all():
        if fp_by_id.get(asset_id) is not None:  # only clips with a usable fingerprint
            members_by_cat.setdefault(slug, []).append(asset_id)

    cohesion_by_id: Dict[int, Dict[str, float]] = {}
    for slug, member_ids in members_by_cat.items():
        scores = self_cohesion([fp_by_id[i] for i in member_ids])
        for asset_id, sc in zip(member_ids, scores):
            if sc is not None:
                cohesion_by_id.setdefault(asset_id, {})[slug] = sc

    items: List[SignalReferenceItem] = []
    for asset, resp in zip(assets, responses):
        sm = (asset.media_metadata or {}).get("signal_metrics") or {}
        items.append(
            SignalReferenceItem(
                asset=resp,
                chroma_fp=sm.get("chroma_fp"),
                audio_ref_match=sm.get("audio_ref_match"),
                loudness_range_db=sm.get("loudness_range_db"),
                score=sm.get("score"),
                cohesion=cohesion_by_id.get(asset.id) or None,
            )
        )
    return SignalReferenceListResponse(items=items, total=len(items))
