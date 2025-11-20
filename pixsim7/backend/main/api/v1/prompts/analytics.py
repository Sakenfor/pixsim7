"""
Prompt Analytics and Comparison Endpoints

Endpoints for analyzing prompt performance, comparing versions, and viewing metrics.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompts import PromptVersionService

router = APIRouter()

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


