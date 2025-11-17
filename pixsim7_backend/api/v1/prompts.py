"""Prompt versioning API endpoints - Phase 1"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.api.dependencies import get_db, get_current_user
from pixsim7_backend.services.prompts import PromptVersionService
from pixsim7_backend.domain.prompt_versioning import PromptFamily, PromptVersion, PromptVariantFeedback

router = APIRouter(prefix="/prompts", tags=["prompts"])


# ===== Request/Response Models =====

class CreatePromptFamilyRequest(BaseModel):
    title: str = Field(..., description="Human-readable title")
    prompt_type: str = Field(..., description="'visual', 'narrative', or 'hybrid'")
    slug: Optional[str] = Field(None, description="URL-safe identifier (auto-generated if not provided)")
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    game_world_id: Optional[UUID] = None
    npc_id: Optional[UUID] = None
    scene_id: Optional[UUID] = None
    action_concept_id: Optional[str] = None


class CreatePromptVersionRequest(BaseModel):
    prompt_text: str = Field(..., description="The actual prompt text")
    commit_message: Optional[str] = Field(None, description="Description of changes")
    author: Optional[str] = None
    parent_version_id: Optional[UUID] = None
    variables: dict = Field(default_factory=dict)
    provider_hints: dict = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)


class ForkFromArtifactRequest(BaseModel):
    artifact_id: int = Field(..., description="Source artifact to fork from")
    family_id: UUID = Field(..., description="Target family for new version")
    commit_message: str = Field(..., description="Description of changes")
    modifications: Optional[str] = Field(None, description="Modified prompt text")
    author: Optional[str] = None


class PromptFamilyResponse(BaseModel):
    id: UUID
    slug: str
    title: str
    description: Optional[str]
    prompt_type: str
    category: Optional[str]
    tags: List[str]
    is_active: bool
    version_count: Optional[int] = None

    class Config:
        from_attributes = True


class PromptVersionResponse(BaseModel):
    id: UUID
    family_id: UUID
    version_number: int
    prompt_text: str
    commit_message: Optional[str]
    author: Optional[str]
    generation_count: int
    successful_assets: int
    tags: List[str]
    created_at: str

    class Config:
        from_attributes = True


class PromptVariantResponse(BaseModel):
    id: int
    prompt_version_id: UUID
    output_asset_id: int
    input_asset_ids: List[int]
    user_id: Optional[int]
    user_rating: Optional[int]
    quality_score: Optional[float]
    is_favorite: bool
    notes: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class CreatePromptVariantRequest(BaseModel):
    prompt_version_id: UUID
    output_asset_id: int
    input_asset_ids: List[int] = Field(default_factory=list)
    generation_artifact_id: Optional[int] = None


class RatePromptVariantRequest(BaseModel):
    user_rating: Optional[int] = Field(None, description="1-5 rating")
    is_favorite: Optional[bool] = None
    notes: Optional[str] = None
    quality_score: Optional[float] = None


# ===== Prompt Family Endpoints =====

@router.post("/families", response_model=PromptFamilyResponse)
async def create_family(
    request: CreatePromptFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Create a new prompt family"""
    service = PromptVersionService(db)

    family = await service.create_family(
        title=request.title,
        prompt_type=request.prompt_type,
        slug=request.slug,
        description=request.description,
        category=request.category,
        tags=request.tags,
        game_world_id=request.game_world_id,
        npc_id=request.npc_id,
        scene_id=request.scene_id,
        action_concept_id=request.action_concept_id,
        created_by=user.email
    )

    return PromptFamilyResponse(
        id=family.id,
        slug=family.slug,
        title=family.title,
        description=family.description,
        prompt_type=family.prompt_type,
        category=family.category,
        tags=family.tags,
        is_active=family.is_active
    )


@router.get("/families", response_model=List[PromptFamilyResponse])
async def list_families(
    prompt_type: Optional[str] = None,
    category: Optional[str] = None,
    is_active: bool = True,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """List prompt families with optional filtering"""
    service = PromptVersionService(db)

    families = await service.list_families(
        prompt_type=prompt_type,
        category=category,
        is_active=is_active,
        limit=limit,
        offset=offset
    )

    return [
        PromptFamilyResponse(
            id=f.id,
            slug=f.slug,
            title=f.title,
            description=f.description,
            prompt_type=f.prompt_type,
            category=f.category,
            tags=f.tags,
            is_active=f.is_active
        )
        for f in families
    ]


@router.get("/families/{family_id}", response_model=PromptFamilyResponse)
async def get_family(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Get a specific prompt family"""
    service = PromptVersionService(db)
    family = await service.get_family(family_id)

    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    # Get version count
    versions = await service.list_versions(family_id, limit=1000)

    return PromptFamilyResponse(
        id=family.id,
        slug=family.slug,
        title=family.title,
        description=family.description,
        prompt_type=family.prompt_type,
        category=family.category,
        tags=family.tags,
        is_active=family.is_active,
        version_count=len(versions)
    )


# ===== Prompt Version Endpoints =====

@router.post("/families/{family_id}/versions", response_model=PromptVersionResponse)
async def create_version(
    family_id: UUID,
    request: CreatePromptVersionRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Create a new version in a family"""
    service = PromptVersionService(db)

    # Verify family exists
    family = await service.get_family(family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    version = await service.create_version(
        family_id=family_id,
        prompt_text=request.prompt_text,
        commit_message=request.commit_message,
        author=request.author or user.email,
        parent_version_id=request.parent_version_id,
        variables=request.variables,
        provider_hints=request.provider_hints,
        tags=request.tags
    )

    return PromptVersionResponse(
        id=version.id,
        family_id=version.family_id,
        version_number=version.version_number,
        prompt_text=version.prompt_text,
        commit_message=version.commit_message,
        author=version.author,
        generation_count=version.generation_count,
        successful_assets=version.successful_assets,
        tags=version.tags,
        created_at=str(version.created_at)
    )


@router.get("/families/{family_id}/versions", response_model=List[PromptVersionResponse])
async def list_versions(
    family_id: UUID,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """List all versions for a family (newest first)"""
    service = PromptVersionService(db)

    versions = await service.list_versions(family_id, limit=limit, offset=offset)

    return [
        PromptVersionResponse(
            id=v.id,
            family_id=v.family_id,
            version_number=v.version_number,
            prompt_text=v.prompt_text,
            commit_message=v.commit_message,
            author=v.author,
            generation_count=v.generation_count,
            successful_assets=v.successful_assets,
            tags=v.tags,
            created_at=str(v.created_at)
        )
        for v in versions
    ]


@router.get("/versions/{version_id}", response_model=PromptVersionResponse)
async def get_version(
    version_id: UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Get a specific prompt version"""
    service = PromptVersionService(db)
    version = await service.get_version(version_id)

    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    return PromptVersionResponse(
        id=version.id,
        family_id=version.family_id,
        version_number=version.version_number,
        prompt_text=version.prompt_text,
        commit_message=version.commit_message,
        author=version.author,
        generation_count=version.generation_count,
        successful_assets=version.successful_assets,
        tags=version.tags,
        created_at=str(version.created_at)
    )


@router.post("/versions/fork-from-artifact", response_model=PromptVersionResponse)
async def fork_from_artifact(
    request: ForkFromArtifactRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Create a new version from an existing artifact's prompt"""
    service = PromptVersionService(db)

    try:
        version = await service.fork_from_artifact(
            artifact_id=request.artifact_id,
            family_id=request.family_id,
            commit_message=request.commit_message,
            modifications=request.modifications,
            author=request.author or user.email
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return PromptVersionResponse(
        id=version.id,
        family_id=version.family_id,
        version_number=version.version_number,
        prompt_text=version.prompt_text,
        commit_message=version.commit_message,
        author=version.author,
        generation_count=version.generation_count,
        successful_assets=version.successful_assets,
        tags=version.tags,
        created_at=str(version.created_at)
    )


@router.get("/versions/{version_id}/assets")
async def get_version_assets(
    version_id: UUID,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Get all assets generated from this prompt version"""
    service = PromptVersionService(db)

    # Verify version exists
    version = await service.get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    assets = await service.get_assets_for_version(version_id, limit=limit)

    return {
        "version_id": str(version_id),
        "asset_count": len(assets),
        "assets": [
            {
                "id": a.id,
                "media_type": a.media_type.value,
                "remote_url": a.remote_url,
                "thumbnail_url": a.thumbnail_url,
                "created_at": str(a.created_at)
            }
            for a in assets
        ]
    }


@router.get("/assets/{asset_id}/prompt-version", response_model=Optional[PromptVersionResponse])
async def get_asset_prompt_version(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Find which prompt version created this asset"""
    service = PromptVersionService(db)

    version = await service.get_version_for_asset(asset_id)

    if not version:
        return None

    return PromptVersionResponse(
        id=version.id,
        family_id=version.family_id,
        version_number=version.version_number,
        prompt_text=version.prompt_text,
        commit_message=version.commit_message,
        author=version.author,
        generation_count=version.generation_count,
        successful_assets=version.successful_assets,
        tags=version.tags,
        created_at=str(version.created_at)
    )


# ===== Prompt Variant Feedback =====


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


# ===== Diff & Comparison Endpoints (Phase 2) =====


@router.get("/versions/{version_id}/diff")
async def get_version_diff(
    version_id: UUID,
    format: str = "inline",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get diff for a version compared to its parent

    Query params:
        - format: 'inline' (default), 'unified', or 'summary'
    """
    service = PromptVersionService(db)
    diff = await service.get_version_diff(version_id, format=format)

    if not diff:
        raise HTTPException(
            status_code=404,
            detail="Version not found or has no parent version"
        )

    return diff


@router.get("/versions/compare")
async def compare_versions(
    from_version_id: UUID,
    to_version_id: UUID,
    format: str = "inline",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Compare two arbitrary versions

    Query params:
        - from_version_id: Source version UUID
        - to_version_id: Target version UUID
        - format: 'inline' (default), 'unified', or 'summary'
    """
    service = PromptVersionService(db)

    try:
        comparison = await service.compare_versions(
            from_version_id,
            to_version_id,
            format=format
        )
        return comparison
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ===== Analytics Endpoints (Phase 2) =====


@router.get("/versions/{version_id}/analytics")
async def get_version_analytics(
    version_id: UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get comprehensive analytics for a version

    Returns performance metrics, usage stats, and ratings.
    """
    service = PromptVersionService(db)

    try:
        analytics = await service.get_version_analytics(version_id)
        return analytics
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/families/{family_id}/analytics")
async def get_family_analytics(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get aggregate analytics for all versions in a family

    Returns family-wide performance metrics including best performing version.
    """
    service = PromptVersionService(db)

    try:
        analytics = await service.get_family_analytics(family_id)
        return analytics
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/analytics/top-performing")
async def get_top_performing_versions(
    family_id: Optional[UUID] = None,
    limit: int = 10,
    metric: str = "success_rate",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Get top performing versions by various metrics

    Query params:
        - family_id: Optional UUID to filter by family
        - limit: Number of results (default 10, max 100)
        - metric: Sort by 'success_rate' (default), 'total_generations', or 'avg_rating'
    """
    if limit > 100:
        limit = 100

    if metric not in ["success_rate", "total_generations", "avg_rating"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid metric. Must be 'success_rate', 'total_generations', or 'avg_rating'"
        )

    service = PromptVersionService(db)
    top_versions = await service.get_top_performing_versions(
        family_id=family_id,
        limit=limit,
        metric=metric
    )

    return {
        "metric": metric,
        "limit": limit,
        "family_id": str(family_id) if family_id else None,
        "versions": top_versions,
    }
