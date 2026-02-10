"""Git-like API endpoints for Prompt Versioning

Provides Git-like operations for prompt versions:
- Branch management (create, delete, list, switch)
- Merge operations (with AI conflict resolution)
- History and timeline views
- Rollback and revert
- Tag management
- Cherry-pick
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt import (
    GitBranchService,
    GitMergeService,
    GitOperationsService
)
from pixsim7.backend.main.domain.user import User

router = APIRouter(prefix="/prompts/git", tags=["prompts-git"])


# ===== Request/Response Models =====

class CreateBranchRequest(BaseModel):
    branch_name: str = Field(..., description="Name for the new branch")
    from_version_id: Optional[UUID] = Field(None, description="Branch from this version (None = latest)")


class MergeRequest(BaseModel):
    source_version_id: UUID = Field(..., description="Version to merge FROM")
    target_version_id: UUID = Field(..., description="Version to merge INTO")
    strategy: str = Field(default="auto", description="Merge strategy: auto, fast-forward, three-way, ours, theirs, ai")
    commit_message: Optional[str] = None


class RollbackRequest(BaseModel):
    target_version_id: UUID = Field(..., description="Version to rollback to")
    commit_message: Optional[str] = None


class TagRequest(BaseModel):
    tag: str = Field(..., description="Tag name")


class CherryPickRequest(BaseModel):
    version_to_pick_id: UUID = Field(..., description="Version to cherry-pick")
    target_branch: Optional[str] = Field(None, description="Branch to apply to (None = current/main)")


# ===== BRANCH MANAGEMENT ENDPOINTS =====

@router.post("/families/{family_id}/branches", response_model=Dict[str, Any])
async def create_branch(
    family_id: UUID,
    request: CreateBranchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new branch (like git branch or git checkout -b)"""
    service = GitBranchService(db)

    try:
        version = await service.create_branch(
            family_id=family_id,
            branch_name=request.branch_name,
            from_version_id=request.from_version_id,
            author=current_user.username if current_user else None
        )

        return {
            "success": True,
            "branch_name": request.branch_name,
            "head_version_id": str(version.id),
            "version_number": version.version_number,
            "message": f"Branch '{request.branch_name}' created"
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/families/{family_id}/branches/{branch_name}", response_model=Dict[str, Any])
async def delete_branch(
    family_id: UUID,
    branch_name: str,
    force: bool = Query(False, description="Force delete even if unmerged"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a branch (like git branch -d)"""
    service = GitBranchService(db)

    try:
        result = await service.delete_branch(family_id, branch_name, force)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/families/{family_id}/branches", response_model=List[Dict[str, Any]])
async def list_branches(
    family_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """List all branches in a family (like git branch)"""
    service = GitBranchService(db)
    branches = await service.list_branches(family_id)
    return branches


@router.get("/families/{family_id}/branches/{branch_name}/history", response_model=List[Dict[str, Any]])
async def get_branch_history(
    family_id: UUID,
    branch_name: str,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db)
):
    """Get commit history for a branch (like git log)"""
    service = GitBranchService(db)
    history = await service.get_branch_history(family_id, branch_name, limit)
    return history


@router.get("/families/{family_id}/branches/visualize", response_model=Dict[str, Any])
async def visualize_branches(
    family_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Generate branch visualization data (like git log --graph)"""
    service = GitBranchService(db)
    graph = await service.visualize_branches(family_id)
    return graph


@router.post("/families/{family_id}/branches/{branch_name}/switch", response_model=Dict[str, Any])
async def switch_branch(
    family_id: UUID,
    branch_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Switch to a branch (like git checkout)"""
    service = GitBranchService(db)

    try:
        result = await service.switch_branch(family_id, branch_name)
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/families/{family_id}/branches/divergence", response_model=Dict[str, Any])
async def get_branch_divergence(
    family_id: UUID,
    branch1: str = Query(..., description="First branch name"),
    branch2: str = Query(..., description="Second branch name"),
    db: AsyncSession = Depends(get_db)
):
    """Get divergence between two branches"""
    service = GitBranchService(db)

    try:
        result = await service.get_divergence(family_id, branch1, branch2)
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


# ===== MERGE ENDPOINTS =====

@router.post("/families/{family_id}/merge", response_model=Dict[str, Any])
async def merge_versions(
    family_id: UUID,
    request: MergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Merge two versions (like git merge)

    Strategies:
    - auto: Automatically choose best strategy
    - fast-forward: Fast-forward if possible
    - three-way: Combine changes from both
    - ours: Keep target version
    - theirs: Use source version
    - ai: AI-powered intelligent merge
    """
    service = GitMergeService(db)

    try:
        result = await service.merge(
            family_id=family_id,
            source_version_id=request.source_version_id,
            target_version_id=request.target_version_id,
            strategy=request.strategy,
            commit_message=request.commit_message,
            author=current_user.username if current_user else None
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/merge/detect-conflicts", response_model=Dict[str, Any])
async def detect_merge_conflicts(
    source_version_id: UUID = Query(..., description="Source version"),
    target_version_id: UUID = Query(..., description="Target version"),
    db: AsyncSession = Depends(get_db)
):
    """Detect merge conflicts between two versions"""
    service = GitMergeService(db)

    try:
        result = await service.detect_conflicts(source_version_id, target_version_id)
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))


# ===== HISTORY & TIMELINE ENDPOINTS =====

@router.get("/families/{family_id}/timeline", response_model=List[Dict[str, Any]])
async def get_timeline(
    family_id: UUID,
    start_date: Optional[datetime] = Query(None, description="Filter from this date"),
    end_date: Optional[datetime] = Query(None, description="Filter to this date"),
    branch_name: Optional[str] = Query(None, description="Filter by branch"),
    db: AsyncSession = Depends(get_db)
):
    """Get timeline view of all changes (like git log --all --graph)"""
    service = GitOperationsService(db)
    timeline = await service.get_timeline(family_id, start_date, end_date, branch_name)
    return timeline


@router.get("/families/{family_id}/activity", response_model=Dict[str, Any])
async def get_activity_summary(
    family_id: UUID,
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    db: AsyncSession = Depends(get_db)
):
    """Get activity summary for last N days"""
    service = GitOperationsService(db)
    summary = await service.get_activity_summary(family_id, days)
    return summary


# ===== ROLLBACK & REVERT ENDPOINTS =====

@router.post("/families/{family_id}/rollback", response_model=Dict[str, Any])
async def rollback_to_version(
    family_id: UUID,
    request: RollbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Rollback to a previous version (like git reset)"""
    service = GitOperationsService(db)

    try:
        version = await service.rollback_to_version(
            family_id=family_id,
            target_version_id=request.target_version_id,
            author=current_user.username if current_user else None,
            commit_message=request.commit_message
        )

        return {
            "success": True,
            "new_version_id": str(version.id),
            "version_number": version.version_number,
            "message": "Rollback completed"
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/families/{family_id}/revert/{version_id}", response_model=Dict[str, Any])
async def revert_version(
    family_id: UUID,
    version_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Revert a specific version's changes (like git revert)"""
    service = GitOperationsService(db)

    try:
        version = await service.revert_version(
            family_id=family_id,
            version_to_revert_id=version_id,
            author=current_user.username if current_user else None
        )

        return {
            "success": True,
            "new_version_id": str(version.id),
            "version_number": version.version_number,
            "message": "Revert completed"
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


# ===== TAG MANAGEMENT ENDPOINTS =====

@router.post("/versions/{version_id}/tags", response_model=Dict[str, Any])
async def add_tag(
    version_id: UUID,
    request: TagRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a tag to a version (like git tag)"""
    service = GitOperationsService(db)

    try:
        version = await service.add_tag(version_id, request.tag)
        return {
            "success": True,
            "version_id": str(version.id),
            "tag": request.tag,
            "all_tags": version.tags
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/versions/{version_id}/tags/{tag}", response_model=Dict[str, Any])
async def remove_tag(
    version_id: UUID,
    tag: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a tag from a version"""
    service = GitOperationsService(db)

    try:
        version = await service.remove_tag(version_id, tag)
        return {
            "success": True,
            "version_id": str(version.id),
            "removed_tag": tag,
            "remaining_tags": version.tags
        }
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/families/{family_id}/tags", response_model=List[Dict[str, Any]])
async def list_tags(
    family_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """List all tags used in a family"""
    service = GitOperationsService(db)
    tags = await service.list_tags(family_id)
    return tags


@router.get("/families/{family_id}/tags/{tag}/versions", response_model=List[Dict[str, Any]])
async def find_versions_by_tag(
    family_id: UUID,
    tag: str,
    db: AsyncSession = Depends(get_db)
):
    """Find all versions with a specific tag"""
    service = GitOperationsService(db)
    versions = await service.find_by_tag(family_id, tag)

    return [
        {
            "version_id": str(v.id),
            "version_number": v.version_number,
            "commit_message": v.commit_message,
            "author": v.author,
            "created_at": v.created_at.isoformat(),
            "tags": v.tags
        }
        for v in versions
    ]


# ===== CHERRY-PICK ENDPOINT =====

@router.post("/families/{family_id}/cherry-pick", response_model=Dict[str, Any])
async def cherry_pick_version(
    family_id: UUID,
    request: CherryPickRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cherry-pick a specific version's changes (like git cherry-pick)"""
    service = GitOperationsService(db)

    try:
        version = await service.cherry_pick(
            family_id=family_id,
            version_to_pick_id=request.version_to_pick_id,
            target_branch=request.target_branch,
            author=current_user.username if current_user else None
        )

        return {
            "success": True,
            "new_version_id": str(version.id),
            "version_number": version.version_number,
            "message": "Cherry-pick completed"
        }
    except ValueError as e:
        raise HTTPException(400, str(e))


# ===== STATISTICS ENDPOINT =====

@router.get("/versions/{version_id}/stats", response_model=Dict[str, Any])
async def get_version_stats(
    version_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed statistics for a version"""
    service = GitOperationsService(db)

    try:
        stats = await service.get_version_stats(version_id)
        return stats
    except ValueError as e:
        raise HTTPException(404, str(e))
