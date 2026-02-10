"""Block ↔ Image Fit API endpoints

Dev endpoints for computing and recording fit scores between ActionBlocks and assets.

Purpose:
- Compute heuristic fit scores based on ontology tag alignment
- Record user ratings for block-to-asset fit
- Enable analysis and tuning of fit heuristics

Design:
- Dev-only endpoints (no production use yet)
- Integrates with PromptBlock, Asset, and Generation models
- Stores fit feedback in BlockImageFit table
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.domain.generation.block_image_fit import BlockImageFit
from pixsim7.backend.main.services.asset.tags import tag_asset_from_metadata
from pixsim7.backend.main.services.prompt.block.fit_scoring import (
    compute_block_asset_fit,
    explain_fit_score
)
from sqlalchemy import select
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/block-fit", tags=["dev", "block-fit"])


# ===== Request Models =====

class ComputeFitRequest(BaseModel):
    """Request to compute fit score between a block and asset."""
    block_id: UUID = Field(..., description="PromptBlock.id to evaluate")
    asset_id: int = Field(..., description="Asset.id to evaluate against")


class RateFitRequest(BaseModel):
    """Request to rate and record block-to-asset fit."""
    block_id: UUID = Field(..., description="PromptBlock.id to evaluate")
    asset_id: int = Field(..., description="Asset.id to evaluate against")
    generation_id: Optional[int] = Field(None, description="Optional Generation.id")
    role_in_sequence: str = Field(
        default="unspecified",
        description="'initial' | 'continuation' | 'transition' | 'unspecified'"
    )
    fit_rating: int = Field(..., ge=1, le=5, description="User rating 1-5")
    notes: Optional[str] = Field(None, description="Optional notes about the fit")
    timestamp_sec: Optional[float] = Field(
        default=None,
        description="Optional timestamp in seconds for this rating"
    )


# ===== Response Models =====

class FitScoreResponse(BaseModel):
    """Response with heuristic fit score and details."""
    heuristic_score: float = Field(..., description="Score 0.0-1.0")
    details: Dict[str, Any] = Field(..., description="Detailed breakdown")
    explanation: str = Field(..., description="Human-readable explanation")


class FitRatingResponse(BaseModel):
    """Response after recording a fit rating."""
    id: int
    block_id: UUID
    asset_id: int
    generation_id: Optional[int]
    role_in_sequence: str
    fit_rating: int
    heuristic_score: float
    timestamp_sec: Optional[float]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class FitRatingListResponse(BaseModel):
    """Response for listing fit ratings."""
    ratings: list[FitRatingResponse]


# ===== Endpoints =====

@router.post("/score", response_model=FitScoreResponse)
async def compute_fit_score(
    request: ComputeFitRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> FitScoreResponse:
    """
    Compute heuristic fit score between an ActionBlock and an Asset.

    This endpoint:
    1. Loads the ActionBlock and Asset
    2. Derives ontology tags from the Asset (using generation prompt if available)
    3. Computes a heuristic fit score based on tag alignment
    4. Returns score + detailed explanation

    No data is persisted by this endpoint - use /rate to record feedback.
    """
    # Load block
    block_result = await db.execute(
        select(PromptBlock).where(PromptBlock.id == request.block_id)
    )
    block = block_result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="ActionBlock not found")

    # Load asset
    asset_result = await db.execute(
        select(Asset).where(Asset.id == request.asset_id)
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Try to load associated generation (for prompt-based tagging)
    generation = None
    if asset.id:
        gen_result = await db.execute(
            select(Generation).where(Generation.asset_id == asset.id).limit(1)
        )
        generation = gen_result.scalar_one_or_none()

    # Derive asset tags
    asset_tags = await tag_asset_from_metadata(
        asset=asset,
        generation=generation,
    )

    # Compute fit
    score, details = compute_block_asset_fit(block, asset_tags)

    # Generate explanation
    explanation = explain_fit_score(details)

    logger.info(
        "Computed fit score",
        extra={
            "block_id": str(block.id),
            "asset_id": asset.id,
            "score": score,
        }
    )

    return FitScoreResponse(
        heuristic_score=score,
        details=details,
        explanation=explanation,
    )


@router.post("/rate", response_model=FitRatingResponse)
async def rate_fit(
    request: RateFitRequest,
    db: DatabaseSession,
    user: CurrentUser,
) -> FitRatingResponse:
    """
    Record a user rating for how well an ActionBlock fits an Asset.

    This endpoint:
    1. Computes heuristic fit score (same as /score)
    2. Creates a BlockImageFit record with:
       - User rating (1-5)
       - Heuristic score
       - Snapshots of block and asset tags
       - Sequence context and optional notes
    3. Persists to database
    4. Returns the created record

    Use this to collect training data for fit scoring improvements.
    """
    # Load block
    block_result = await db.execute(
        select(PromptBlock).where(PromptBlock.id == request.block_id)
    )
    block = block_result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="ActionBlock not found")

    # Load asset
    asset_result = await db.execute(
        select(Asset).where(Asset.id == request.asset_id)
    )
    asset = asset_result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Validate generation_id if provided
    if request.generation_id:
        gen_result = await db.execute(
            select(Generation).where(Generation.id == request.generation_id)
        )
        if not gen_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Generation not found")

    # Try to load associated generation for tagging
    generation = None
    if request.generation_id:
        gen_result = await db.execute(
            select(Generation).where(Generation.id == request.generation_id)
        )
        generation = gen_result.scalar_one_or_none()
    elif asset.id:
        gen_result = await db.execute(
            select(Generation).where(Generation.asset_id == asset.id).limit(1)
        )
        generation = gen_result.scalar_one_or_none()

    # Derive asset tags
    asset_tags = await tag_asset_from_metadata(
        asset=asset,
        generation=generation,
    )

    # Compute fit
    score, details = compute_block_asset_fit(block, asset_tags)

    # Create BlockImageFit record
    fit_record = BlockImageFit(
        block_id=request.block_id,
        asset_id=request.asset_id,
        generation_id=request.generation_id,
        role_in_sequence=request.role_in_sequence,
        user_id=user.id,
        fit_rating=request.fit_rating,
        heuristic_score=score,
        timestamp_sec=request.timestamp_sec,
        block_tags_snapshot=block.tags,
        asset_tags_snapshot=asset_tags,
        notes=request.notes,
    )

    db.add(fit_record)
    await db.commit()
    await db.refresh(fit_record)

    logger.info(
        "Recorded fit rating",
        extra={
            "fit_id": fit_record.id,
            "block_id": str(request.block_id),
            "asset_id": request.asset_id,
            "rating": request.fit_rating,
            "heuristic_score": score,
        }
    )

    return FitRatingResponse.model_validate(fit_record)


@router.get("/list", response_model=FitRatingListResponse)
async def list_fit_ratings(
    block_id: Optional[UUID] = None,
    asset_id: Optional[int] = None,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> FitRatingListResponse:
    """
    List fit ratings, optionally filtered by block_id and/or asset_id.

    This endpoint returns existing BlockImageFit records, ordered by creation time
    (newest first). Useful for viewing rating history and timestamped feedback.
    """
    query = select(BlockImageFit).order_by(BlockImageFit.created_at.desc())

    if block_id:
        query = query.where(BlockImageFit.block_id == block_id)
    if asset_id:
        query = query.where(BlockImageFit.asset_id == asset_id)

    # Limit to most recent 100 records
    query = query.limit(100)

    result = await db.execute(query)
    ratings = result.scalars().all()

    return FitRatingListResponse(
        ratings=[FitRatingResponse.model_validate(r) for r in ratings]
    )
