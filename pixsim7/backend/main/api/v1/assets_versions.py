"""
Asset versioning API endpoints

Git-like versioning for assets:
- Version family management
- Version timeline queries
- HEAD management
- Fork operations
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.asset.versioning import AssetVersioningService
from pixsim7.backend.main.domain.assets.versioning import AssetVersionFamily
from pixsim_logging import get_logger

router = APIRouter(prefix="/versions", tags=["Asset Versions"])
logger = get_logger()


# ===== RESPONSE SCHEMAS =====

class VersionFamilyResponse(BaseModel):
    """Response for a version family"""
    id: str
    name: Optional[str]
    description: Optional[str]
    tags: List[str]
    head_asset_id: Optional[int]
    user_id: int
    created_at: datetime
    updated_at: datetime
    version_count: int
    latest_version_number: int

    class Config:
        from_attributes = True


class VersionTimelineEntry(BaseModel):
    """A single entry in the version timeline"""
    asset_id: int
    version_number: int
    version_message: Optional[str]
    parent_asset_id: Optional[int]
    is_head: bool
    created_at: Optional[str]
    description: Optional[str]
    thumbnail_url: Optional[str]


class VersionSummary(BaseModel):
    """Summary of an asset's version info"""
    asset_id: int
    version_family_id: Optional[str]
    version_number: Optional[int]
    parent_asset_id: Optional[int]
    version_message: Optional[str]
    is_versioned: bool
    is_head: bool


class SetHeadRequest(BaseModel):
    """Request to set the HEAD of a family"""
    asset_id: int = Field(..., description="Asset ID to set as HEAD")


class ForkRequest(BaseModel):
    """Request to fork an asset to a new family"""
    name: Optional[str] = Field(None, max_length=255, description="Name for the new family")


# ===== HELPER FUNCTIONS =====

async def _build_family_response(
    family: AssetVersionFamily,
    service: AssetVersioningService
) -> VersionFamilyResponse:
    """Build a family response with derived stats."""
    stats = await service.get_family_stats(family.id)
    return VersionFamilyResponse(
        id=str(family.id),
        name=family.name,
        description=family.description,
        tags=family.tags or [],
        head_asset_id=family.head_asset_id,
        user_id=family.user_id,
        created_at=family.created_at,
        updated_at=family.updated_at,
        version_count=stats["version_count"],
        latest_version_number=stats["latest_version_number"]
    )


# ===== FAMILY ENDPOINTS =====

@router.get("/families/{family_id}", response_model=VersionFamilyResponse)
async def get_version_family(
    family_id: UUID,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Get a version family by ID.

    Returns family metadata with derived version count and latest version number.
    """
    service = AssetVersioningService(db)
    family = await service.get_family(family_id)

    if not family:
        raise HTTPException(status_code=404, detail="Version family not found")

    if family.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this family")

    return await _build_family_response(family, service)


@router.get("/families/{family_id}/timeline", response_model=List[VersionTimelineEntry])
async def get_family_timeline(
    family_id: UUID,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Get timeline view of all versions in a family.

    Returns versions ordered by version number with HEAD indicator.
    """
    service = AssetVersioningService(db)
    family = await service.get_family(family_id)

    if not family:
        raise HTTPException(status_code=404, detail="Version family not found")

    if family.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this family")

    timeline = await service.get_version_timeline(family_id)
    return [VersionTimelineEntry(**entry) for entry in timeline]


@router.post("/families/{family_id}/set-head", response_model=VersionFamilyResponse)
async def set_family_head(
    family_id: UUID,
    request: SetHeadRequest,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Set which asset is the HEAD (current best) version.

    The specified asset must belong to the family.
    """
    service = AssetVersioningService(db)
    family = await service.get_family(family_id)

    if not family:
        raise HTTPException(status_code=404, detail="Version family not found")

    if family.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this family")

    try:
        updated_family = await service.set_head(family_id, request.asset_id)
        await db.commit()
        return await _build_family_response(updated_family, service)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== ASSET VERSION ENDPOINTS =====

@router.get("/assets/{asset_id}/versions", response_model=List[VersionSummary])
async def get_asset_versions(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Get all versions of an asset.

    If the asset belongs to a version family, returns all versions in that family.
    If the asset is standalone, returns just that asset.
    """
    service = AssetVersioningService(db)
    family = await service.get_family_for_asset(asset_id)

    if not family:
        # Standalone asset - return just itself
        from pixsim7.backend.main.domain.assets.models import Asset
        from sqlalchemy import select

        result = await db.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one_or_none()

        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        if asset.user_id != user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this asset")

        return [VersionSummary(
            asset_id=asset.id,
            version_family_id=None,
            version_number=None,
            parent_asset_id=None,
            version_message=None,
            is_versioned=False,
            is_head=False,
        )]

    if family.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this family")

    versions = await service.get_versions(family.id)
    return [
        VersionSummary(
            asset_id=v.id,
            version_family_id=v.version_family_id,
            version_number=v.version_number,
            parent_asset_id=v.parent_asset_id,
            version_message=v.version_message,
            is_versioned=True,
            is_head=v.id == family.head_asset_id,
        )
        for v in versions
    ]


@router.get("/assets/{asset_id}/ancestry", response_model=List[VersionSummary])
async def get_asset_ancestry(
    asset_id: int,
    user: CurrentUser,
    db: DatabaseSession,
    max_depth: int = Query(50, ge=1, le=100, description="Maximum ancestors to return"),
):
    """
    Get all ancestors of an asset (parent, grandparent, etc.).

    Returns ancestors ordered oldest first.
    """
    service = AssetVersioningService(db)

    # First check access
    from pixsim7.backend.main.domain.assets.models import Asset
    from sqlalchemy import select

    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this asset")

    ancestors = await service.get_ancestry(asset_id, max_depth)

    # Get family HEAD for is_head flag
    family = await service.get_family_for_asset(asset_id)
    head_id = family.head_asset_id if family else None

    return [
        VersionSummary(
            asset_id=a.id,
            version_family_id=a.version_family_id,
            version_number=a.version_number,
            parent_asset_id=a.parent_asset_id,
            version_message=a.version_message,
            is_versioned=a.version_family_id is not None,
            is_head=a.id == head_id,
        )
        for a in ancestors
    ]


@router.post("/assets/{asset_id}/fork", response_model=VersionFamilyResponse)
async def fork_asset(
    asset_id: int,
    request: ForkRequest,
    user: CurrentUser,
    db: DatabaseSession,
):
    """
    Create a new version family starting from this asset.

    SEMANTICS:
    - Creates a NEW family
    - Source asset is NOT moved - it stays in its original family (if any)
    - The new family starts empty; add versions via generation with version_intent="version"

    Use this when you want to "branch off" in a new direction from an existing asset.
    """
    service = AssetVersioningService(db)

    # Check access
    from pixsim7.backend.main.domain.assets.models import Asset
    from sqlalchemy import select

    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if asset.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to fork this asset")

    try:
        family = await service.fork_to_new_family(
            source_asset_id=asset_id,
            user_id=user.id,
            fork_name=request.name,
        )
        await db.commit()
        return await _build_family_response(family, service)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
