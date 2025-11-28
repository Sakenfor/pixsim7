"""
Dev Prompt Family Timeline API

Dev-only endpoint for viewing the timeline/performance of a PromptFamily,
showing how versions evolve, which blocks are extracted, and which assets
are generated with fit scores.

Purpose:
- Show version evolution timeline with generation metrics
- Show extracted ActionBlocks with usage and fit scores
- Show assets generated from versions with source tracking
- Answer "which prompts/blocks/packs are actually working?"

Design:
- Dev-only endpoint (no production use)
- Read-only operations (no mutations)
- Aggregates data from versions, blocks, assets, and fit scores
- Optimized for timeline/performance view in Prompt Lab
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.prompts import PromptVersionService
from pixsim7.backend.main.domain.action_block import ActionBlockDB
from pixsim7.backend.main.domain.block_image_fit import BlockImageFit
from pixsim7.backend.main.domain.generation import Generation
from pixsim7.backend.main.domain.asset import Asset
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
    """ActionBlock summary with performance metrics"""
    block_id: str                 # ActionBlock.block_id
    db_id: str                    # ActionBlockDB.id (UUID) as string
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
    source_block_ids: List[str]   # block_id strings from lineage


class PromptFamilyTimelineResponse(BaseModel):
    """Complete timeline data for a PromptFamily"""
    family_id: UUID
    family_slug: str
    title: str
    versions: List[TimelineVersion]
    blocks: List[TimelineBlockSummary]
    assets: List[TimelineAssetSummary]


# ===== Endpoints =====

@router.get("/{family_id}/timeline", response_model=PromptFamilyTimelineResponse)
async def get_family_timeline(
    family_id: UUID,
    limit_assets: int = 100,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> PromptFamilyTimelineResponse:
    """
    Get timeline/performance view for a PromptFamily.

    Shows:
    - Versions with generation counts and successful assets
    - ActionBlocks extracted from versions with usage and fit scores
    - Assets generated from versions with source tracking

    Path params:
    - family_id: UUID of the family

    Query params:
    - limit_assets: Max assets to return (default 100, most recent)

    Returns:
        Complete timeline data for the family
    """
    try:
        service = PromptVersionService(db)

        # 1. Get family info
        family = await service.get_family(family_id)
        if not family:
            raise HTTPException(
                status_code=404,
                detail=f"Family {family_id} not found"
            )

        # 2. Get all versions for this family
        versions = await service.list_versions(family_id=family_id, limit=1000)
        version_ids = [v.id for v in versions]

        # Build version timeline entries
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

        # 3. Get ActionBlocks that reference these versions
        # Look for blocks with prompt_version_id or extracted_from_prompt_version
        blocks_query = select(ActionBlockDB).where(
            (ActionBlockDB.prompt_version_id.in_(version_ids)) |
            (ActionBlockDB.extracted_from_prompt_version.in_(version_ids))
        )
        blocks_result = await db.execute(blocks_query)
        blocks = blocks_result.scalars().all()

        # Get usage and fit scores for each block
        timeline_blocks = []
        for block in blocks:
            # Get average fit score from BlockImageFit
            fit_query = select(func.avg(BlockImageFit.fit_rating)).where(
                BlockImageFit.block_id == block.id
            )
            fit_result = await db.execute(fit_query)
            avg_fit = fit_result.scalar()

            # Get last used timestamp from BlockImageFit
            last_used_query = select(func.max(BlockImageFit.created_at)).where(
                BlockImageFit.block_id == block.id
            )
            last_used_result = await db.execute(last_used_query)
            last_used = last_used_result.scalar()

            timeline_blocks.append(
                TimelineBlockSummary(
                    block_id=block.block_id,
                    db_id=str(block.id),
                    prompt_version_id=block.prompt_version_id or block.extracted_from_prompt_version,
                    usage_count=block.usage_count or 0,
                    avg_fit_score=float(avg_fit) if avg_fit is not None else None,
                    last_used_at=str(last_used) if last_used else None,
                )
            )

        # 4. Get Assets/Generations linked to these versions
        # Query generations that used these prompt versions
        generations_query = (
            select(Generation)
            .where(Generation.prompt_version_id.in_(version_ids))
            .order_by(Generation.created_at.desc())
            .limit(limit_assets)
        )
        generations_result = await db.execute(generations_query)
        generations = generations_result.scalars().all()

        # Get assets for these generations
        timeline_assets = []
        for gen in generations:
            if gen.asset_id:
                # Get the asset
                asset_query = select(Asset).where(Asset.id == gen.asset_id)
                asset_result = await db.execute(asset_query)
                asset = asset_result.scalar()

                if asset:
                    # Try to find block usage from BlockImageFit
                    fit_query = (
                        select(BlockImageFit.block_id)
                        .where(
                            (BlockImageFit.asset_id == asset.id) |
                            (BlockImageFit.generation_id == gen.id)
                        )
                        .distinct()
                    )
                    fit_result = await db.execute(fit_query)
                    block_db_ids = fit_result.scalars().all()

                    # Convert block DB IDs to block_id strings
                    source_block_ids = []
                    if block_db_ids:
                        block_ids_query = select(ActionBlockDB.block_id).where(
                            ActionBlockDB.id.in_(block_db_ids)
                        )
                        block_ids_result = await db.execute(block_ids_query)
                        source_block_ids = list(block_ids_result.scalars().all())

                    timeline_assets.append(
                        TimelineAssetSummary(
                            asset_id=asset.id,
                            generation_id=gen.id,
                            created_at=str(asset.created_at) if hasattr(asset, 'created_at') else str(gen.created_at),
                            source_version_id=gen.prompt_version_id,
                            source_block_ids=source_block_ids,
                        )
                    )

        # Build final response
        response = PromptFamilyTimelineResponse(
            family_id=family.id,
            family_slug=family.slug,
            title=family.title,
            versions=timeline_versions,
            blocks=timeline_blocks,
            assets=timeline_assets,
        )

        logger.info(
            f"Retrieved timeline for family {family_id}: "
            f"{len(timeline_versions)} versions, "
            f"{len(timeline_blocks)} blocks, "
            f"{len(timeline_assets)} assets",
            extra={
                "user_id": user.id,
                "family_id": str(family_id),
            }
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
            detail=f"Failed to get family timeline: {str(e)}"
        )
