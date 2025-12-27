"""
Prompt Variant Feedback Endpoints

Endpoints for managing prompt variants and their ratings/feedback.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt import PromptVersionService
from .schemas import (
    CreatePromptVariantRequest,
    RatePromptVariantRequest,
    PromptVariantResponse,
)

router = APIRouter()

@router.post("/variants", response_model=PromptVariantResponse)
async def create_prompt_variant(
    request: CreatePromptVariantRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Create or fetch a feedback record for a specific prompt+asset combination.

    This is typically called after a video has been generated so we can
    track which seed images and prompt version produced that asset.
    """
    service = PromptVersionService(db)

    variant = await service.record_variant_feedback(
        prompt_version_id=request.prompt_version_id,
        output_asset_id=request.output_asset_id,
        input_asset_ids=request.input_asset_ids,
        generation_artifact_id=request.generation_artifact_id,
        user_id=user.id,
    )

    return PromptVariantResponse(
        id=variant.id,
        prompt_version_id=variant.prompt_version_id,
        output_asset_id=variant.output_asset_id,
        input_asset_ids=variant.input_asset_ids,
        user_id=variant.user_id,
        user_rating=variant.user_rating,
        quality_score=variant.quality_score,
        is_favorite=variant.is_favorite,
        notes=variant.notes,
        created_at=str(variant.created_at),
    )


@router.patch("/variants/{variant_id}", response_model=PromptVariantResponse)
async def rate_prompt_variant(
    variant_id: int,
    request: RatePromptVariantRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Update rating / favorite / notes for a prompt variant.
    """
    service = PromptVersionService(db)
    try:
        variant = await service.rate_variant(
            variant_id,
            user_rating=request.user_rating,
            is_favorite=request.is_favorite,
            notes=request.notes,
            quality_score=request.quality_score,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return PromptVariantResponse(
        id=variant.id,
        prompt_version_id=variant.prompt_version_id,
        output_asset_id=variant.output_asset_id,
        input_asset_ids=variant.input_asset_ids,
        user_id=variant.user_id,
        user_rating=variant.user_rating,
        quality_score=variant.quality_score,
        is_favorite=variant.is_favorite,
        notes=variant.notes,
        created_at=str(variant.created_at),
    )


@router.get("/versions/{version_id}/variants", response_model=List[PromptVariantResponse])
async def list_prompt_variants_for_version(
    version_id: UUID,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    List feedback variants (prompt + assets) for a given prompt version.
    """
    service = PromptVersionService(db)

    # Ensure version exists
    version = await service.get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    variants = await service.list_variants_for_version(version_id, limit=limit, offset=offset)

    return [
        PromptVariantResponse(
            id=v.id,
            prompt_version_id=v.prompt_version_id,
            output_asset_id=v.output_asset_id,
            input_asset_ids=v.input_asset_ids,
            user_id=v.user_id,
            user_rating=v.user_rating,
            quality_score=v.quality_score,
            is_favorite=v.is_favorite,
            notes=v.notes,
            created_at=str(v.created_at),
        )
        for v in variants
    ]


