"""Template CRUD, roll, preview, diagnostics, and resolver workbench endpoints."""
from dataclasses import asdict
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user, get_current_user_optional
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
from pixsim7.backend.main.services.prompt.block.template_slots import normalize_template_slots
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.prompt.block.resolution_core import (
    CandidateBlock as ResolverCandidateBlock,
    PairwiseBonus as ResolverPairwiseBonus,
    ResolutionConstraint as ResolverResolutionConstraint,
    ResolutionDebugOptions as ResolverDebugOptions,
    ResolutionIntent as ResolverResolutionIntent,
    ResolutionRequest as ResolverResolutionRequest,
    ResolutionTarget as ResolverResolutionTarget,
    build_default_resolver_registry,
)
from pixsim7.backend.main.services.prompt.block.compiler_core import (
    build_default_compiler_registry,
)
from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
    resolve_user_owner,
    resolve_user_owned_list_scope,
)
from .schemas import (
    CreateTemplateRequest,
    UpdateTemplateRequest,
    RollTemplateRequest,
    PreviewSlotRequest,
    TemplateResponse,
    TemplateSummaryResponse,
    TemplateDiagnosticsResponse,
    ResolveWorkbenchRequest,
    CompileWorkbenchTemplateRequest,
    RollInlineWorkbenchTemplateRequest,
)
from .helpers_roles import (
    _compute_slot_composition_summary,
    _enrich_slots_with_composition_hints,
)
from .router import router


# ===== CRUD Endpoints =====

@router.post("", response_model=TemplateResponse)
async def create_template(
    request: CreateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new block template."""
    service = BlockTemplateService(db)

    existing = await service.get_template_by_slug(request.slug)
    if existing:
        raise HTTPException(400, f"Template with slug '{request.slug}' already exists")

    data = request.model_dump()
    # Convert slot models to dicts
    data["slots"] = [s.model_dump() for s in request.slots]

    template = await service.create_template(
        data=data,
        created_by=current_user.username if current_user else None,
        owner_user_id=current_user.id if current_user else None,
    )
    return await _template_response_with_hints(template, service=service)


@router.get("", response_model=List[TemplateSummaryResponse])
async def list_templates(
    package_name: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    owner_user_id: Optional[int] = Query(None),
    mine: bool = Query(False, description="Return current user's templates"),
    include_public: bool = Query(
        True,
        description="When mine=true, include public templates in addition to owned templates",
    ),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """List/search block templates."""
    service = BlockTemplateService(db)
    scope = resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=owner_user_id,
        requested_is_public=is_public,
        mine=mine,
        include_public_when_mine=include_public,
        mine_forbidden_cross_owner_detail="Not allowed to query another user's templates with mine=true",
        private_owner_forbidden_detail="Not allowed to query private templates of another user",
    )

    templates = await service.search_templates(
        package_name=package_name,
        is_public=scope.is_public,
        owner_user_id=scope.owner_user_id,
        include_public_for_owner=scope.include_public_for_owner,
        tag=tag,
        limit=limit,
        offset=offset,
    )
    result = []
    for t in templates:
        gap_count, role_ids = _compute_slot_composition_summary(t.slots)
        owner_fields = _extract_template_owner_fields(t)
        result.append(TemplateSummaryResponse(
            id=t.id,
            name=t.name,
            slug=t.slug,
            description=t.description,
            slot_count=len(t.slots) if t.slots else 0,
            composition_strategy=t.composition_strategy,
            package_name=t.package_name,
            tags=t.tags or [],
            is_public=t.is_public,
            owner_user_id=owner_fields["owner_user_id"],
            owner_ref=owner_fields["owner_ref"],
            owner_username=owner_fields["owner_username"],
            roll_count=t.roll_count,
            composition_role_gap_count=gap_count,
            composition_role_ids=role_ids,
            created_at=t.created_at,
            updated_at=t.updated_at,
        ))
    return result


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get template by ID."""
    service = BlockTemplateService(db)
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return await _template_response_with_hints(template, service=service)


@router.get("/by-slug/{slug}", response_model=TemplateResponse)
async def get_template_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get template by slug."""
    service = BlockTemplateService(db)
    template = await service.get_template_by_slug(slug)
    if not template:
        raise HTTPException(404, "Template not found")
    return await _template_response_with_hints(template, service=service)


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    request: UpdateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a template."""
    service = BlockTemplateService(db)
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    _assert_template_write_access(template=template, current_user=current_user)

    if request.slug is not None:
        existing = await service.get_template_by_slug(request.slug)
        if existing and existing.id != template_id:
            raise HTTPException(400, f"Template with slug '{request.slug}' already exists")

    updates = {}
    for key, value in request.model_dump(exclude_unset=True).items():
        if value is not None:
            if key == "slots":
                updates[key] = [s.model_dump() if hasattr(s, "model_dump") else s for s in value]
            else:
                updates[key] = value

    template = await service.update_template(template_id, updates)
    if not template:
        raise HTTPException(404, "Template not found")
    return await _template_response_with_hints(template, service=service)


@router.delete("/{template_id}")
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a template."""
    service = BlockTemplateService(db)
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    _assert_template_write_access(template=template, current_user=current_user)
    success = await service.delete_template(template_id)
    if not success:
        raise HTTPException(404, "Template not found")
    return {"success": True, "message": "Template deleted"}


# ===== Roll & Preview Endpoints =====

@router.post("/{template_id}/roll", response_model=Dict[str, Any])
async def roll_template(
    template_id: UUID,
    request: RollTemplateRequest = RollTemplateRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Roll a template: randomly select blocks per slot and compose a prompt."""
    service = BlockTemplateService(db)
    result = await service.roll_template(
        template_id,
        seed=request.seed,
        exclude_block_ids=request.exclude_block_ids,
        character_bindings=request.character_bindings,
        control_values=request.control_values,
        current_user_id=current_user.id if current_user else None,
    )
    if not result.get("success"):
        raise HTTPException(404, result.get("error", "Roll failed"))
    return result


@router.get("/{template_id}/diagnostics", response_model=TemplateDiagnosticsResponse)
async def get_template_diagnostics(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Inspect slot candidate counts by package for a template."""
    service = BlockTemplateService(db)
    result = await service.diagnose_template(template_id)
    if not result.get("success"):
        error = str(result.get("error") or "Diagnostics failed")
        if "not found" in error.lower():
            raise HTTPException(404, error)
        raise HTTPException(400, error)
    return result


@router.post("/preview-slot", response_model=Dict[str, Any])
async def preview_slot(
    request: PreviewSlotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Preview matching block count and samples for a slot definition."""
    service = BlockTemplateService(db)
    return await service.preview_slot_matches(
        slot=request.slot.model_dump(),
        limit=request.limit,
    )


@router.get("/meta/packages", response_model=List[str])
async def list_block_packages(
    db: AsyncSession = Depends(get_db),
):
    """List distinct package names (tags.source_pack) from primitive blocks."""
    service = BlockTemplateService(db)
    return await service.list_package_names()


# ===== Resolver Workbench Endpoints =====

# Compiler registry — used by compile-template endpoint.
_compiler_registry = build_default_compiler_registry()


def _coerce_resolution_request(request: ResolveWorkbenchRequest) -> ResolverResolutionRequest:
    intent_raw = request.intent if isinstance(request.intent, dict) else {}
    targets: List[ResolverResolutionTarget] = []
    for item in intent_raw.get("targets") or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        kind = str(item.get("kind") or "").strip()
        if not key or not kind:
            continue
        targets.append(
            ResolverResolutionTarget(
                key=key,
                kind=kind,
                label=(str(item["label"]) if item.get("label") is not None else None),
                category=(str(item["category"]) if item.get("category") is not None else None),
                capabilities=[str(v) for v in (item.get("capabilities") or []) if isinstance(v, (str, int, float))],
                metadata=dict(item.get("metadata") or {}),
            )
        )

    candidates_by_target: Dict[str, List[ResolverCandidateBlock]] = {}
    for target_key, rows in (request.candidates_by_target or {}).items():
        key = str(target_key or "").strip()
        if not key:
            continue
        normalized_rows: List[ResolverCandidateBlock] = []
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            block_id = str(row.get("block_id") or "").strip()
            if not block_id:
                continue
            normalized_rows.append(
                ResolverCandidateBlock(
                    block_id=block_id,
                    text=str(row.get("text") or ""),
                    package_name=(str(row["package_name"]) if row.get("package_name") is not None else None),
                    tags=dict(row.get("tags") or {}),
                    category=(str(row["category"]) if row.get("category") is not None else None),
                    avg_rating=(float(row["avg_rating"]) if isinstance(row.get("avg_rating"), (int, float)) else None),
                    features=dict(row.get("features") or {}),
                    capabilities=[str(v) for v in (row.get("capabilities") or []) if isinstance(v, (str, int, float))],
                    metadata=dict(row.get("metadata") or {}),
                )
            )
        candidates_by_target[key] = normalized_rows

    constraints: List[ResolverResolutionConstraint] = []
    for row in request.constraints or []:
        if not isinstance(row, dict):
            continue
        constraint_id = str(row.get("id") or "").strip()
        kind = str(row.get("kind") or "").strip()
        if not constraint_id or not kind:
            continue
        constraints.append(
            ResolverResolutionConstraint(
                id=constraint_id,
                kind=kind,
                target_key=(str(row["target_key"]) if row.get("target_key") is not None else None),
                payload=dict(row.get("payload") or {}),
                severity=str(row.get("severity") or "error"),
            )
        )

    pairwise_bonuses: List[ResolverPairwiseBonus] = []
    for row in request.pairwise_bonuses or []:
        if not isinstance(row, dict):
            continue
        bonus_id = str(row.get("id") or "").strip()
        source_target = str(row.get("source_target") or "").strip()
        target_key = str(row.get("target_key") or "").strip()
        if not bonus_id or not source_target or not target_key:
            continue
        bonus_val = row.get("bonus", 1.0)
        pairwise_bonuses.append(
            ResolverPairwiseBonus(
                id=bonus_id,
                source_target=source_target,
                target_key=target_key,
                source_tags=dict(row.get("source_tags") or {}),
                candidate_tags=dict(row.get("candidate_tags") or {}),
                bonus=float(bonus_val) if isinstance(bonus_val, (int, float)) else 1.0,
            )
        )

    debug_raw = request.debug if isinstance(request.debug, dict) else {}
    debug = ResolverDebugOptions(
        include_trace=bool(debug_raw.get("include_trace", True)),
        include_candidate_scores=bool(debug_raw.get("include_candidate_scores", True)),
    )

    intent = ResolverResolutionIntent(
        control_values=dict(intent_raw.get("control_values") or {}),
        desired_tags_by_target=dict(intent_raw.get("desired_tags_by_target") or {}),
        avoid_tags_by_target=dict(intent_raw.get("avoid_tags_by_target") or {}),
        desired_features_by_target=dict(intent_raw.get("desired_features_by_target") or {}),
        required_capabilities_by_target=dict(intent_raw.get("required_capabilities_by_target") or {}),
        targets=targets,
    )

    return ResolverResolutionRequest(
        resolver_id=str(request.resolver_id or "next_v1"),
        seed=request.seed,
        intent=intent,
        candidates_by_target=candidates_by_target,
        constraints=constraints,
        pairwise_bonuses=pairwise_bonuses,
        debug=debug,
        context=dict(request.context or {}),
    )


async def _compile_template_to_resolution_request(
    *,
    service: BlockTemplateService,
    template: Any,
    candidate_limit: int,
    control_values: Optional[Dict[str, Any]],
    compiler_id: str = "compiler_v1",
) -> ResolverResolutionRequest:
    """Look up a compiler by id and compile the template."""
    compiler = _compiler_registry.get(compiler_id)
    return await compiler.compile(
        service=service,
        template=template,
        candidate_limit=candidate_limit,
        control_values=control_values,
    )


@router.post("/dev/resolver-workbench/resolve", response_model=Dict[str, Any])
async def resolve_workbench_request(
    request: ResolveWorkbenchRequest,
    current_user: User = Depends(get_current_user),
):
    """Dev endpoint: resolve a ResolutionRequest payload via registered prompt resolvers."""
    del current_user  # auth gate only
    try:
        normalized = _coerce_resolution_request(request)
        registry = build_default_resolver_registry()
        result = registry.resolve(normalized)
        return asdict(result)
    except KeyError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(400, f"Resolver workbench failed: {exc}")


@router.post("/dev/resolver-workbench/compile-template", response_model=Dict[str, Any])
async def compile_template_for_resolver_workbench(
    request: CompileWorkbenchTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dev endpoint: compile a template (with control overrides) into ResolutionRequest JSON."""
    del current_user  # auth gate only
    if request.template_id is None and not (request.slug and request.slug.strip()):
        raise HTTPException(400, "Provide template_id or slug")
    if request.template_id is not None and request.slug and request.slug.strip():
        raise HTTPException(400, "Provide only one of template_id or slug")

    service = BlockTemplateService(db)
    template = None
    if request.template_id is not None:
        template = await service.get_template(request.template_id)
    else:
        template = await service.get_template_by_slug(str(request.slug).strip())
    if not template:
        raise HTTPException(404, "Template not found")

    try:
        compiled = await _compile_template_to_resolution_request(
            service=service,
            template=template,
            candidate_limit=int(request.candidate_limit),
            control_values=dict(request.control_values or {}),
            compiler_id=request.compiler_id,
        )
        return asdict(compiled)
    except Exception as exc:
        raise HTTPException(400, f"Compile failed: {exc}")


@router.post("/dev/resolver-workbench/roll-template-inline", response_model=Dict[str, Any])
async def roll_template_inline_for_resolver_workbench(
    request: RollInlineWorkbenchTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dev endpoint: roll an inline template payload without creating a template record."""
    service = BlockTemplateService(db)
    result = await service.roll_template_inline(
        template_payload=dict(request.template or {}),
        seed=request.seed,
        exclude_block_ids=request.exclude_block_ids,
        character_bindings=request.character_bindings,
        control_values=request.control_values,
        current_user_id=current_user.id if current_user else None,
    )
    if not result.get("success"):
        raise HTTPException(400, result.get("error") or "Inline template roll failed")
    return result


# ===== Helpers =====


def _extract_template_owner_fields(template: Any) -> Dict[str, Any]:
    """Read canonical owner identity fields (DB column first, metadata fallback)."""
    metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
    owner = metadata.get("owner") if isinstance(metadata.get("owner"), dict) else None
    return resolve_user_owner(
        model_owner_user_id=getattr(template, "owner_user_id", None),
        owner_payload=owner,
        created_by=getattr(template, "created_by", None),
    )


def _assert_template_write_access(*, template: Any, current_user: User) -> None:
    owner_fields = _extract_template_owner_fields(template)
    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=owner_fields["owner_user_id"],
        created_by=getattr(template, "created_by", None),
        denied_detail="Not allowed to modify this template",
    )


async def _template_response_with_hints(
    template: Any,
    *,
    service: Optional[BlockTemplateService] = None,
) -> TemplateResponse:
    """Build TemplateResponse with composition_role_hint enriched on each slot."""
    slots = template.slots if isinstance(template.slots, list) else []
    template_metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
    if service is not None and isinstance(template_metadata.get("controls"), list):
        try:
            normalized_slots = normalize_template_slots(
                slots,
                schema_version=service._get_slot_schema_version(template),
            )
            resolved_controls = await service.resolve_template_controls(
                slots=normalized_slots,
                template_metadata=template_metadata,
            )
            if resolved_controls:
                template_metadata = {**template_metadata, "controls": resolved_controls}
        except Exception:
            template_metadata = dict(template_metadata)
    owner_fields = _extract_template_owner_fields(template)
    return TemplateResponse(
        id=template.id,
        name=template.name,
        slug=template.slug,
        description=template.description,
        slots=_enrich_slots_with_composition_hints(slots),
        composition_strategy=template.composition_strategy,
        package_name=template.package_name,
        tags=template.tags or [],
        is_public=template.is_public,
        created_by=template.created_by,
        owner_user_id=owner_fields["owner_user_id"],
        owner_ref=owner_fields["owner_ref"],
        owner_username=owner_fields["owner_username"],
        roll_count=template.roll_count,
        template_metadata=template_metadata,
        character_bindings=template.character_bindings or {},
        created_at=template.created_at,
        updated_at=template.updated_at,
    )
