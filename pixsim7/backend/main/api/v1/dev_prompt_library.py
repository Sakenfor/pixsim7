"""
Dev Prompt Library API

Dev-only endpoint for browsing and analyzing prompt families and versions.
Provides detailed info including provider_hints and prompt_analysis for inspection.

Purpose:
- List prompt families with filters
- Browse versions per family
- Inspect version details with analysis
- Support the Prompt Lab dev UI

Design:
- Dev-only endpoint (no production use)
- Read-only operations (no mutations)
- Exposes prompt_analysis from provider_hints
- Can analyze prompts on-the-fly if needed
"""
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from uuid import UUID

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim7.backend.main.services.prompt.parser import analyze_prompt
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/prompt-library", tags=["dev"])


# ===== Dev-only Models =====

class DevPromptFamilySummary(BaseModel):
    id: UUID
    slug: str
    title: str
    prompt_type: str
    category: Optional[str]
    tags: List[str]
    is_active: bool
    version_count: int


class DevPromptVersionSummary(BaseModel):
    id: UUID
    family_id: UUID
    version_number: int
    author: Optional[str]
    tags: List[str]
    created_at: str


class DevPromptVersionDetail(BaseModel):
    version: DevPromptVersionSummary
    prompt_text: str
    provider_hints: Dict[str, Any]
    prompt_analysis: Optional[Dict[str, Any]]


# ===== Endpoints =====

@router.get("/families", response_model=List[DevPromptFamilySummary])
async def list_prompt_families(
    prompt_type: Optional[str] = None,
    category: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> List[DevPromptFamilySummary]:
    """
    List prompt families with optional filters.

    Query params:
    - prompt_type: Filter by type (visual, narrative, hybrid)
    - category: Filter by category
    - tag: Filter families that include this tag
    - limit: Max results (default 50)
    - offset: Skip results (default 0)

    Returns:
        List of family summaries with version counts
    """
    try:
        service = PromptVersionService(db)

        # Get families using the service
        families = await service.list_families(
            prompt_type=prompt_type,
            category=category,
            is_active=None,  # Include all, active or not
            limit=limit,
            offset=offset,
        )

        # Build response with version counts
        result = []
        for family in families:
            # Filter by tag if specified
            if tag and tag not in family.tags:
                continue

            # Count versions for this family
            versions = await service.list_versions(family_id=family.id, limit=1000)
            version_count = len(versions)

            result.append(
                DevPromptFamilySummary(
                    id=family.id,
                    slug=family.slug,
                    title=family.title,
                    prompt_type=family.prompt_type,
                    category=family.category,
                    tags=family.tags,
                    is_active=family.is_active,
                    version_count=version_count,
                )
            )

        logger.info(
            f"Listed {len(result)} prompt families",
            extra={
                "user_id": user.id,
                "prompt_type": prompt_type,
                "category": category,
                "tag": tag,
            }
        )

        return result

    except Exception as e:
        logger.error(
            f"Failed to list prompt families: {e}",
            extra={"user_id": user.id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list prompt families: {str(e)}"
        )


@router.get("/families/{family_id}/versions", response_model=List[DevPromptVersionSummary])
async def list_family_versions(
    family_id: UUID,
    limit: int = 50,
    offset: int = 0,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> List[DevPromptVersionSummary]:
    """
    List all versions for a specific family.

    Path params:
    - family_id: UUID of the family

    Query params:
    - limit: Max results (default 50)
    - offset: Skip results (default 0)

    Returns:
        List of version summaries for the family
    """
    try:
        service = PromptVersionService(db)

        # Verify family exists
        family = await service.get_family(family_id)
        if not family:
            raise HTTPException(
                status_code=404,
                detail=f"Family {family_id} not found"
            )

        # Get versions
        versions = await service.list_versions(
            family_id=family_id,
            limit=limit,
            offset=offset,
        )

        # Build response
        result = [
            DevPromptVersionSummary(
                id=version.id,
                family_id=version.family_id,
                version_number=version.version_number,
                author=version.author,
                tags=version.tags,
                created_at=str(version.created_at),
            )
            for version in versions
        ]

        logger.info(
            f"Listed {len(result)} versions for family {family_id}",
            extra={
                "user_id": user.id,
                "family_id": str(family_id),
            }
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to list family versions: {e}",
            extra={
                "user_id": user.id,
                "family_id": str(family_id),
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list family versions: {str(e)}"
        )


@router.get("/versions/{version_id}", response_model=DevPromptVersionDetail)
async def get_version_detail(
    version_id: UUID,
    db: DatabaseSession = None,
    user: CurrentUser = None,
) -> DevPromptVersionDetail:
    """
    Get detailed info for a specific version.

    Includes:
    - Version metadata
    - Prompt text
    - Provider hints
    - Prompt analysis (from provider_hints or computed on-the-fly)

    Path params:
    - version_id: UUID of the version

    Returns:
        Detailed version info with analysis
    """
    try:
        service = PromptVersionService(db)

        # Get version
        version = await service.get_version(version_id)
        if not version:
            raise HTTPException(
                status_code=404,
                detail=f"Version {version_id} not found"
            )

        # Extract provider_hints and prompt_analysis
        provider_hints = version.provider_hints or {}
        prompt_analysis = provider_hints.get("prompt_analysis")

        # If no prompt_analysis is present, analyze on the fly
        if not prompt_analysis:
            try:
                # analyze_prompt already returns a plain dict in PixSim7 shape
                analysis_result = await analyze_prompt(version.prompt_text)
                prompt_analysis = analysis_result
            except Exception as e:
                logger.warning(
                    f"Failed to analyze prompt on-the-fly: {e}",
                    extra={"version_id": str(version_id)},
                )
                # Continue without analysis rather than failing
                prompt_analysis = None

        # Build response
        result = DevPromptVersionDetail(
            version=DevPromptVersionSummary(
                id=version.id,
                family_id=version.family_id,
                version_number=version.version_number,
                author=version.author,
                tags=version.tags,
                created_at=str(version.created_at),
            ),
            prompt_text=version.prompt_text,
            provider_hints=provider_hints,
            prompt_analysis=prompt_analysis,
        )

        logger.info(
            f"Retrieved version detail for {version_id}",
            extra={
                "user_id": user.id,
                "version_id": str(version_id),
            }
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to get version detail: {e}",
            extra={
                "user_id": user.id,
                "version_id": str(version_id),
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get version detail: {str(e)}"
        )
