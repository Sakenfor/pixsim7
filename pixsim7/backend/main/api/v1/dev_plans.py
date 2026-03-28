"""
Dev Plans API — DB-first plan management.

Plans are backed by Document (shared fields) + PlanRegistry (plan-specific fields).
The DB is authoritative. Filesystem markdown is a convenience export.
"""
import asyncio
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import (
    PlanParticipant,
    PlanReviewLink,
    PlanReviewNode,
    PlanRequest,
    PlanReviewRound,
    PlanRegistry,
    PlanRevision,
    PlanSyncRun,
    TestSuiteRecord,
)
from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile
from pixsim7.backend.main.shared.config import _resolve_repo_root, settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.services.docs.plans import get_plans_index
from pixsim7.backend.main.services.docs.plan_sync import (
    PlanSyncLockedError,
    prune_plan_sync_history,
    sync_plans,
)
from pixsim7.backend.main.services.crud.primitives import DeleteResponse
from pixsim7.backend.main.services.docs.plan_write import (
    HIDDEN_STATUSES,
    PlanBundle,
    PlanNotFoundError,
    PlanRevisionConflictError,
    PlanWriteError,
    status_to_scope,
    archive_plan,
    delete_plan,
    export_plan_to_disk,
    get_active_assignment,
    get_plan_bundle,
    get_plan_documents,
    git_forge_commit_url_template,
    git_resolve_head,
    git_rev_list,
    git_verify_commit,
    list_plan_bundles,
    make_document_id,
    record_plan_revision,
    unarchive_plan,
    update_plan,
)
from pixsim7.backend.main.services.docs.plan_stages import (
    CANONICAL_PLAN_STAGES,
    CANONICAL_PLAN_TYPES,
    DEFAULT_PLAN_STAGE,
    normalize_plan_stage,
    plan_stage_options,
    validate_plan_stage,
)
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    PLAN_AUTHORING_CONTRACT_ENDPOINT,
    get_plan_authoring_contract,
    validate_plan_create_policy,
    validate_plan_progress_policy,
)
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/plans", tags=["dev", "plans"])

# Include sub-routers
from pixsim7.backend.main.api.v1.plans.routes_review import router as _review_router
from pixsim7.backend.main.api.v1.plans.routes_admin import router as _admin_router
from pixsim7.backend.main.api.v1.plans.routes_agent import router as _agent_router
from pixsim7.backend.main.api.v1.plans.routes_coverage import router as _coverage_router
router.include_router(_review_router)
router.include_router(_admin_router)
router.include_router(_agent_router)
router.include_router(_coverage_router)


# ── Response models ──────────────────────────────────────────────


from pixsim7.backend.main.api.v1.plans.schemas import (  # noqa: E402
    PlanChildSummary,
    PlanSummary,
    PlansIndexResponse,
    PlanDetailResponse,
    PlanRegistryEntry,
    PlanRegistryListResponse,
    PlanEventEntry,
    PlanEventsResponse,
    PlanRevisionEntry,
    PlanRevisionListResponse,
    PlanRestoreRequest,
    PlanRestoreResponse,
    PlanReviewRoundEntry,
    PlanReviewRoundListResponse,
    PlanReviewRoundCreateRequest,
    PlanReviewRoundUpdateRequest,
    PlanReviewRefInput,
    PlanReviewNodeCreateRequest,
    PlanReviewNodeEntry,
    PlanReviewLinkEntry,
    PlanReviewNodeCreateResponse,
    PlanReviewGraphResponse,
    PlanRequestEntry,
    PlanRequestListResponse,
    PlanRequestCreateRequest,
    PlanRequestUpdateRequest,
    PlanRequestDispatchRequest,
    PlanRequestDispatchResponse,
    PlanReviewDispatchTickRequest,
    PlanReviewDispatchTickItem,
    PlanReviewDispatchTickResponse,
    PlanReviewPoolSession,
    PlanReviewAssigneeEntry,
    PlanReviewAssigneesResponse,
    PlanParticipantEntry,
    PlanParticipantsResponse,
    PlanSourceSnippetLine,
    PlanSourcePreviewResponse,
    PlanActivityEntry,
    PlanActivityResponse,
    SyncResultResponse,
    PlanSyncRunEntry,
    PlanSyncRunsResponse,
    PlanSyncRetentionResponse,
    PlanRuntimeSettingsResponse,
    PlanRuntimeSettingsUpdateRequest,
    PlanStageOptionEntry,
    PlanStagesResponse,
    validate_plan_id as _validate_plan_id,
)


# ── Inline schemas kept here (depend on service imports) ─────────
# PlanCreateRequest, PlanUpdateRequest, etc. remain below their
# route handlers because they reference module-level constants
# (DEFAULT_PLAN_STAGE, validate_plan_stage) that live in services.




# Helpers moved to plans/helpers.py — import for backward compat
from pixsim7.backend.main.api.v1.plans.helpers import *  # noqa: F401,F403
from pixsim7.backend.main.api.v1.plans.helpers import (
    _bundle_to_summary,
    _filter_bundles,
    _validate_commit_sha,
    _parse_uuid_or_400,
    _principal_actor_fields,
    _principal_is_admin,
    _principal_matches_plan_owner,
    _normalize_stage_for_response,
    _bundle_to_registry_entry,
    _revision_to_entry,
    _snapshot_to_restore_updates,
    _run_to_entry,
    _record_plan_participant_from_principal,
    _merge_evidence,
    _normalize_evidence_ref,
    _evidence_key,
    _derive_checkpoint_points,
    _checkpoint_int,
    _COMMIT_RANGE_RE,
    CHECKPOINT_STATUSES,
)

@router.get("", response_model=PlansIndexResponse)
async def list_plans(
    _user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status (active, done, parked, archived, removed)"),
    owner: Optional[str] = Query(None, description="Filter by owner (substring match)"),
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
    priority: Optional[str] = Query(None, description="Filter by priority (high, normal, low)"),
    plan_type: Optional[str] = Query(None, description=f"Filter by plan type ({', '.join(CANONICAL_PLAN_TYPES)})"),
    tag: Optional[str] = Query(None, description="Filter by tag (plans containing this tag)"),
    include_hidden: bool = Query(False, description="Include archived and removed plans (hidden by default)"),
    limit: int = Query(100, ge=1, le=500, description="Max plans to return"),
    offset: int = Query(0, ge=0, description="Number of plans to skip"),
    refresh: bool = Query(False),
    db: AsyncSession = Depends(get_database),
):
    bundles = await list_plan_bundles(db)
    filtered = _filter_bundles(
        bundles, status=status, owner=owner, namespace=namespace,
        priority=priority, plan_type=plan_type, tag=tag, include_hidden=include_hidden,
    )

    # Build parent->children index
    children_map: dict[str, list[PlanBundle]] = {}
    for b in bundles:
        pid = b.plan.parent_id
        if pid:
            children_map.setdefault(pid, []).append(b)

    total = len(filtered)
    page = filtered[offset : offset + limit]

    # Batch-load review round counts for plans in this page
    page_plan_ids = [b.id for b in page]
    review_counts: dict[str, tuple[int, int]] = {}
    if page_plan_ids:
        rows = (
            await db.execute(
                select(
                    PlanReviewRound.plan_id,
                    func.count(PlanReviewRound.id).label("total"),
                    func.count(PlanReviewRound.id).filter(
                        PlanReviewRound.status.in_(("open", "changes_requested"))
                    ).label("active"),
                )
                .where(PlanReviewRound.plan_id.in_(page_plan_ids))
                .group_by(PlanReviewRound.plan_id)
            )
        ).all()
        review_counts = {r[0]: (r[1], r[2]) for r in rows}

    plans = [
        _bundle_to_summary(
            b,
            children=children_map.get(b.id),
            review_counts=review_counts.get(b.id),
        )
        for b in page
    ]

    return {
        "version": "1",
        "generatedAt": None,
        "plans": plans,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total,
    }


# ── Sync endpoints ────────────────────────────────────────────────
class PlanCreateRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=120, description="Unique plan ID (slug)")
    title: str = Field(..., min_length=1, max_length=255)
    plan_type: str = Field(
        "feature", description=f"{' | '.join(CANONICAL_PLAN_TYPES)}"
    )

    @field_validator("plan_type")
    @classmethod
    def _validate_plan_type(cls, v: str) -> str:
        if v not in CANONICAL_PLAN_TYPES:
            raise ValueError(f"Invalid plan_type '{v}'. Allowed: {', '.join(CANONICAL_PLAN_TYPES)}")
        return v
    status: Literal["active", "parked", "done", "blocked"] = Field(
        "active", description="active | parked | done | blocked"
    )
    stage: str = Field(
        DEFAULT_PLAN_STAGE,
        description=f"Canonical stage ({' | '.join(CANONICAL_PLAN_STAGES)})",
    )
    owner: str = Field("unassigned", description="Owner / lane")
    priority: Literal["high", "normal", "low"] = Field("normal", description="high | normal | low")
    summary: str = Field("", description="Plan summary")
    markdown: Optional[str] = Field(None, description="Plan content")
    task_scope: Literal["plan", "user", "system"] = Field("plan", description="plan | user | system")
    visibility: Literal["private", "shared", "public"] = Field("public", description="private | shared | public")
    namespace: Optional[str] = Field("dev/plans", description="Optional taxonomy namespace")
    tags: Optional[List[str]] = Field(None)
    code_paths: Optional[List[str]] = Field(None)
    companions: Optional[List[str]] = Field(None)
    handoffs: Optional[List[str]] = Field(None)
    depends_on: Optional[List[str]] = Field(None)
    target: Optional[Dict[str, Any]] = Field(None, description="Structured target metadata object.")
    checkpoints: Optional[List[Dict[str, Any]]] = Field(None, description="Structured checkpoints list.")
    parent_id: Optional[str] = Field(None, description="Parent plan ID for sub-plans")

    @field_validator("id", "parent_id")
    @classmethod
    def validate_plan_id_fields(cls, value: Optional[str]):
        if value is None:
            return value
        return _validate_plan_id(value)

    @field_validator("depends_on")
    @classmethod
    def validate_depends_on_ids(cls, value: Optional[List[str]]):
        if value is None:
            return value
        for dep in value:
            _validate_plan_id(dep, field_name="depends_on[]")
        return value

    @field_validator("stage")
    @classmethod
    def validate_stage_value(cls, value: str):
        return validate_plan_stage(value)


class PlanCreateResponse(BaseModel):
    planId: str
    documentId: str
    created: bool
    commitSha: Optional[str] = None
    exportError: Optional[str] = None


class PlanAuthoringRuleEntry(BaseModel):
    id: str
    endpointId: str
    field: str
    level: Literal["required", "suggested"]
    appliesToPrincipalTypes: List[str] = Field(default_factory=list)
    description: str
    constraint: Dict[str, Any] = Field(default_factory=dict)
    message: str


class PlanAuthoringContractResponse(BaseModel):
    version: str
    endpoint: str
    summary: str
    rules: List[PlanAuthoringRuleEntry] = Field(default_factory=list)


@router.get("/meta/authoring-contract", response_model=PlanAuthoringContractResponse)
async def get_plan_authoring_contract_endpoint(
    _user: CurrentUser,
):
    contract = get_plan_authoring_contract()
    return PlanAuthoringContractResponse(
        version=contract["version"],
        endpoint=contract["endpoint"],
        summary=contract["summary"],
        rules=[
            PlanAuthoringRuleEntry(
                id=str(rule.get("id") or ""),
                endpointId=str(rule.get("endpoint_id") or ""),
                field=str(rule.get("field") or ""),
                level=str(rule.get("level") or "suggested"),
                appliesToPrincipalTypes=list(rule.get("applies_to_principal_types") or []),
                description=str(rule.get("description") or ""),
                constraint=dict(rule.get("constraint") or {}),
                message=str(rule.get("message") or ""),
            )
            for rule in (contract.get("rules") or [])
        ],
    )


async def _resolve_companion_docs(
    db: "AsyncSession", *, plan_id: str, companions: list[str]
) -> list[str]:
    """Resolve companion doc references. Pass-through for now."""
    return companions


@router.post("", response_model=PlanCreateResponse)
async def create_plan(
    payload: PlanCreateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a new plan: Document (shared fields) + PlanRegistry (plan-specific)."""
    from pixsim7.backend.main.domain.docs.models import Document, PlanRegistry
    from pixsim7.backend.main.services.docs.plan_write import _git_commit
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    policy_violations = validate_plan_create_policy(payload, principal)
    if policy_violations:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Plan authoring policy violation",
                "errors": policy_violations,
                "contract": PLAN_AUTHORING_CONTRACT_ENDPOINT,
            },
        )

    # Check for duplicate
    existing = await db.get(PlanRegistry, payload.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Plan already exists: {payload.id}")

    now = utcnow()
    doc_id = make_document_id(payload.id)

    # Create Document (shared fields)
    doc = Document(
        id=doc_id,
        doc_type="plan",
        title=payload.title,
        status=payload.status,
        owner=payload.owner,
        summary=payload.summary,
        markdown=payload.markdown,
        user_id=principal.id if principal.id != 0 else None,
        visibility=payload.visibility,
        namespace=payload.namespace or "dev/plans",
        tags=payload.tags or [],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    await db.flush()

    # Validate parent exists if specified
    if payload.parent_id:
        parent = await db.get(PlanRegistry, payload.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail=f"Parent plan not found: {payload.parent_id}")

    # Create PlanRegistry (plan-specific fields)
    plan = PlanRegistry(
        id=payload.id,
        document_id=doc_id,
        parent_id=payload.parent_id,
        plan_type=payload.plan_type,
        stage=payload.stage,
        priority=payload.priority,
        task_scope=payload.task_scope,
        target=payload.target,
        checkpoints=payload.checkpoints,
        code_paths=payload.code_paths or [],
        companions=await _resolve_companion_docs(
            db, plan_id=payload.id, companions=payload.companions or [],
        ),
        handoffs=payload.handoffs or [],
        depends_on=payload.depends_on or [],
        scope=status_to_scope(payload.status),
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    await db.flush()

    actor_source = getattr(principal, "source", f"user:{principal.id}")
    await record_plan_revision(
        db,
        PlanBundle(plan=plan, doc=doc),
        event_type="create",
        actor=actor_source,
        commit_sha=None,
        changed_fields=["create"],
    )
    await _record_plan_participant_from_principal(
        db,
        plan_id=payload.id,
        role="builder",
        action="create_plan",
        principal=principal,
    )

    # Audit: PlanRegistry.__audit__ model hook handles creation tracking

    # Emit notification
    from pixsim7.backend.main.services.docs.plan_write import emit_plan_created_notification
    await emit_plan_created_notification(
        db,
        payload.id,
        payload.title,
        principal=principal,
    )

    await db.commit()

    # Optional export to filesystem + git for dev plans
    commit_sha = None
    export_error = None
    if payload.task_scope == "plan" and not settings.plans_db_only_mode:
        try:
            bundle = PlanBundle(plan=plan, doc=doc)
            paths = export_plan_to_disk(bundle)
            commit_sha = _git_commit(
                paths,
                f"plan({payload.id}): created\n\nActor: {principal.source}",
            )
        except Exception as exc:
            export_error = str(exc)
            logger.warning(
                "plan_create_export_failed",
                plan_id=payload.id,
                error=export_error,
            )

    return PlanCreateResponse(
        planId=plan.id,
        documentId=doc_id,
        created=True,
        commitSha=commit_sha,
        exportError=export_error,
    )


class PlanUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Plan title")
    status: Optional[str] = Field(None, description="active | parked | done | blocked")
    stage: Optional[str] = Field(
        None,
        description=f"Canonical stage ({' | '.join(CANONICAL_PLAN_STAGES)})",
    )
    owner: Optional[str] = Field(None, description="Owner / lane")
    priority: Optional[str] = Field(None, description="high | normal | low")
    task_scope: Optional[str] = Field(None, description="plan | user | system")
    plan_type: Optional[str] = Field(None, description=f"{' | '.join(CANONICAL_PLAN_TYPES)}")
    summary: Optional[str] = Field(None, description="Plan summary")
    markdown: Optional[str] = Field(None, description="Plan markdown content")
    visibility: Optional[str] = Field(None, description="private | shared | public")
    namespace: Optional[str] = Field(None, description="Optional taxonomy namespace")
    tags: Optional[List[str]] = Field(None)
    code_paths: Optional[List[str]] = Field(None)
    companions: Optional[List[str]] = Field(None)
    handoffs: Optional[List[str]] = Field(None)
    depends_on: Optional[List[str]] = Field(None)
    target: Optional[Dict[str, Any]] = Field(None, description="Structured target metadata object.")
    checkpoints: Optional[List[Dict[str, Any]]] = Field(None, description="Structured checkpoints list (replaces all).")
    checkpoints_append: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Append checkpoints to existing list. Existing checkpoints with same ID are updated in-place.",
    )
    patch: Optional[Dict[str, Any]] = Field(
        None,
        description="Raw mutable-field patch map. Merged with explicit fields; explicit fields win.",
    )
    expected_revision: Optional[int] = Field(
        None,
        ge=1,
        description="Optional optimistic-lock revision guard. Update is rejected if current revision differs.",
    )
    commit_sha: Optional[str] = Field(
        None,
        description="Git commit SHA associated with this update. Recorded on audit events for traceability.",
    )
    auto_head: bool = Field(
        False,
        description="When true and commit_sha is not set, automatically resolve HEAD as the commit SHA.",
    )
    verify_commits: bool = Field(
        False,
        description="When true, verify the commit SHA exists in the repository.",
    )

    @field_validator("depends_on")
    @classmethod
    def validate_depends_on_ids(cls, value: Optional[List[str]]):
        if value is None:
            return value
        for dep in value:
            _validate_plan_id(dep, field_name="depends_on[]")
        return value

    @field_validator("stage")
    @classmethod
    def validate_stage_value(cls, value: Optional[str]):
        if value is None:
            return value
        return validate_plan_stage(value)


class PlanUpdateResponse(BaseModel):
    planId: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    revision: Optional[int] = None
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


@router.patch("/{plan_id}", response_model=PlanUpdateResponse)
@router.patch("/update/{plan_id}", response_model=PlanUpdateResponse, deprecated=True)
async def update_plan_endpoint(
    plan_id: str,
    payload: PlanUpdateRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    payload_data = payload.model_dump()
    raw_patch = payload_data.pop("patch", None)
    request_commit_sha = payload_data.pop("commit_sha", None)
    auto_head = payload_data.pop("auto_head", False)
    verify_commits_flag = payload_data.pop("verify_commits", False)
    expected_revision = payload_data.pop("expected_revision", None)

    # Resolve auto_head → commit_sha
    if auto_head and request_commit_sha is None:
        head = git_resolve_head()
        if head:
            request_commit_sha = head

    # Validate commit SHA if provided
    if request_commit_sha is not None:
        try:
            request_commit_sha = _validate_commit_sha(request_commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Optionally verify it exists in the repo
        if verify_commits_flag and not git_verify_commit(request_commit_sha):
            raise HTTPException(
                status_code=400,
                detail=f"Commit not found in repository: '{request_commit_sha}'",
            )

    # Handle checkpoints_append — merge with existing before standard update
    checkpoints_append = payload_data.pop("checkpoints_append", None)

    updates: Dict[str, Any] = {}
    if isinstance(raw_patch, dict):
        updates.update(raw_patch)

    updates.update({k: v for k, v in payload_data.items() if v is not None})

    # checkpoints_append: merge new checkpoints into existing list
    if checkpoints_append and isinstance(checkpoints_append, list):
        if "checkpoints" in updates:
            # Explicit checkpoints field takes priority — append to that
            existing = updates["checkpoints"]
        else:
            # Load existing checkpoints from DB
            bundle = await get_plan_bundle(db, plan_id)
            if not bundle:
                raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")
            existing = list(bundle.plan.checkpoints or [])
        # Merge: update in-place by ID, append new ones
        existing_by_id = {c.get("id"): i for i, c in enumerate(existing) if c.get("id")}
        for cp in checkpoints_append:
            cp_id = cp.get("id")
            if cp_id and cp_id in existing_by_id:
                existing[existing_by_id[cp_id]] = cp
            else:
                existing.append(cp)
        updates["checkpoints"] = existing
    if "stage" in updates:
        stage_value = updates["stage"]
        if not isinstance(stage_value, str) or not stage_value.strip():
            raise HTTPException(status_code=400, detail="Invalid 'stage': expected non-empty string.")
        try:
            updates["stage"] = normalize_plan_stage(stage_value, strict=True)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate depends_on plan IDs exist
    depends_on = updates.get("depends_on")
    if isinstance(depends_on, list) and depends_on:
        from pixsim7.backend.main.domain.docs.models import PlanRegistry
        existing_ids_result = await db.execute(
            select(PlanRegistry.id).where(PlanRegistry.id.in_(depends_on))
        )
        existing_ids = set(existing_ids_result.scalars().all())
        missing = [d for d in depends_on if d not in existing_ids]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"depends_on references non-existent plan(s): {', '.join(missing)}",
            )

    # Auto-ingest companion file paths into docs DB
    if "companions" in updates and isinstance(updates["companions"], list):
        updates["companions"] = await _resolve_companion_docs(
            db, plan_id=plan_id, companions=updates["companions"],
        )

    try:
        result = await update_plan(
            db, plan_id, updates, principal=principal,
            evidence_commit_sha=request_commit_sha,
            expected_revision=expected_revision,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanRevisionConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "plan_revision_conflict",
                "expected_revision": exc.expected_revision,
                "current_revision": exc.current_revision,
            },
        ) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.changes:
        await _record_plan_participant_from_principal(
            db,
            plan_id=plan_id,
            role="builder",
            action="update_plan",
            principal=principal,
            meta={"changed_fields": [str(c.get("field")) for c in result.changes if c.get("field")]},
        )
        await db.commit()

    return PlanUpdateResponse(
        planId=result.plan_id,
        changes=result.changes,
        revision=result.revision,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


# ── Agent context ─────────────────────────────────────────────────
@router.get("/revisions/{plan_id}", response_model=PlanRevisionListResponse)
async def list_plan_revisions(
    plan_id: str,
    _user: CurrentUser,
    include_snapshot: bool = Query(
        False, description="Include full immutable snapshot payload for each revision."
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    rows = (
        await db.execute(
            select(PlanRevision)
            .where(PlanRevision.plan_id == plan_id)
            .order_by(PlanRevision.revision.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    return PlanRevisionListResponse(
        planId=plan_id,
        revisions=[
            PlanRevisionEntry(**_revision_to_entry(row, include_snapshot=include_snapshot))
            for row in rows
        ],
    )


@router.get("/revisions/{plan_id}/{revision}", response_model=PlanRevisionEntry)
async def get_plan_revision(
    plan_id: str,
    revision: int,
    _user: CurrentUser,
    include_snapshot: bool = Query(
        True, description="Include full immutable snapshot payload."
    ),
    db: AsyncSession = Depends(get_database),
):
    row = (
        await db.execute(
            select(PlanRevision).where(
                PlanRevision.plan_id == plan_id,
                PlanRevision.revision == revision,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Plan revision not found: {plan_id}@{revision}",
        )
    return PlanRevisionEntry(**_revision_to_entry(row, include_snapshot=include_snapshot))


@router.post("/restore/{plan_id}/{revision}", response_model=PlanRestoreResponse)
async def restore_plan_revision(
    plan_id: str,
    revision: int,
    payload: PlanRestoreRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    resolved_commit_sha = payload.commit_sha
    if payload.auto_head and resolved_commit_sha is None:
        head = git_resolve_head()
        if head:
            resolved_commit_sha = head

    if resolved_commit_sha is not None:
        try:
            resolved_commit_sha = _validate_commit_sha(resolved_commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if payload.verify_commits and not git_verify_commit(resolved_commit_sha):
            raise HTTPException(
                status_code=400,
                detail=f"Commit not found in repository: '{resolved_commit_sha}'",
            )

    revision_row = (
        await db.execute(
            select(PlanRevision).where(
                PlanRevision.plan_id == plan_id,
                PlanRevision.revision == revision,
            )
        )
    ).scalar_one_or_none()
    if not revision_row:
        raise HTTPException(
            status_code=404,
            detail=f"Plan revision not found: {plan_id}@{revision}",
        )

    snapshot = revision_row.snapshot or {}
    if not isinstance(snapshot, dict):
        raise HTTPException(
            status_code=400,
            detail=f"Plan revision payload is invalid: {plan_id}@{revision}",
        )

    try:
        updates = _snapshot_to_restore_updates(snapshot)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await update_plan(
            db,
            plan_id,
            updates,
            principal=principal,
            evidence_commit_sha=resolved_commit_sha,
            revision_event_type="restore",
            restore_from_revision=revision,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.revision is None:
        bundle = await get_plan_bundle(db, plan_id)
        if not bundle:
            raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")
        actor_source = getattr(principal, "source", f"user:{principal.id}")
        noop_revision = await record_plan_revision(
            db,
            bundle,
            event_type="restore_noop",
            actor=actor_source,
            commit_sha=resolved_commit_sha,
            changed_fields=[],
            restore_from_revision=revision,
        )
        await db.commit()
        result.revision = noop_revision.revision

    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="builder",
        action="restore_plan_revision",
        principal=principal,
        meta={"restored_from_revision": revision, "new_revision": result.revision},
    )
    await db.commit()

    return PlanRestoreResponse(
        planId=plan_id,
        restoredFromRevision=revision,
        revision=result.revision,
        changes=result.changes,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )



# ── Review routes moved to plans/routes_review.py ──


class PlanProgressRequest(BaseModel):
    checkpoint_id: str = Field(..., min_length=1, description="Checkpoint ID to progress.")
    points_delta: int = Field(0, description="Delta to add to points_done.")
    points_done: Optional[int] = Field(None, ge=0, description="Absolute points_done override.")
    points_total: Optional[int] = Field(None, ge=0, description="Absolute points_total override.")
    status: Optional[str] = Field(None, description="pending | active | done | blocked")
    owner: Optional[str] = Field(None, description="Optional checkpoint owner/lane.")
    eta: Optional[str] = Field(None, description="Optional checkpoint ETA.")
    blockers: Optional[List[Dict[str, Any]]] = Field(None, description="Replace checkpoint blockers list.")
    append_evidence: Optional[List[Any]] = Field(
        None,
        description=(
            'Evidence references to append. Each item is either a bare string '
            '(legacy file path) or {"kind": "file_path"|"test_suite"|"git_commit", "ref": "..."}.'
        ),
    )
    commit_sha: Optional[str] = Field(
        None,
        description="Single git commit SHA to record as checkpoint evidence. Accepts short (7+) or full (40) hex.",
    )
    append_commits: Optional[List[str]] = Field(
        None,
        description="List of git commit SHAs to append as checkpoint evidence.",
    )
    commit_range: Optional[str] = Field(
        None,
        description='Git range to expand, e.g. "sha1..sha2". Each commit in the range is added as evidence.',
    )
    auto_head: bool = Field(
        False,
        description="When true, automatically resolve HEAD and add it as commit evidence.",
    )
    verify_commits: bool = Field(
        False,
        description="When true, verify all commit SHAs exist in the repository before recording.",
    )
    note: Optional[str] = Field(None, description="Short progress note.")
    sync_plan_stage: bool = Field(
        False,
        description="When true, normalize checkpoint_id into canonical plan.stage in the same update.",
    )


class PlanProgressResponse(BaseModel):
    planId: str
    checkpointId: str
    checkpoint: Dict[str, Any] = Field(default_factory=dict)
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    revision: Optional[int] = None
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


def _checkpoint_progress_summary(checkpoint: Dict[str, Any], fallback_id: str) -> str:
    checkpoint_id = str(checkpoint.get("id") or fallback_id).strip() or fallback_id
    status = str(checkpoint.get("status") or "pending").strip() or "pending"
    points_done, points_total = _derive_checkpoint_points(checkpoint)
    if points_total is not None and points_total > 0:
        return f"{checkpoint_id} [{status}] {points_done}/{points_total}"
    return f"{checkpoint_id} [{status}] {points_done}"


async def _emit_plan_progress_notification(
    db: AsyncSession,
    *,
    plan_id: str,
    plan_title: str,
    checkpoint_id: str,
    old_summary: str,
    new_summary: str,
    principal: CurrentUser,
) -> None:
    # Test stubs often use lightweight DB objects; real AsyncSession always has add().
    if not hasattr(db, "add"):
        return

    from pixsim7.backend.main.api.v1.notifications import emit_notification

    change_new = new_summary if new_summary != old_summary else f"{checkpoint_id} updated"

    await emit_notification(
        db,
        title=f"Plan updated: {plan_title}",
        body=f"**{plan_title}**: checkpoint -> {change_new}",
        category="plan",
        severity="info",
        source=principal.source,
        event_type="plan.updated",
        actor_name=principal.actor_display_name,
        actor_user_id=principal.user_id,
        ref_type="plan",
        ref_id=plan_id,
        payload={
            "planTitle": plan_title,
            "checkpointId": checkpoint_id,
            "changes": [
                {
                    "field": "checkpoint",
                    "old": old_summary,
                    "new": change_new,
                }
            ],
        },
    )


@router.post("/progress/{plan_id}", response_model=PlanProgressResponse)
async def log_plan_progress(
    plan_id: str,
    payload: PlanProgressRequest,
    principal: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    if payload.status is not None and payload.status not in CHECKPOINT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid checkpoint status '{payload.status}'. Valid: {', '.join(sorted(CHECKPOINT_STATUSES))}",
        )

    has_action = any(
        (
            payload.points_delta != 0,
            payload.points_done is not None,
            payload.points_total is not None,
            payload.status is not None,
            payload.owner is not None,
            payload.eta is not None,
            payload.blockers is not None,
            bool(payload.append_evidence),
            payload.commit_sha is not None,
            bool(payload.append_commits),
            payload.commit_range is not None,
            payload.auto_head,
            bool((payload.note or "").strip()),
            payload.sync_plan_stage,
        )
    )
    if not has_action:
        raise HTTPException(status_code=400, detail="No progress fields to update")

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    checkpoints = bundle.plan.checkpoints or []
    if not isinstance(checkpoints, list) or not checkpoints:
        raise HTTPException(
            status_code=400,
            detail="Plan has no checkpoints. Seed checkpoints via PATCH /dev/plans/{plan_id} first.",
        )

    checkpoint_index: Optional[int] = None
    for idx, item in enumerate(checkpoints):
        if isinstance(item, dict) and item.get("id") == payload.checkpoint_id:
            checkpoint_index = idx
            break
    if checkpoint_index is None:
        raise HTTPException(
            status_code=404,
            detail=f"Checkpoint not found on plan '{plan_id}': {payload.checkpoint_id}",
        )

    checkpoint_raw = checkpoints[checkpoint_index]
    checkpoint = dict(checkpoint_raw) if isinstance(checkpoint_raw, dict) else {}
    old_checkpoint_summary = _checkpoint_progress_summary(checkpoint, payload.checkpoint_id)

    referenced_test_suite_ids: list[str] = []
    for item in payload.append_evidence or []:
        try:
            ref = _normalize_evidence_ref(item)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not ref or ref.get("kind") != "test_suite":
            continue
        suite_id = str(ref.get("ref") or "").strip()
        if suite_id and suite_id not in referenced_test_suite_ids:
            referenced_test_suite_ids.append(suite_id)

    known_test_suite_ids: Optional[Set[str]] = None
    if referenced_test_suite_ids:
        suites_result = await db.execute(
            select(TestSuiteRecord.id).where(TestSuiteRecord.id.in_(referenced_test_suite_ids))
        )
        known_test_suite_ids = set(suites_result.scalars().all())

    progress_policy_violations = validate_plan_progress_policy(
        payload,
        principal,
        referenced_test_suite_ids=referenced_test_suite_ids,
        known_test_suite_ids=known_test_suite_ids,
    )
    if progress_policy_violations:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Plan authoring policy violation",
                "errors": progress_policy_violations,
                "contract": PLAN_AUTHORING_CONTRACT_ENDPOINT,
            },
        )

    points_done, points_total = _derive_checkpoint_points(checkpoint)
    if payload.points_done is not None:
        points_done = payload.points_done
    if payload.points_delta != 0:
        points_done += payload.points_delta
    if payload.points_total is not None:
        points_total = payload.points_total

    if points_done < 0:
        raise HTTPException(status_code=400, detail="points_done cannot be negative")
    if points_total is not None and points_total < 0:
        raise HTTPException(status_code=400, detail="points_total cannot be negative")
    if points_total is not None and points_done > points_total:
        points_total = points_done

    points_changed = (
        payload.points_delta != 0
        or payload.points_done is not None
        or payload.points_total is not None
    )
    if points_changed:
        checkpoint["points_done"] = points_done
        checkpoint["points_total"] = points_total if points_total is not None else points_done

    if payload.status is not None:
        checkpoint["status"] = payload.status
    elif points_changed:
        existing_status = str(checkpoint.get("status") or "").lower()
        if existing_status != "blocked":
            if points_total is not None and points_total > 0 and points_done >= points_total:
                checkpoint["status"] = "done"
            elif points_done > 0:
                checkpoint["status"] = "active"
            elif existing_status not in ("done",):
                checkpoint["status"] = "pending"

    if payload.owner is not None:
        checkpoint["owner"] = payload.owner
    if payload.eta is not None:
        checkpoint["eta"] = payload.eta

    if payload.blockers is not None:
        if any(not isinstance(b, dict) for b in payload.blockers):
            raise HTTPException(status_code=400, detail="blockers must be list[object]")
        checkpoint["blockers"] = payload.blockers

    # ── Collect all commit SHAs from the various sources ───────────
    collected_shas: list[str] = []

    # 1. auto_head: resolve current HEAD
    if payload.auto_head:
        head = git_resolve_head()
        if head:
            collected_shas.append(head)

    # 2. Explicit single SHA
    if payload.commit_sha is not None:
        try:
            collected_shas.append(_validate_commit_sha(payload.commit_sha))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 3. Explicit SHA list
    if payload.append_commits:
        for raw_sha in payload.append_commits:
            try:
                collected_shas.append(_validate_commit_sha(raw_sha))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 4. Commit range expansion
    if payload.commit_range is not None:
        if not _COMMIT_RANGE_RE.match(payload.commit_range):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid commit range format: '{payload.commit_range}'. Expected 'sha..sha' or 'sha...sha'.",
            )
        expanded = git_rev_list(payload.commit_range)
        if not expanded:
            raise HTTPException(
                status_code=400,
                detail=f"Could not expand commit range '{payload.commit_range}'. Verify the range is valid and both commits exist.",
            )
        collected_shas.extend(expanded)

    # 5. Optional verification against the repository
    if payload.verify_commits and collected_shas:
        for sha in collected_shas:
            if not git_verify_commit(sha):
                raise HTTPException(
                    status_code=400,
                    detail=f"Commit not found in repository: '{sha}'",
                )

    # ── Build evidence items and merge ──────────────────────────────
    commit_evidence = [{"kind": "git_commit", "ref": sha} for sha in collected_shas]

    evidence_to_append: Optional[list] = None
    if payload.append_evidence is not None:
        evidence_to_append = list(payload.append_evidence)
    if commit_evidence:
        if evidence_to_append is None:
            evidence_to_append = []
        evidence_to_append.extend(commit_evidence)
    if evidence_to_append is not None:
        checkpoint["evidence"] = _merge_evidence(checkpoint.get("evidence"), evidence_to_append)

    # Primary commit SHA for audit events
    progress_commit_sha: Optional[str] = collected_shas[0] if collected_shas else None

    note_text = (payload.note or "").strip()
    last_update: Dict[str, Any] = {
        "at": utcnow().isoformat(),
        "by": principal.actor_display_name,
        "note": note_text,
    }
    if principal.is_agent:
        last_update["actor"] = principal.audit_dict()
    checkpoint["last_update"] = last_update
    new_checkpoint_summary = _checkpoint_progress_summary(checkpoint, payload.checkpoint_id)

    new_checkpoints = list(checkpoints)
    new_checkpoints[checkpoint_index] = checkpoint
    updates: Dict[str, Any] = {"checkpoints": new_checkpoints}
    if payload.sync_plan_stage:
        updates["stage"] = normalize_plan_stage(payload.checkpoint_id, strict=False)

    try:
        result = await update_plan(
            db, plan_id, updates, principal=principal,
            evidence_commit_sha=progress_commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await _record_plan_participant_from_principal(
        db,
        plan_id=plan_id,
        role="builder",
        action="log_progress",
        principal=principal,
        meta={
            "checkpoint_id": payload.checkpoint_id,
            "sync_plan_stage": bool(payload.sync_plan_stage),
        },
    )
    await _emit_plan_progress_notification(
        db,
        plan_id=plan_id,
        plan_title=(getattr(getattr(bundle, "doc", None), "title", None) or plan_id),
        checkpoint_id=payload.checkpoint_id,
        old_summary=old_checkpoint_summary,
        new_summary=new_checkpoint_summary,
        principal=principal,
    )
    await db.commit()

    return PlanProgressResponse(
        planId=result.plan_id,
        checkpointId=payload.checkpoint_id,
        checkpoint=checkpoint,
        changes=result.changes,
        revision=result.revision,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


class PlanDocumentEntry(BaseModel):
    id: str
    planId: str
    docType: str
    path: str
    title: str
    markdown: Optional[str] = None


class PlanDocumentsResponse(BaseModel):
    planId: str
    documents: List[PlanDocumentEntry] = Field(default_factory=list)


@router.get("/documents/{plan_id}", response_model=PlanDocumentsResponse)
async def get_plan_documents_endpoint(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    docs = await get_plan_documents(db, plan_id)
    return PlanDocumentsResponse(
        planId=plan_id,
        documents=[
            PlanDocumentEntry(
                id=str(d.id), planId=d.plan_id, docType=d.doc_type,
                path=d.path, title=d.title, markdown=d.markdown,
            )
            for d in docs
        ],
    )


# ── Archive / delete endpoints ───────────────────────────────────


class PlanArchiveRequest(BaseModel):
    commit_sha: Optional[str] = Field(None, description="Git commit SHA for traceability.")
    auto_head: bool = Field(False, description="Resolve HEAD as commit SHA.")


class PlanArchiveResponse(BaseModel):
    planId: str
    status: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/archive/{plan_id}", response_model=PlanArchiveResponse)
async def archive_plan_endpoint(
    plan_id: str,
    payload: PlanArchiveRequest,
    principal: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Archive a plan — hidden from default listings, recoverable via unarchive."""
    commit_sha = payload.commit_sha
    if payload.auto_head and commit_sha is None:
        commit_sha = git_resolve_head()
    if commit_sha:
        try:
            commit_sha = _validate_commit_sha(commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await archive_plan(
            db, plan_id, principal=principal, evidence_commit_sha=commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanArchiveResponse(planId=plan_id, status="archived", changes=result.changes)


class PlanUnarchiveRequest(BaseModel):
    restore_status: Literal["active", "parked"] = Field("active", description="Status to restore to.")
    commit_sha: Optional[str] = Field(None, description="Git commit SHA for traceability.")
    auto_head: bool = Field(False, description="Resolve HEAD as commit SHA.")


@router.post("/unarchive/{plan_id}", response_model=PlanArchiveResponse)
async def unarchive_plan_endpoint(
    plan_id: str,
    payload: PlanUnarchiveRequest,
    principal: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Unarchive a plan — restores to active or parked status."""
    commit_sha = payload.commit_sha
    if payload.auto_head and commit_sha is None:
        commit_sha = git_resolve_head()
    if commit_sha:
        try:
            commit_sha = _validate_commit_sha(commit_sha)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        result = await unarchive_plan(
            db, plan_id,
            restore_status=payload.restore_status,
            principal=principal, evidence_commit_sha=commit_sha,
        )
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanArchiveResponse(planId=plan_id, status=payload.restore_status, changes=result.changes)


@router.delete("/{plan_id}", response_model=DeleteResponse)
async def delete_plan_endpoint(
    plan_id: str,
    principal: CurrentAdminUser,
    hard: bool = Query(False, description="Permanently delete (irreversible). Default is soft-delete to 'removed' status."),
    db: AsyncSession = Depends(get_database),
):
    """Delete a plan.

    Soft delete (default): sets status to ``removed``, hidden from listings
    but recoverable by updating status back.

    Hard delete (``?hard=true``): permanently removes all plan data from the
    database including events, revisions, and companion documents.
    """
    try:
        result = await delete_plan(db, plan_id, hard=hard, principal=principal)
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return DeleteResponse(success=result.success, message=result.message)


# ── Catch-all: plan by ID (must be last) ─────────────────────────


@router.get("/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    from pixsim7.backend.main.services.docs.plan_write import load_children

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    children = await load_children(db, plan_id)

    summary = _bundle_to_summary(bundle, children=children)
    return PlanDetailResponse(
        **summary.model_dump(),
        planPath=bundle.plan.plan_path or "",
        markdown=bundle.doc.markdown or "",
    )


# ── Test coverage discovery ──────────────────────────────────────


