"""
Prompt Family and Version CRUD Endpoints

Core endpoints for managing prompt families and versions.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse
from pixsim7.backend.main.services.prompt.git import GitBranchService
from pixsim7.backend.main.services.tag import TagAssignment
from pixsim7.backend.main.domain.prompt.tag import PromptFamilyTag
from .schemas import (
    BranchSummary,
    CreateBranchRequest,
    CreatePromptFamilyRequest,
    CreatePromptVersionRequest,
    ForkFromArtifactRequest,
    PromptFamilyResponse,
    PromptVersionResponse,
    UpdatePromptFamilyRequest,
)

router = APIRouter()


def _version_response(v) -> PromptVersionResponse:
    return PromptVersionResponse(
        id=v.id,
        family_id=v.family_id,
        version_number=v.version_number,
        prompt_text=v.prompt_text,
        commit_message=v.commit_message,
        author=v.author,
        parent_version_id=v.parent_version_id,
        branch_name=v.branch_name,
        generation_count=v.generation_count,
        successful_assets=v.successful_assets,
        tags=v.tags,
        created_at=str(v.created_at),
    )


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

    from pixsim7.backend.main.api.v1.notifications import emit_notification
    await emit_notification(
        db,
        title=f"Prompt family created: {family.title}",
        category="prompt.created",
        severity="info",
        source=user.source,
        event_type="prompt.family_created",
        actor_name=user.actor_display_name,
        actor_user_id=user.user_id,
        ref_type="prompt_family",
        ref_id=str(family.id),
    )

    tag_slugs = [t.slug for t in await TagAssignment(db, PromptFamilyTag, "family_id").get_tags(family.id)]
    return PromptFamilyResponse(
        id=family.id,
        slug=family.slug,
        title=family.title,
        description=family.description,
        prompt_type=family.prompt_type,
        category=family.category,
        tags=tag_slugs,
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

    tags_map = await TagAssignment(db, PromptFamilyTag, "family_id").get_tags_batch(
        [f.id for f in families]
    )
    return [
        PromptFamilyResponse(
            id=f.id,
            slug=f.slug,
            title=f.title,
            description=f.description,
            prompt_type=f.prompt_type,
            category=f.category,
            tags=[t.slug for t in tags_map.get(f.id, [])],
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

    tag_slugs = [t.slug for t in await TagAssignment(db, PromptFamilyTag, "family_id").get_tags(family.id)]
    return PromptFamilyResponse(
        id=family.id,
        slug=family.slug,
        title=family.title,
        description=family.description,
        prompt_type=family.prompt_type,
        category=family.category,
        tags=tag_slugs,
        is_active=family.is_active,
        version_count=len(versions)
    )


@router.patch("/families/{family_id}", response_model=PromptFamilyResponse)
async def update_family(
    family_id: UUID,
    request: UpdatePromptFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """Update mutable fields on a prompt family"""
    service = PromptVersionService(db)

    updates = request.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    family = await service.update_family(family_id, **updates)

    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    from pixsim7.backend.main.api.v1.notifications import emit_notification
    changed_fields = list(updates.keys())
    await emit_notification(
        db,
        title=f"Prompt updated: {family.title}",
        body=f"Fields: {', '.join(changed_fields)}",
        category="prompt.updated",
        severity="info",
        source=user.source,
        event_type="prompt.family_updated",
        actor_name=user.actor_display_name,
        actor_user_id=user.user_id,
        ref_type="prompt_family",
        ref_id=str(family.id),
        payload={"changed_fields": changed_fields},
    )

    tag_slugs = [t.slug for t in await TagAssignment(db, PromptFamilyTag, "family_id").get_tags(family.id)]
    return PromptFamilyResponse(
        id=family.id,
        slug=family.slug,
        title=family.title,
        description=family.description,
        prompt_type=family.prompt_type,
        category=family.category,
        tags=tag_slugs,
        is_active=family.is_active
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

    if isinstance(request.provider_hints, dict) and "prompt_analysis" in request.provider_hints:
        raise HTTPException(
            status_code=422,
            detail="provider_hints.prompt_analysis is deprecated; use prompt_analysis field",
        )

    version = await service.create_version(
        family_id=family_id,
        prompt_text=request.prompt_text,
        commit_message=request.commit_message,
        author=request.author or user.email,
        parent_version_id=request.parent_version_id,
        variables=request.variables,
        provider_hints=request.provider_hints,
        prompt_analysis=request.prompt_analysis,
        tags=request.tags
    )

    from pixsim7.backend.main.api.v1.notifications import emit_notification
    await emit_notification(
        db,
        title=f"Prompt version v{version.version_number}: {family.title}",
        body=request.commit_message,
        category="prompt.version_created",
        severity="info",
        source=user.source,
        event_type="prompt.version_created",
        actor_name=user.actor_display_name,
        actor_user_id=user.user_id,
        ref_type="prompt_version",
        ref_id=str(version.id),
    )

    return _version_response(version)


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

    return [_version_response(v) for v in versions]


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

    return _version_response(version)


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

    return _version_response(version)


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
        "assets": [AssetResponse.model_validate(a).model_dump() for a in assets]
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

    return _version_response(version)


# ===== Branch Endpoints =====


@router.get("/families/{family_id}/branches", response_model=List[BranchSummary])
async def list_branches(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List all branches for a prompt family"""
    branch_service = GitBranchService(db)
    try:
        branches = await branch_service.list_branches(family_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list branches: {e}")

    return [BranchSummary(**b) for b in branches]


@router.post("/families/{family_id}/branches", response_model=PromptVersionResponse)
async def create_branch(
    family_id: UUID,
    request: CreateBranchRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new branch from a version (or latest)"""
    branch_service = GitBranchService(db)
    try:
        version = await branch_service.create_branch(
            family_id=family_id,
            branch_name=request.branch_name,
            from_version_id=request.from_version_id,
            author=request.author or user.email,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _version_response(version)
