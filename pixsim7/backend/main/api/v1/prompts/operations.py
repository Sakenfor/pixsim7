"""
Advanced Prompt Operations

Batch operations, import/export, similarity search, template validation, and provider validation.
"""
from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional, Dict, Any, Union
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    DEFAULT_PROMPT_ANALYZER_ID,
    normalize_analyzer_id_for_target,
    resolve_prompt_default_analyzer_id,
)
from pixsim7.backend.main.services.prompt.parser import analyzer_registry, AnalyzerTarget
from pixsim7.backend.main.services.analysis.analyzer_preset_service import (
    AnalyzerPresetService,
)
from .helpers import build_family_response
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

    return await build_family_response(family, db, version_count=len(versions))


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


class PromptEditOp(BaseModel):
    """Structured prompt edit instruction."""

    intent: str = Field(
        ...,
        description="Edit intent: generate/preserve/modify/add/remove",
    )
    target: str = Field(
        ...,
        description="Target path or semantic handle (e.g. 'vehicle.interior.detail').",
    )
    direction: Optional[str] = Field(
        None,
        description="Optional direction hint (increase/decrease/set/remove/emphasize).",
    )
    value: Optional[Any] = Field(None, description="Optional value payload for set/replace operations.")
    note: Optional[str] = Field(None, description="Optional short free-form rationale.")


class ApplyPromptEditRequest(BaseModel):
    """Apply a chat-style edit to an existing prompt version."""

    prompt_text: str = Field(..., min_length=1, description="Rendered prompt text after applying edits.")
    instruction: Optional[str] = Field(
        None,
        description="Original user instruction (e.g. 'less interior detail, more brass').",
    )
    edit_ops: List[PromptEditOp] = Field(
        default_factory=list,
        description="Normalized structured edit operations.",
    )
    commit_message: Optional[str] = Field(
        None,
        description="Optional explicit changelog message for the new version.",
    )
    author: Optional[str] = Field(None, description="Optional author override.")
    tags: Optional[List[str]] = Field(
        None,
        description="Optional full replacement tags list. If omitted, inherits source tags.",
    )
    variables: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional full replacement variables payload. If omitted, inherits source variables.",
    )
    provider_hints: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional full replacement provider metadata. If omitted, inherits source provider_hints.",
    )
    prompt_analysis: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Optional analysis payload to persist on new version. "
            "If omitted, endpoint stores authoring metadata in a minimal prompt_analysis object."
        ),
    )


class ApplyPromptEditResponse(BaseModel):
    source_version_id: UUID
    created_version: PromptVersionResponse
    applied_edit: Dict[str, Any]


def _default_edit_commit_message(request: ApplyPromptEditRequest) -> str:
    if request.instruction:
        return f"Apply edit: {request.instruction}"
    if request.edit_ops:
        intents = [op.intent for op in request.edit_ops if op.intent]
        if intents:
            return "Apply edit ops: " + ", ".join(intents[:3])
    return "Apply prompt edit"


def _build_authoring_prompt_analysis(
    *,
    base_prompt_analysis: Optional[Dict[str, Any]],
    source_version_id: UUID,
    instruction: Optional[str],
    edit_ops: List[PromptEditOp],
    commit_message: str,
) -> Dict[str, Any]:
    base = dict(base_prompt_analysis or {})
    authoring_section = dict(base.get("authoring") or {})
    history = list(authoring_section.get("history") or [])
    history.append(
        {
            "source_version_id": str(source_version_id),
            "instruction": instruction,
            "edit_ops": [op.model_dump(exclude_none=True) for op in edit_ops],
            "commit_message": commit_message,
            "applied_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    authoring_section["history"] = history
    base["authoring"] = authoring_section
    return base


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


@router.post("/versions/{version_id}/apply-edit", response_model=ApplyPromptEditResponse)
async def apply_prompt_edit(
    version_id: UUID,
    request: ApplyPromptEditRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Create a new child prompt version from an existing version using structured edit intent.

    Canonical usage for chat-driven tweak loops:
    - keep prose prompt in `prompt_text`
    - keep machine-editable intent trail in `prompt_analysis.authoring.history`
    - link via `parent_version_id`
    """
    service = PromptVersionService(db)
    source_version = await service.get_version(version_id)
    if not source_version:
        raise HTTPException(status_code=404, detail="Source version not found")
    if source_version.family_id is None:
        raise HTTPException(
            status_code=422,
            detail="Cannot apply edit to version without family_id",
        )

    commit_message = request.commit_message or _default_edit_commit_message(request)
    tags = request.tags if request.tags is not None else list(source_version.tags or [])
    variables = (
        request.variables if request.variables is not None else dict(source_version.variables or {})
    )
    provider_hints = (
        request.provider_hints
        if request.provider_hints is not None
        else dict(source_version.provider_hints or {})
    )
    if isinstance(provider_hints, dict):
        provider_hints.pop("prompt_analysis", None)

    prompt_analysis_payload = _build_authoring_prompt_analysis(
        base_prompt_analysis=request.prompt_analysis,
        source_version_id=source_version.id,
        instruction=request.instruction,
        edit_ops=request.edit_ops,
        commit_message=commit_message,
    )

    created = await service.create_version(
        family_id=source_version.family_id,
        prompt_text=request.prompt_text,
        commit_message=commit_message,
        author=request.author or user.email,
        parent_version_id=source_version.id,
        variables=variables,
        provider_hints=provider_hints,
        prompt_analysis=prompt_analysis_payload,
        tags=tags,
    )

    return ApplyPromptEditResponse(
        source_version_id=source_version.id,
        created_version=PromptVersionResponse(
            id=created.id,
            family_id=created.family_id,
            version_number=created.version_number,
            prompt_text=created.prompt_text,
            commit_message=created.commit_message,
            author=created.author,
            generation_count=created.generation_count,
            successful_assets=created.successful_assets,
            tags=created.tags,
            created_at=str(created.created_at),
        ),
        applied_edit={
            "instruction": request.instruction,
            "edit_ops": [op.model_dump(exclude_none=True) for op in request.edit_ops],
            "commit_message": commit_message,
        },
    )


# ===== Prompt Analysis (Preview) =====


class AnalyzePromptRequest(BaseModel):
    """Request for prompt analysis preview."""
    text: str = Field(..., min_length=1, max_length=10000, description="Prompt text to analyze")
    analyzer_id: Optional[str] = Field(
        None,
        description=(
            "Analyzer ID. If omitted, resolves from user analyzer preferences "
            "(fallback: prompt:simple)."
        ),
    )
    preset_id: Optional[str] = Field(
        None,
        description="Optional analyzer preset ID (tags_only, blocks_tags, etc.)",
    )
    analyzer_instance_id: Optional[int] = Field(
        None,
        description="Analyzer instance ID for provider/model overrides",
    )
    pack_ids: Optional[List[str]] = Field(
        None,
        description="Semantic pack IDs to extend role registry and parser hints",
    )


class PromptTokenHeaderLine(BaseModel):
    kind: Literal["header"] = "header"
    pattern: str = Field(..., description="PatternId: colon | assignment | assignment_arrow | angle_bracket | freestanding")
    label: str
    start: int
    end: int
    body_start: int


class PromptTokenRelationLine(BaseModel):
    kind: Literal["relation"] = "relation"
    lhs: Optional[str] = None
    rhs: Optional[str] = None
    raw: str = Field(..., description="Full operator string, e.g. '>>>>>>>'")
    leading_char: Optional[str] = None
    terminal_char: Optional[str] = None
    run: int = Field(..., description="Total operator length in characters")
    start: int
    end: int


class PromptTokenProseLine(BaseModel):
    kind: Literal["prose"] = "prose"
    text: str
    start: int
    end: int


PromptTokenLine = Annotated[
    Union[PromptTokenHeaderLine, PromptTokenRelationLine, PromptTokenProseLine],
    Field(discriminator="kind"),
]


class PromptTokensPayload(BaseModel):
    lines: List[PromptTokenLine]


class AnalyzePromptSequenceContext(BaseModel):
    role_in_sequence: str = Field(
        ...,
        description="Normalized role (`initial`, `continuation`, `transition`, or `unspecified`).",
    )
    source: str = Field(
        ...,
        description="Where the role was inferred from (for example candidates primitive match or tags).",
    )
    confidence: Optional[float] = Field(
        None,
        description="Optional confidence score for role inference (when available).",
    )
    matched_block_id: Optional[str] = Field(
        None,
        description="Primitive block ID that supplied role evidence when available.",
    )


class AnalyzePromptResponse(BaseModel):
    """Response from prompt analysis."""
    analysis: Dict[str, Any] = Field(..., description="Analysis result with blocks, tags, ontology_ids")
    analyzer_id: str = Field(..., description="Analyzer used")
    role_in_sequence: str = Field(
        ...,
        description=(
            "Inferred sequence role for this prompt (`initial`, `continuation`, "
            "`transition`, or `unspecified`)."
        ),
    )
    sequence_context: AnalyzePromptSequenceContext = Field(
        ...,
        description=(
            "Detailed sequence-role envelope (role/source/confidence/evidence) "
            "derived from prompt analysis."
        ),
    )
    tokens: Optional[PromptTokensPayload] = Field(
        None,
        description="Line-level DSL token parse tree (header / relation / prose nodes).",
    )


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
    - candidates: Parsed semantic candidates with roles and categories
    - tags: Derived tags (role tags + ontology IDs + metadata-derived sub-tags like tone/camera)
    - ontology_ids: Matched ontology keywords
    - role_in_sequence + sequence_context: explicit sequence-role inference envelope
    """
    from pixsim7.backend.main.services.prompt.analysis import PromptAnalysisService

    service = PromptAnalysisService(db)

    requested_analyzer_id = request.analyzer_id
    analyzer_id = normalize_analyzer_id_for_target(
        requested_analyzer_id,
        AnalyzerTarget.PROMPT,
        require_enabled=False,
    )
    if not analyzer_id:
        if requested_analyzer_id:
            analyzer_id = DEFAULT_PROMPT_ANALYZER_ID
        else:
            analyzer_id = resolve_prompt_default_analyzer_id(getattr(user, "preferences", None))
    provider_id = None
    model_id = None
    instance_config = None
    preset_id = request.preset_id

    if request.analyzer_instance_id is not None:
        from pixsim7.backend.main.services.analysis.analyzer_instance_service import (
            AnalyzerInstanceService,
        )
        instance_service = AnalyzerInstanceService(db)
        instance = await instance_service.get_instance_for_user(
            instance_id=request.analyzer_instance_id,
            owner_user_id=user.id,
        )
        if not instance:
            raise HTTPException(status_code=404, detail="Analyzer instance not found")

        instance_analyzer_id = normalize_analyzer_id_for_target(
            instance.analyzer_id,
            AnalyzerTarget.PROMPT,
            require_enabled=False,
        )
        if instance_analyzer_id:
            analyzer_id = instance_analyzer_id
        elif instance.analyzer_id:
            analyzer_id = DEFAULT_PROMPT_ANALYZER_ID
        provider_id = instance.provider_id
        model_id = instance.model_id
        instance_config = instance.config
        if not preset_id and isinstance(instance_config, dict):
            preset_id = instance_config.get("preset_id")

        if preset_id:
            analyzer_info = analyzer_registry.get(analyzer_id)
            presets = (analyzer_info.config or {}).get("presets") if analyzer_info else None
            has_preset = isinstance(presets, dict) and preset_id in presets
            if not has_preset:
                preset_service = AnalyzerPresetService(db)
                preset = await preset_service.get_user_preset(
                    owner_user_id=user.id,
                    analyzer_id=analyzer_id,
                    preset_id=preset_id,
                )
                if preset:
                    instance_config = _merge_instance_config(instance_config, preset.config)
                    if isinstance(instance_config, dict):
                        instance_config.pop("preset_id", None)
                    preset_id = None

    if preset_id:
        analyzer_info = analyzer_registry.get(analyzer_id)
        presets = (analyzer_info.config or {}).get("presets") if analyzer_info else None
        has_preset = isinstance(presets, dict) and preset_id in presets
        if not has_preset:
            preset_service = AnalyzerPresetService(db)
            preset = await preset_service.get_user_preset(
                owner_user_id=user.id,
                analyzer_id=analyzer_id,
                preset_id=preset_id,
            )
            if preset:
                instance_config = _merge_instance_config(instance_config, preset.config)
                if isinstance(instance_config, dict):
                    instance_config.pop("preset_id", None)
                preset_id = None
    analysis = await service.analyze(
        request.text,
        analyzer_id,
        preset_id=preset_id,
        provider_id=provider_id,
        model_id=model_id,
        instance_config=instance_config,
        pack_ids=request.pack_ids,
        user_id=user.id,
    )
    sequence_context = _coerce_sequence_context_payload(analysis.get("sequence_context"))
    analysis["sequence_context"] = sequence_context

    raw_tokens = analysis.get("tokens")
    tokens_payload = PromptTokensPayload(**raw_tokens) if isinstance(raw_tokens, dict) else None

    return AnalyzePromptResponse(
        analysis=analysis,
        analyzer_id=analysis.get("analyzer_id", analyzer_id),
        role_in_sequence=sequence_context["role_in_sequence"],
        sequence_context=sequence_context,
        tokens=tokens_payload,
    )


def _merge_instance_config(
    base_config: Optional[Dict[str, Any]],
    override_config: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    if isinstance(base_config, dict):
        merged.update(base_config)
    if isinstance(override_config, dict):
        merged.update(override_config)
    return merged


_SEQUENCE_ROLES = {"initial", "continuation", "transition"}


def _coerce_sequence_context_payload(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {
            "role_in_sequence": "unspecified",
            "source": "none",
            "confidence": None,
            "matched_block_id": None,
        }
    role = raw.get("role_in_sequence")
    if isinstance(role, str):
        normalized_role = role.strip().lower()
    else:
        normalized_role = ""
    if normalized_role not in _SEQUENCE_ROLES:
        normalized_role = "unspecified"

    source = raw.get("source")
    if not isinstance(source, str) or not source.strip():
        source = "analysis.sequence_context" if normalized_role != "unspecified" else "none"
    else:
        source = source.strip()

    confidence = raw.get("confidence")
    if confidence is not None:
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = None

    matched_block_id = raw.get("matched_block_id")
    if not isinstance(matched_block_id, str) or not matched_block_id.strip():
        matched_block_id = None
    else:
        matched_block_id = matched_block_id.strip()

    return {
        "role_in_sequence": normalized_role,
        "source": source,
        "confidence": confidence,
        "matched_block_id": matched_block_id,
    }
