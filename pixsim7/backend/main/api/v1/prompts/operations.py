"""
Advanced Prompt Operations

Batch operations, import/export, similarity search, template validation, and provider validation.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt import PromptVersionService
from .schemas import (
    BatchVersionRequest,
    CreatePromptVersionRequest,
    PromptFamilyResponse,
    PromptVersionResponse,
)

router = APIRouter()

@router.post("/families/{family_id}/versions/batch", response_model=List[PromptVersionResponse])
async def batch_create_versions(
    family_id: UUID,
    versions: List[BatchVersionRequest],
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Create multiple versions at once

    Useful for bulk imports, testing multiple variants, or batch migrations.
    """
    service = PromptVersionService(db)

    # Verify family exists
    family = await service.get_family(family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    # Convert to dicts
    versions_data = [v.dict() for v in versions]

    # Create versions
    created = await service.batch_create_versions(
        family_id=family_id,
        versions=versions_data,
        author=user.email
    )

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
        for v in created
    ]


# ===== Import/Export (Phase 3) =====


@router.get("/families/{family_id}/export")
async def export_family(
    family_id: UUID,
    include_versions: bool = True,
    include_analytics: bool = False,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Export a family and its versions to portable JSON format

    Query params:
        - include_versions: Include all versions (default: true)
        - include_analytics: Include analytics data (default: false)

    Returns JSON that can be imported into another system.
    """
    service = PromptVersionService(db)

    try:
        export_data = await service.export_family(
            family_id=family_id,
            include_versions=include_versions,
            include_analytics=include_analytics
        )
        return export_data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class ImportFamilyRequest(BaseModel):
    import_data: dict | str = Field(..., description="Exported family data or raw prompt text")
    preserve_metadata: bool = Field(True, description="Keep original authors/timestamps")


@router.post("/families/import", response_model=PromptFamilyResponse)
async def import_family(
    request: ImportFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Import a family from exported data or external prompt

    Handles both:
    - Structured exports from this system
    - Plain text prompts from external sources

    Slug conflicts are auto-resolved.
    """
    service = PromptVersionService(db)

    family = await service.import_family(
        import_data=request.import_data,
        author=user.email,
        preserve_metadata=request.preserve_metadata
    )

    # Get version count
    versions = await service.list_versions(family.id, limit=1000)

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


# ===== Historical Inference (Phase 3) =====


class InferVersionsRequest(BaseModel):
    asset_ids: List[int] = Field(..., description="Asset IDs to infer prompts from")


@router.post("/families/{family_id}/infer-from-assets", response_model=List[PromptVersionResponse])
async def infer_versions_from_assets(
    family_id: UUID,
    request: InferVersionsRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Backfill prompt versions for existing assets

    Extracts prompts from generation artifacts and creates versions.
    Useful for migrating existing data into the versioning system.
    """
    service = PromptVersionService(db)

    # Verify family exists
    family = await service.get_family(family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    created = await service.infer_versions_from_assets(
        family_id=family_id,
        asset_ids=request.asset_ids,
        author=user.email
    )

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
        for v in created
    ]


# ===== Similarity Search (Phase 3) =====


@router.get("/search/similar")
async def find_similar_prompts(
    prompt: str,
    limit: int = 10,
    threshold: float = 0.5,
    family_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Find similar prompts using text similarity

    Query params:
        - prompt: Query prompt text
        - limit: Number of results (default: 10, max: 50)
        - threshold: Minimum similarity score 0-1 (default: 0.5)
        - family_id: Optional family filter

    Returns versions ranked by similarity score.
    """
    if limit > 50:
        limit = 50
    if threshold < 0 or threshold > 1:
        raise HTTPException(
            status_code=400,
            detail="Threshold must be between 0 and 1"
        )

    service = PromptVersionService(db)
    similar = await service.find_similar_prompts(
        prompt_text=prompt,
        limit=limit,
        threshold=threshold,
        family_id=family_id
    )

    return {
        "query": prompt,
        "limit": limit,
        "threshold": threshold,
        "family_id": str(family_id) if family_id else None,
        "results": similar,
        "result_count": len(similar)
    }


# ===== Template Validation (Phase 3) =====


class ValidateTemplateRequest(BaseModel):
    prompt_text: str
    variable_defs: Optional[dict] = None


@router.post("/templates/validate")
async def validate_template(
    request: ValidateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Validate a prompt template

    Checks for:
    - Variable syntax
    - Required variables
    - Undefined variables
    - Common issues

    Variable definitions format:
    {
        "character": {"type": "string", "required": true},
        "lighting": {"type": "enum", "enum_values": ["golden", "dramatic"], "default": "golden"}
    }
    """
    service = PromptVersionService(db)
    result = service.validate_template_prompt(
        prompt_text=request.prompt_text,
        variable_defs=request.variable_defs
    )
    return result


class RenderTemplateRequest(BaseModel):
    prompt_text: str
    variables: dict
    variable_defs: Optional[dict] = None
    strict: bool = True


@router.post("/templates/render")
async def render_template(
    request: RenderTemplateRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Render a template prompt with variable substitution

    Substitutes {{variables}} with provided values.
    Validates types and required variables if definitions provided.
    """
    service = PromptVersionService(db)

    try:
        rendered = service.render_template_prompt(
            prompt_text=request.prompt_text,
            variables=request.variables,
            variable_defs=request.variable_defs,
            strict=request.strict
        )
        return {
            "original": request.prompt_text,
            "rendered": rendered,
            "variables_used": request.variables
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== Provider Validation Endpoints (Phase 4 - Modernization) =====

class ValidatePromptRequest(BaseModel):
    prompt_text: str = Field(..., description="Prompt text to validate")
    provider_id: str = Field(..., description="Target provider ID")
    operation_type: Optional[str] = Field(None, description="Operation type for validation")


class ValidateVersionRequest(BaseModel):
    version_id: UUID = Field(..., description="Prompt version to validate")
    provider_id: str = Field(..., description="Target provider ID")
    variables: dict = Field(default_factory=dict, description="Variables to render prompt")


@router.post("/validate")
async def validate_prompt(
    request: ValidatePromptRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Validate a prompt against provider capabilities

    BREAKING CHANGE: This endpoint will become mandatory for prompt creation in Phase 2.

    Validates:
    - Character limit for provider
    - Operation type support
    - Provider-specific constraints

    Returns validation result with errors/warnings.
    """
    service = PromptVersionService(db)

    result = await service.validate_prompt_for_provider(
        prompt_text=request.prompt_text,
        provider_id=request.provider_id,
        operation_type=request.operation_type
    )

    if not result["valid"]:
        # Return 422 Unprocessable Entity for validation errors
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Prompt validation failed",
                "validation": result
            }
        )

    return result


@router.post("/versions/{version_id}/validate")
async def validate_version(
    version_id: UUID,
    request: ValidateVersionRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Validate a prompt version against provider capabilities

    Renders the prompt with provided variables then validates against provider.

    Returns validation result with rendered prompt included.
    """
    service = PromptVersionService(db)

    result = await service.validate_version_for_provider(
        version_id=request.version_id,
        provider_id=request.provider_id,
        variables=request.variables
    )

    # Update provider compatibility cache
    if result["valid"]:
        await service.update_provider_compatibility(
            version_id=request.version_id,
            provider_id=request.provider_id,
            validation_result=result
        )

    if not result["valid"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Version validation failed",
                "validation": result
            }
        )

    return result


# ===== Prompt Analysis (Preview) =====


class AnalyzePromptRequest(BaseModel):
    """Request for prompt analysis preview."""
    text: str = Field(..., min_length=1, max_length=10000, description="Prompt text to analyze")
    analyzer_id: Optional[str] = Field(None, description="Analyzer ID (default: prompt:simple)")
    pack_ids: Optional[List[str]] = Field(
        None,
        description="Semantic pack IDs to extend role registry and parser hints",
    )


class AnalyzePromptResponse(BaseModel):
    """Response from prompt analysis."""
    analysis: Dict[str, Any] = Field(..., description="Analysis result with blocks, tags, ontology_ids")
    analyzer_id: str = Field(..., description="Analyzer used")


@router.post("/analyze", response_model=AnalyzePromptResponse)
async def analyze_prompt(
    request: AnalyzePromptRequest,
    user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze a prompt without storage (preview only).

    Use this for:
    - Quick Generate preview
    - Prompt Lab highlighting
    - Dev tools inspection

    Does NOT create a PromptVersion - use generation/import flows for persistence.

    Returns analysis with:
    - blocks: Parsed semantic blocks with roles and categories
    - tags: Derived tags (has:character, tone:soft, etc.)
    - ontology_ids: Matched ontology keywords
    """
    from pixsim7.backend.main.services.prompt.analysis import PromptAnalysisService

    service = PromptAnalysisService(db)

    analyzer_id = request.analyzer_id or "prompt:simple"
    analysis = await service.analyze(
        request.text,
        analyzer_id,
        pack_ids=request.pack_ids,
    )

    return AnalyzePromptResponse(
        analysis=analysis,
        analyzer_id=analysis.get("analyzer_id", analyzer_id),
    )
