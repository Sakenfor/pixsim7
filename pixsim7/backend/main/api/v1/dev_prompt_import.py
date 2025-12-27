"""
Dev Prompt Import API

Dev-only endpoint for importing arbitrary prompts into PixSim7.
Accepts raw prompt text + metadata and creates PromptFamily + PromptVersion records
using the generic import pipeline (Task 7x).

Purpose:
- Import prompts from any source (manual, file, external)
- Use prompt parser analysis for automatic tagging
- Create PromptFamily and PromptVersion via existing services

Design:
- Dev-only endpoint (no production use)
- Source-agnostic (works for any import source)
- Uses PromptImportSpec + prepare_import_payloads from Task 7x
- No database schema changes
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim7.backend.main.services.prompt.import_service import (
    PromptSource,
    PromptImportSpec,
    prepare_import_payloads,
)
from pixsim7.backend.main.api.v1.prompts.schemas import (
    PromptFamilyResponse,
    PromptVersionResponse,
)
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/prompt-import", tags=["dev"])


class PromptImportRequest(BaseModel):
    """Request model for importing a prompt."""
    family_title: str = Field(..., description="Title for the prompt family")
    prompt_text: str = Field(..., description="The raw prompt text to import")

    # Optional convenience fields
    family_slug: Optional[str] = Field(None, description="Custom slug (auto-generated if not provided)")
    prompt_type: str = Field(default="visual", description="Type: visual, narrative, or hybrid")
    category: Optional[str] = Field(None, description="Category for organization")
    explicit_family_tags: Optional[List[str]] = Field(None, description="Additional family tags")
    explicit_version_tags: Optional[List[str]] = Field(None, description="Additional version tags")

    source: PromptSource = Field(default=PromptSource.MANUAL, description="Source of the prompt")
    source_reference: Optional[str] = Field(None, description="Source reference (e.g. file path, external ID)")

    family_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional family metadata")
    version_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional version metadata")


class PromptImportResponse(BaseModel):
    """Response model for prompt import."""
    family: PromptFamilyResponse
    version: PromptVersionResponse


@router.post("", response_model=PromptImportResponse)
async def import_prompt(
    request: PromptImportRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> PromptImportResponse:
    """
    Import a prompt from any source.

    Creates a new PromptFamily and initial PromptVersion using the generic import pipeline.
    The prompt text is automatically analyzed for components and tags.

    Request body:
    - family_title: Required title for the prompt family
    - prompt_text: Required prompt text to import
    - family_slug: Optional custom slug (auto-generated if not provided)
    - prompt_type: Type of prompt (visual, narrative, or hybrid), defaults to "visual"
    - category: Optional category for organization
    - explicit_family_tags: Optional additional tags for the family
    - explicit_version_tags: Optional additional tags for the version
    - source: Source of the prompt (manual, file_import, external, other)
    - source_reference: Optional reference to the source (e.g. file path)
    - family_metadata: Optional additional metadata for the family
    - version_metadata: Optional additional metadata for the version

    Returns:
        {
            "family": {...},  # PromptFamilyResponse
            "version": {...}  # PromptVersionResponse
        }

    Raises:
        400: If family_title or prompt_text is empty
        500: If import fails
    """
    # Validate required fields
    if not request.family_title or not request.family_title.strip():
        raise HTTPException(
            status_code=400,
            detail="family_title is required and cannot be empty"
        )

    if not request.prompt_text or not request.prompt_text.strip():
        raise HTTPException(
            status_code=400,
            detail="prompt_text is required and cannot be empty"
        )

    try:
        # Construct import spec
        spec = PromptImportSpec(
            family_title=request.family_title,
            prompt_text=request.prompt_text,
            source=request.source,
            family_slug=request.family_slug,
            prompt_type=request.prompt_type,
            category=request.category,
            family_tags=request.explicit_family_tags or [],
            version_tags=request.explicit_version_tags or [],
            family_metadata=request.family_metadata or {},
            version_metadata=request.version_metadata or {},
            source_reference=request.source_reference,
        )

        # Prepare import payloads using Task 7x helpers
        family_req, version_req = await prepare_import_payloads(spec)

        # Create family and version using existing service
        service = PromptVersionService(db)

        # Create family
        family = await service.create_family(
            title=family_req.title,
            prompt_type=family_req.prompt_type,
            slug=family_req.slug,
            description=family_req.description,
            category=family_req.category,
            tags=family_req.tags,
            game_world_id=family_req.game_world_id,
            npc_id=family_req.npc_id,
            scene_id=family_req.scene_id,
            action_concept_id=family_req.action_concept_id,
            created_by=user.email,
        )

        # Create initial version
        version = await service.create_version(
            family_id=family.id,
            prompt_text=version_req.prompt_text,
            commit_message=version_req.commit_message,
            author=version_req.author or user.email,
            parent_version_id=version_req.parent_version_id,
            variables=version_req.variables,
            provider_hints=version_req.provider_hints,
            tags=version_req.tags,
        )

        logger.info(
            f"Imported prompt '{request.family_title}' from {request.source.value}",
            extra={
                "user_id": user.id,
                "family_id": str(family.id),
                "version_id": str(version.id),
                "source": request.source.value,
                "source_reference": request.source_reference,
            }
        )

        # Build response
        return PromptImportResponse(
            family=PromptFamilyResponse(
                id=family.id,
                slug=family.slug,
                title=family.title,
                description=family.description,
                prompt_type=family.prompt_type,
                category=family.category,
                tags=family.tags,
                is_active=family.is_active,
                version_count=1,
            ),
            version=PromptVersionResponse(
                id=version.id,
                family_id=version.family_id,
                version_number=version.version_number,
                prompt_text=version.prompt_text,
                commit_message=version.commit_message,
                author=version.author,
                generation_count=version.generation_count,
                successful_assets=version.successful_assets,
                tags=version.tags,
                created_at=str(version.created_at),
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to import prompt: {e}",
            extra={
                "user_id": user.id,
                "family_title": request.family_title,
                "source": request.source.value,
            },
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to import prompt: {str(e)}"
        )
