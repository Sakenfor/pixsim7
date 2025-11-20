"""
Prompt Family and Version CRUD Endpoints

Core endpoints for managing prompt families and versions.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompts import PromptVersionService
from .schemas import (
    CreatePromptFamilyRequest,
    CreatePromptVersionRequest,
    ForkFromArtifactRequest,
    PromptFamilyResponse,
    PromptVersionResponse,
)

router = APIRouter()

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


