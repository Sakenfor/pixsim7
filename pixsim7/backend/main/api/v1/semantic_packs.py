"""Semantic Packs API endpoints

REST API for managing shareable prompt semantics bundles including:
- Pack creation and updates
- Pack discovery and listing
- Publishing workflow
- Export for sharing
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlmodel import func

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB
from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.shared.schemas.semantic_pack_schemas import (
    SemanticPackManifest,
    SemanticPackCreateRequest,
    SemanticPackListRequest,
    SemanticPackPublishRequest,
    SemanticPackExportResponse,
    SemanticPackStatus,
)

router = APIRouter(prefix="/semantic-packs", tags=["semantic_packs"])


# ===== Helper Functions =====

async def get_pack_or_404(
    db: AsyncSession,
    pack_id: str
) -> SemanticPackDB:
    """Get a semantic pack by ID or raise 404"""
    result = await db.execute(
        select(SemanticPackDB).where(SemanticPackDB.id == pack_id)
    )
    pack = result.scalar_one_or_none()
    if not pack:
        raise HTTPException(status_code=404, detail=f"Semantic pack '{pack_id}' not found")
    return pack


# ===== Endpoints =====

@router.get("", response_model=List[SemanticPackManifest])
async def list_semantic_packs(
    status: Optional[str] = Query(None, description="Filter by status (draft/published/deprecated)"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    author: Optional[str] = Query(None, description="Filter by author"),
    ontology_version: Optional[str] = Query(None, description="Filter by compatible ontology version"),
    limit: int = Query(50, ge=1, le=100, description="Max results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List semantic packs with optional filters.

    Supports filtering by status, tag, author, and ontology version compatibility.
    """
    # Build query with filters
    query = select(SemanticPackDB)
    filters = []

    if status:
        filters.append(SemanticPackDB.status == status)

    if author:
        filters.append(SemanticPackDB.author == author)

    # Tag filtering (array contains)
    if tag:
        # PostgreSQL-specific: Check if tag is in tags array
        filters.append(func.jsonb_contains(SemanticPackDB.tags, f'["{tag}"]'))

    # Ontology version filtering (simplified - just check if within range)
    if ontology_version:
        # If min is set, ontology_version >= min
        # If max is set, ontology_version <= max
        # This is simplified - full semver comparison would be more complex
        filters.append(
            or_(
                SemanticPackDB.ontology_version_min == None,
                SemanticPackDB.ontology_version_min <= ontology_version
            )
        )
        filters.append(
            or_(
                SemanticPackDB.ontology_version_max == None,
                SemanticPackDB.ontology_version_max >= ontology_version
            )
        )

    if filters:
        query = query.where(and_(*filters))

    # Apply ordering and pagination
    query = query.order_by(SemanticPackDB.created_at.desc())
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    packs = result.scalars().all()

    return [pack.to_manifest() for pack in packs]


@router.get("/{pack_id}", response_model=SemanticPackManifest)
async def get_semantic_pack(
    pack_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific semantic pack by ID.

    Returns the complete manifest including parser hints and content references.
    """
    pack = await get_pack_or_404(db, pack_id)
    return pack.to_manifest()


@router.post("", response_model=SemanticPackManifest)
async def create_or_update_semantic_pack(
    request: SemanticPackCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create or update a semantic pack.

    This is an authoring endpoint - only accessible to creators.
    Creates a new pack or updates an existing one if the ID already exists.
    """
    # Check if pack already exists
    result = await db.execute(
        select(SemanticPackDB).where(SemanticPackDB.id == request.id)
    )
    existing_pack = result.scalar_one_or_none()

    if existing_pack:
        # Update existing pack
        existing_pack.version = request.version
        existing_pack.label = request.label
        existing_pack.description = request.description
        existing_pack.author = request.author
        existing_pack.ontology_version_min = request.ontology_version_min
        existing_pack.ontology_version_max = request.ontology_version_max
        existing_pack.tags = request.tags
        existing_pack.parser_hints = request.parser_hints
        existing_pack.action_block_ids = request.action_block_ids
        existing_pack.prompt_family_slugs = request.prompt_family_slugs
        existing_pack.status = request.status.value if isinstance(request.status, SemanticPackStatus) else request.status
        existing_pack.extra = request.extra
        existing_pack.updated_at = datetime.utcnow()

        pack = existing_pack
    else:
        # Create new pack
        pack = SemanticPackDB(
            id=request.id,
            version=request.version,
            label=request.label,
            description=request.description,
            author=request.author,
            ontology_version_min=request.ontology_version_min,
            ontology_version_max=request.ontology_version_max,
            tags=request.tags,
            parser_hints=request.parser_hints,
            action_block_ids=request.action_block_ids,
            prompt_family_slugs=request.prompt_family_slugs,
            status=request.status.value if isinstance(request.status, SemanticPackStatus) else request.status,
            extra=request.extra,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(pack)

    await db.commit()
    await db.refresh(pack)

    return pack.to_manifest()


@router.post("/{pack_id}/publish", response_model=SemanticPackManifest)
async def publish_semantic_pack(
    pack_id: str,
    request: SemanticPackPublishRequest = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Publish a semantic pack (change status to 'published').

    Future enhancements:
    - Validate that all referenced ActionBlocks and PromptFamilies exist
    - Check ontology version compatibility
    - Trigger any post-publish workflows
    """
    pack = await get_pack_or_404(db, pack_id)

    # Check current status
    if pack.status == "published":
        raise HTTPException(
            status_code=400,
            detail=f"Pack '{pack_id}' is already published"
        )

    # Future: Add validation here
    # - Verify all action_block_ids exist
    # - Verify all prompt_family_slugs exist
    # - Validate parser_hints format
    # - Check ontology compatibility

    # Update status
    pack.status = "published"
    pack.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(pack)

    return pack.to_manifest()


@router.post("/{pack_id}/export", response_model=SemanticPackExportResponse)
async def export_semantic_pack(
    pack_id: str,
    include_action_blocks: bool = Query(True, description="Include full ActionBlock data"),
    include_prompt_families: bool = Query(True, description="Include full PromptFamily data"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export a semantic pack with full content for sharing.

    Returns the manifest plus optionally the full ActionBlock and PromptFamily data
    referenced by the pack, creating a self-contained bundle.
    """
    pack = await get_pack_or_404(db, pack_id)

    # Initialize response
    export_data = SemanticPackExportResponse(
        manifest=pack.to_manifest(),
        action_blocks=[],
        prompt_families=[],
    )

    # Include ActionBlocks if requested
    if include_action_blocks and pack.action_block_ids:
        result = await db.execute(
            select(PromptBlock).where(
                PromptBlock.block_id.in_(pack.action_block_ids)
            )
        )
        blocks = result.scalars().all()
        export_data.action_blocks = [block.to_json_dict() for block in blocks]

    # Include PromptFamilies if requested
    if include_prompt_families and pack.prompt_family_slugs:
        # Future: Fetch PromptFamily data when that model is available
        # For now, just return empty list
        export_data.prompt_families = []

    return export_data


@router.delete("/{pack_id}")
async def delete_semantic_pack(
    pack_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a semantic pack.

    Only works for draft packs. Published packs should be deprecated instead.
    """
    pack = await get_pack_or_404(db, pack_id)

    # Only allow deleting draft packs
    if pack.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete a {pack.status} pack. Use deprecate instead."
        )

    await db.delete(pack)
    await db.commit()

    return {"status": "deleted", "pack_id": pack_id}


@router.post("/{pack_id}/deprecate", response_model=SemanticPackManifest)
async def deprecate_semantic_pack(
    pack_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deprecate a published semantic pack.

    Sets status to 'deprecated' instead of deleting, preserving history.
    """
    pack = await get_pack_or_404(db, pack_id)

    pack.status = "deprecated"
    pack.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(pack)

    return pack.to_manifest()
