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

from sqlalchemy import select

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.domain.prompt import PromptFamily
from pixsim7.backend.main.services.prompt import PromptVersionService
from pixsim7.backend.main.services.prompt.family_candidates import (
    DEFAULT_COSINE_FLOOR,
    DEFAULT_K,
    DEFAULT_LARGE_CLUSTER_SIZE,
    DEFAULT_LEXICAL_FLOOR,
    DEFAULT_MAX_CLUSTERS,
    DEFAULT_MIN_SIZE,
    PromptFamilyCandidateService,
    _LEXICAL_METHODS,
)
from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    DEFAULT_PROMPT_ANALYZER_ID,
    normalize_analyzer_id_for_target,
    resolve_prompt_default_analyzer_id,
)
from pixsim7.backend.main.services.prompt.parser import AnalyzerTarget
from pixsim7.backend.main.services.prompt.parser.tokenizer import tokenize as _tokenize_prompt
from pixsim7.backend.main.services.prompt.variable_registry import (
    normalize_prompt_variable_name,
    read_prompt_variables,
)
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.infrastructure.plugins.capabilities.locator import (
    get_analyzer_registry,
)
from pixsim7.backend.main.infrastructure.plugins.capabilities.protocols import (
    AnalyzerRegistryProtocol,
)
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
    mode: str = "text",
    rank: str = "similarity",
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Find similar prompts.

    Query params:
        - prompt: Query prompt text
        - limit: Number of results (default: 10, max: 50)
        - threshold: Minimum similarity score 0-1 (default: 0.5)
        - family_id: Optional family filter
        - mode: "text" (lexical, default) or "vector" (pgvector semantic
          search over PromptVersion embeddings)
        - rank: "similarity" (default) or "hybrid" — vector mode only; blends
          semantic similarity with a successful_assets boost so proven prompts
          rank higher among comparably-similar matches.

    Returns versions ranked by similarity score.
    """
    if limit > 50:
        limit = 50
    if threshold < 0 or threshold > 1:
        raise HTTPException(
            status_code=400,
            detail="Threshold must be between 0 and 1"
        )
    if mode not in ("text", "vector"):
        raise HTTPException(
            status_code=400,
            detail="mode must be 'text' or 'vector'"
        )
    if rank not in ("similarity", "hybrid"):
        raise HTTPException(
            status_code=400,
            detail="rank must be 'similarity' or 'hybrid'"
        )

    service = PromptVersionService(db)
    similar = await service.find_similar_prompts(
        prompt_text=prompt,
        limit=limit,
        threshold=threshold,
        family_id=family_id,
        mode=mode,
        rank=rank,
    )

    return {
        "query": prompt,
        "limit": limit,
        "threshold": threshold,
        "family_id": str(family_id) if family_id else None,
        "mode": mode,
        "rank": rank,
        "results": similar,
        "result_count": len(similar)
    }


# ===== Family Candidates (clustering) =====

_MEMBER_PREVIEW_CHARS = 280


@router.get("/family-candidates")
async def find_family_candidates(
    cosine_floor: float = DEFAULT_COSINE_FLOOR,
    lexical_floor: float = DEFAULT_LEXICAL_FLOOR,
    lexical_method: str = "jaccard",
    k: int = DEFAULT_K,
    seed_limit: int = 0,
    include_grouped: bool = False,
    min_size: int = DEFAULT_MIN_SIZE,
    max_clusters: int = DEFAULT_MAX_CLUSTERS,
    large_cluster_size: int = DEFAULT_LARGE_CLUSTER_SIZE,
    member_limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Candidate prompt families — clusters of near-duplicate / minor-tweak versions.

    Two-signal clustering (embedding k-NN + lexical confirm) ranked by groupable
    success. Review-only; confirming a cluster into a real family is a separate
    write endpoint. See plan prompt-family-candidates.

    Query params:
        - cosine_floor: min embedding cosine similarity for a candidate edge (0-1)
        - lexical_floor: min lexical similarity to confirm a "tweak" edge (0-1)
        - lexical_method: 'jaccard' (default, fast) | 'combined' | 'sequence' | 'ngram'
        - k: neighbors fetched per seed from the index
        - seed_limit: only seed from N newest ungrouped versions (0 = all)
        - include_grouped: also seed from versions that already have a family
        - min_size: minimum cluster size to report
        - max_clusters: cap on returned clusters (ranked by success)
        - large_cluster_size: size at/above which a cluster is labeled template_cluster
        - member_limit: max member previews returned per cluster (rep always first)

    NOTE: computed on demand. A full-library run (seed_limit=0) can take a while;
    the planned precompute cache is the escape hatch if it gets too slow.
    """
    if not 0.0 <= cosine_floor <= 1.0:
        raise HTTPException(status_code=400, detail="cosine_floor must be between 0 and 1")
    if not 0.0 <= lexical_floor <= 1.0:
        raise HTTPException(status_code=400, detail="lexical_floor must be between 0 and 1")
    if lexical_method not in _LEXICAL_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"lexical_method must be one of {list(_LEXICAL_METHODS)}",
        )

    k = max(1, min(k, 50))
    max_clusters = max(1, min(max_clusters, 200))
    min_size = max(2, min_size)
    member_limit = max(1, min(member_limit, 200))
    seed = seed_limit if seed_limit and seed_limit > 0 else None

    service = PromptFamilyCandidateService(db)
    candidates = await service.find_candidates(
        cosine_floor=cosine_floor,
        lexical_floor=lexical_floor,
        lexical_method=lexical_method,
        k=k,
        seed_limit=seed,
        include_grouped=include_grouped,
        min_size=min_size,
        max_clusters=max_clusters,
        large_cluster_size=large_cluster_size,
    )

    # Resolve titles for any existing families surfaced in the clusters.
    fam_ids = {fid for c in candidates for fid, _ in c.existing_families}
    titles: dict = {}
    if fam_ids:
        rows = (
            await db.execute(
                select(PromptFamily.id, PromptFamily.title).where(
                    PromptFamily.id.in_(fam_ids)
                )
            )
        ).all()
        titles = {r.id: r.title for r in rows}

    def _shape_member(m, *, is_rep: bool) -> dict:
        preview = " ".join((m.prompt_text or "").split())
        return {
            "version_id": str(m.version_id),
            "prompt_preview": preview[:_MEMBER_PREVIEW_CHARS],
            "successful_assets": m.successful_assets,
            "generation_count": m.generation_count,
            "family_id": str(m.family_id) if m.family_id else None,
            "is_representative": is_rep,
        }

    out = []
    for c in candidates:
        rep_id = c.representative.version_id
        shown = c.members[:member_limit]
        out.append(
            {
                "label": c.label,
                "size": c.size,
                "total_successful_assets": c.total_successful_assets,
                "total_generation_count": c.total_generation_count,
                "suggested_title": c.suggested_title,
                "representative_version_id": str(rep_id),
                "existing_families": [
                    {"family_id": str(fid), "title": titles.get(fid), "count": cnt}
                    for fid, cnt in c.existing_families
                ],
                "members": [
                    _shape_member(m, is_rep=(m.version_id == rep_id)) for m in shown
                ],
                "members_truncated": c.size > len(shown),
            }
        )

    return {
        "params": {
            "cosine_floor": cosine_floor,
            "lexical_floor": lexical_floor,
            "lexical_method": lexical_method,
            "k": k,
            "seed_limit": seed,
            "include_grouped": include_grouped,
            "min_size": min_size,
            "max_clusters": max_clusters,
            "large_cluster_size": large_cluster_size,
        },
        "count": len(out),
        "candidates": out,
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
    pattern: str = Field(..., description="PatternId: colon | angle_bracket | freestanding")
    label: str
    start: int
    end: int
    body_start: int
    op_start: Optional[int] = Field(None, description="Char range start of the colon header operator; None for angle_bracket / freestanding")
    op_end: Optional[int] = None


class PromptTokenChainElement(BaseModel):
    kind: Literal["var", "prose", "value"] = Field(
        ...,
        description=(
            "`var` if exactly one UPPER_IDENT after WS-trim; `value` for a bare "
            "`( ... )` value-literal operand; else `prose`"
        ),
    )
    text: str = Field(..., description="Element text after WS-trim; empty string when this slot is empty")
    start: int
    end: int


class PromptTokenChainOperator(BaseModel):
    op: str = Field(..., description="Raw operator text, e.g. '===>', '<', '=', ':'")
    run: int = Field(..., description="Total operator length in characters (== op_end - op_start)")
    op_start: int = Field(..., description="Char range start of this operator run in the document")
    op_end: int


class PromptTokenChainLine(BaseModel):
    kind: Literal["chain"] = "chain"
    elements: List[PromptTokenChainElement] = Field(
        ...,
        description=(
            "Elements between operators. Invariant: len(elements) == "
            "len(operators) + 1. Either end may be empty (start == end) "
            "for bare leading/trailing operator runs."
        ),
    )
    operators: List[PromptTokenChainOperator] = Field(
        ...,
        description="One or more operator runs that separate elements (left-to-right order).",
    )
    start: int
    end: int


class PromptTokenProseLine(BaseModel):
    kind: Literal["prose"] = "prose"
    text: str
    start: int
    end: int


PromptTokenLine = Annotated[
    Union[PromptTokenHeaderLine, PromptTokenChainLine, PromptTokenProseLine],
    Field(discriminator="kind"),
]


class PromptTokensPayload(BaseModel):
    lines: List[PromptTokenLine]


class PromptVariableHintsPayload(BaseModel):
    saved: List[str] = Field(
        default_factory=list,
        description="User-saved uppercase prompt variable names.",
    )
    detected: List[str] = Field(
        default_factory=list,
        description="Uppercase variable names detected in this prompt chain parse.",
    )
    unsaved_detected: List[str] = Field(
        default_factory=list,
        description="Detected names that are not yet saved in the user registry.",
    )


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
        description="Line-level DSL token parse tree (header / chain / prose nodes).",
    )
    variable_hints: PromptVariableHintsPayload = Field(
        default_factory=PromptVariableHintsPayload,
        description="Saved variable registry and detected-variable hints for prompt authoring UI.",
    )


@router.post("/analyze", response_model=AnalyzePromptResponse)
async def analyze_prompt(
    request: AnalyzePromptRequest,
    user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    analyzers: AnalyzerRegistryProtocol = Depends(get_analyzer_registry),
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
            analyzer_info = analyzers.get(analyzer_id)
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
        analyzer_info = analyzers.get(analyzer_id)
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
    # Fallback: not every analyzer (e.g. LLM analyzer) emits structural tokens.
    # Always run the deterministic tokenizer so the side panel + editor get
    # consistent header/relation/prose classification regardless of analyzer.
    if not isinstance(raw_tokens, dict):
        try:
            raw_tokens = _tokenize_prompt(request.text)
        except Exception:
            raw_tokens = None
    tokens_payload = PromptTokensPayload(**raw_tokens) if isinstance(raw_tokens, dict) else None
    saved_variable_names = await _resolve_saved_prompt_variables_for_principal(user, db)
    variable_hints = _build_prompt_variable_hints(
        saved_variable_names=saved_variable_names,
        tokens=tokens_payload,
    )

    return AnalyzePromptResponse(
        analysis=analysis,
        analyzer_id=analysis.get("analyzer_id", analyzer_id),
        role_in_sequence=sequence_context["role_in_sequence"],
        sequence_context=sequence_context,
        tokens=tokens_payload,
        variable_hints=PromptVariableHintsPayload(**variable_hints),
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


def _extract_detected_prompt_variables(tokens: Optional[PromptTokensPayload]) -> List[str]:
    if not tokens or not isinstance(tokens.lines, list):
        return []
    detected: list[str] = []
    seen: set[str] = set()
    for line in tokens.lines:
        if getattr(line, "kind", None) != "chain":
            continue
        elements = getattr(line, "elements", None) or []
        for element in elements:
            if getattr(element, "kind", None) != "var":
                continue
            raw_name = getattr(element, "text", "")
            try:
                name = normalize_prompt_variable_name(raw_name)
            except ValueError:
                continue
            if name in seen:
                continue
            seen.add(name)
            detected.append(name)
    return detected


def _build_prompt_variable_hints(
    *,
    saved_variable_names: List[str],
    tokens: Optional[PromptTokensPayload],
) -> Dict[str, List[str]]:
    saved = read_prompt_variables({"prompt_variables": saved_variable_names})
    detected = _extract_detected_prompt_variables(tokens)
    saved_set = set(saved)
    unsaved_detected = [name for name in detected if name not in saved_set]
    return {
        "saved": saved,
        "detected": detected,
        "unsaved_detected": unsaved_detected,
    }


async def _resolve_saved_prompt_variables_for_principal(user: Any, db: AsyncSession) -> List[str]:
    direct_preferences = getattr(user, "preferences", None)
    if isinstance(direct_preferences, dict):
        names = read_prompt_variables(direct_preferences)
        if names:
            return names

    owner_user_id = resolve_effective_user_id(user)
    if not owner_user_id:
        return []

    try:
        from pixsim7.backend.main.domain import User

        user_record = await db.get(User, owner_user_id)
    except Exception:
        return []

    if not user_record or not isinstance(user_record.preferences, dict):
        return []
    return read_prompt_variables(user_record.preferences)
