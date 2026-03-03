"""
Dev Prompt Family Timeline API

Dev-only endpoint for viewing the timeline/performance of a PromptFamily,
showing how versions evolve, which block primitives are used, and which assets
are generated with fit scores.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.domain.generation.block_image_fit import BlockImageFit
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/prompt-families", tags=["dev"])


# ===== Response Models =====

class TimelineVersion(BaseModel):
    """Version info for timeline display"""

    version_id: UUID
    version_number: int
    created_at: str
    commit_message: Optional[str]
    generation_count: int
    successful_assets: int
    tags: List[str]


class TimelineBlockSummary(BaseModel):
    """Block primitive summary with performance metrics."""

    block_id: str  # canonical primitive id
    db_id: str  # BlockPrimitive.id (UUID) as string, or block_id fallback
    prompt_version_id: Optional[UUID]
    usage_count: int
    avg_fit_score: Optional[float]
    last_used_at: Optional[str]


class TimelineAssetSummary(BaseModel):
    """Asset summary with source tracking"""

    asset_id: int
    generation_id: Optional[int]
    created_at: str
    source_version_id: Optional[UUID]
    source_block_ids: List[str]


class PromptFamilyTimelineResponse(BaseModel):
    """Complete timeline data for a PromptFamily"""

    family_id: UUID
    family_slug: str
    title: str
    versions: List[TimelineVersion]
    blocks: List[TimelineBlockSummary]
    assets: List[TimelineAssetSummary]


def _pick_version_for_block(
    *,
    version_ids: set[UUID],
    version_rank: Dict[UUID, int],
) -> Optional[UUID]:
    if not version_ids:
        return None
    return min(version_ids, key=lambda version_id: version_rank.get(version_id, 10**9))


# ===== Endpoints =====

@router.get("/{family_id}/timeline", response_model=PromptFamilyTimelineResponse)
async def get_family_timeline(
    family_id: UUID,
    limit_assets: int = 100,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> PromptFamilyTimelineResponse:
    """Get timeline/performance view for a PromptFamily."""
    try:
        service = PromptVersionService(db)

        # 1. Family info
        family = await service.get_family(family_id)
        if not family:
            raise HTTPException(status_code=404, detail=f"Family {family_id} not found")

        # 2. Family versions
        versions = await service.list_versions(family_id=family_id, limit=1000)
        version_ids = [v.id for v in versions]
        version_rank = {version.id: idx for idx, version in enumerate(versions)}
        timeline_versions = [
            TimelineVersion(
                version_id=v.id,
                version_number=v.version_number,
                created_at=str(v.created_at),
                commit_message=v.commit_message,
                generation_count=v.generation_count or 0,
                successful_assets=v.successful_assets or 0,
                tags=v.tags,
            )
            for v in versions
        ]

        # 3. Generations tied to these versions (for asset list and block usage source).
        generations: List[Generation] = []
        if version_ids:
            generations_query = (
                select(Generation)
                .where(Generation.prompt_version_id.in_(version_ids))
                .order_by(Generation.created_at.desc())
                .limit(limit_assets)
            )
            generations_result = await db.execute(generations_query)
            generations = list(generations_result.scalars().all())

        generation_ids = [generation.id for generation in generations if generation.id is not None]
        generation_version_by_id: Dict[int, UUID] = {
            generation.id: generation.prompt_version_id
            for generation in generations
            if generation.id is not None and generation.prompt_version_id is not None
        }
        asset_ids = [generation.asset_id for generation in generations if generation.asset_id is not None]

        # 4. Preload assets for listed generations.
        assets_by_id: Dict[int, Asset] = {}
        if asset_ids:
            assets_result = await db.execute(select(Asset).where(Asset.id.in_(asset_ids)))
            assets_by_id = {asset.id: asset for asset in assets_result.scalars().all()}

        # 5. Pull all fit rows relevant to these generations/assets once.
        fit_rows: List[BlockImageFit] = []
        fit_filters = []
        if generation_ids:
            fit_filters.append(BlockImageFit.generation_id.in_(generation_ids))
        if asset_ids:
            fit_filters.append(BlockImageFit.asset_id.in_(asset_ids))
        if fit_filters:
            fits_result = await db.execute(select(BlockImageFit).where(or_(*fit_filters)))
            fit_rows = list(fits_result.scalars().all())

        # 6. Aggregate block metrics + per-asset lineage.
        block_stats: Dict[str, Dict[str, Any]] = {}
        source_blocks_by_generation: Dict[int, set[str]] = defaultdict(set)
        source_blocks_by_asset: Dict[int, set[str]] = defaultdict(set)

        for fit in fit_rows:
            block_id = str(fit.block_id).strip()
            if not block_id:
                continue

            stats = block_stats.setdefault(
                block_id,
                {
                    "usage_count": 0,
                    "fit_sum": 0.0,
                    "fit_count": 0,
                    "last_used": None,
                    "version_ids": set(),
                },
            )
            stats["usage_count"] += 1
            if fit.fit_rating is not None:
                stats["fit_sum"] += float(fit.fit_rating)
                stats["fit_count"] += 1
            if fit.created_at is not None and (
                stats["last_used"] is None or fit.created_at > stats["last_used"]
            ):
                stats["last_used"] = fit.created_at

            if fit.generation_id is not None:
                source_blocks_by_generation[int(fit.generation_id)].add(block_id)
                source_version_id = generation_version_by_id.get(int(fit.generation_id))
                if source_version_id is not None:
                    stats["version_ids"].add(source_version_id)
            if fit.asset_id is not None:
                source_blocks_by_asset[int(fit.asset_id)].add(block_id)

        # 7. Resolve primitive DB IDs from blocks DB.
        primitive_by_block_id: Dict[str, BlockPrimitive] = {}
        if block_stats:
            async with get_async_blocks_session() as blocks_db:
                primitive_result = await blocks_db.execute(
                    select(BlockPrimitive).where(
                        BlockPrimitive.block_id.in_(list(block_stats.keys()))
                    )
                )
                primitive_by_block_id = {
                    primitive.block_id: primitive for primitive in primitive_result.scalars().all()
                }

        timeline_blocks: List[TimelineBlockSummary] = []
        for block_id, stats in block_stats.items():
            primitive = primitive_by_block_id.get(block_id)
            fit_count = int(stats["fit_count"])
            avg_fit = (stats["fit_sum"] / fit_count) if fit_count > 0 else None
            prompt_version_id = _pick_version_for_block(
                version_ids=stats["version_ids"],
                version_rank=version_rank,
            )
            timeline_blocks.append(
                TimelineBlockSummary(
                    block_id=block_id,
                    db_id=str(primitive.id) if primitive is not None else block_id,
                    prompt_version_id=prompt_version_id,
                    usage_count=int(stats["usage_count"]),
                    avg_fit_score=float(avg_fit) if avg_fit is not None else None,
                    last_used_at=str(stats["last_used"]) if stats["last_used"] is not None else None,
                )
            )
        timeline_blocks.sort(key=lambda item: (-item.usage_count, item.block_id))

        timeline_assets: List[TimelineAssetSummary] = []
        for generation in generations:
            if generation.asset_id is None:
                continue
            asset = assets_by_id.get(generation.asset_id)
            if asset is None:
                continue

            source_block_ids = sorted(
                source_blocks_by_generation.get(generation.id, set())
                | source_blocks_by_asset.get(asset.id, set())
            )
            timeline_assets.append(
                TimelineAssetSummary(
                    asset_id=asset.id,
                    generation_id=generation.id,
                    created_at=str(getattr(asset, "created_at", generation.created_at)),
                    source_version_id=generation.prompt_version_id,
                    source_block_ids=source_block_ids,
                )
            )

        response = PromptFamilyTimelineResponse(
            family_id=family.id,
            family_slug=family.slug,
            title=family.title,
            versions=timeline_versions,
            blocks=timeline_blocks,
            assets=timeline_assets,
        )

        logger.info(
            "Retrieved timeline for family %s: %d versions, %d blocks, %d assets",
            family_id,
            len(timeline_versions),
            len(timeline_blocks),
            len(timeline_assets),
            extra={
                "user_id": user.id,
                "family_id": str(family_id),
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to get family timeline: {e}",
            extra={
                "user_id": user.id,
                "family_id": str(family_id),
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get family timeline: {str(e)}",
        )
