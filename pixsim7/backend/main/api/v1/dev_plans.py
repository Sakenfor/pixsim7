"""
Dev Plans API — DB-first plan management.

Plans are backed by Document (shared fields) + PlanRegistry (plan-specific fields).
The DB is authoritative. Filesystem markdown is a convenience export.
"""
from typing import Any, Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanEvent, PlanRegistry, PlanSyncRun
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.services.docs.plans import get_plans_index
from pixsim7.backend.main.services.docs.plan_sync import (
    PlanSyncLockedError,
    prune_plan_sync_history,
    sync_plans,
)
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    PlanNotFoundError,
    PlanWriteError,
    export_plan_to_disk,
    get_active_assignment,
    get_plan_bundle,
    get_plan_documents,
    list_plan_bundles,
    make_document_id,
    update_plan,
)

router = APIRouter(prefix="/dev/plans", tags=["dev", "plans"])


# ── Response models ──────────────────────────────────────────────


class PlanChildSummary(BaseModel):
    """Minimal child plan reference."""
    id: str
    title: str
    status: str
    stage: str
    priority: str


class PlanSummary(BaseModel):
    """Compact plan entry for list responses."""
    id: str
    documentId: Optional[str] = None
    parentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    lastUpdated: str
    priority: str
    summary: str
    scope: str
    planType: str = "feature"
    visibility: str = "public"
    target: Optional[Dict] = None
    checkpoints: Optional[List[Dict]] = None
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    children: List[PlanChildSummary] = Field(default_factory=list)


class PlansIndexResponse(BaseModel):
    version: str
    generatedAt: Optional[str] = None
    plans: List[PlanSummary] = Field(default_factory=list)


class PlanDetailResponse(PlanSummary):
    planPath: str = ""
    markdown: str = ""


class PlanRegistryEntry(BaseModel):
    id: str
    documentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    revision: int
    priority: str
    summary: str
    scope: str
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    manifestHash: str = ""
    lastSyncedAt: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class PlanRegistryListResponse(BaseModel):
    plans: List[PlanRegistryEntry] = Field(default_factory=list)


class PlanEventEntry(BaseModel):
    id: str
    runId: Optional[str] = None
    planId: str
    eventType: str
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    commitSha: Optional[str] = None
    timestamp: str


class PlanEventsResponse(BaseModel):
    planId: str
    events: List[PlanEventEntry] = Field(default_factory=list)


class PlanActivityEntry(BaseModel):
    runId: Optional[str] = None
    planId: str
    planTitle: str
    eventType: str
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    commitSha: Optional[str] = None
    timestamp: str


class PlanActivityResponse(BaseModel):
    events: List[PlanActivityEntry] = Field(default_factory=list)


class SyncResultResponse(BaseModel):
    runId: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    durationMs: Optional[int] = None
    changedFields: Dict[str, int] = Field(default_factory=dict)
    details: List[Dict[str, Any]] = Field(default_factory=list)


class PlanSyncRunEntry(BaseModel):
    id: str
    status: str
    startedAt: str
    finishedAt: Optional[str] = None
    durationMs: Optional[int] = None
    commitSha: Optional[str] = None
    actor: Optional[str] = None
    errorMessage: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    changedFields: Dict[str, int] = Field(default_factory=dict)


class PlanSyncRunsResponse(BaseModel):
    runs: List[PlanSyncRunEntry] = Field(default_factory=list)


class PlanSyncRetentionResponse(BaseModel):
    dryRun: bool
    retentionDays: int
    cutoff: str
    eventsDeleted: int
    runsDeleted: int


class PlanRuntimeSettingsResponse(BaseModel):
    plansDbOnlyMode: bool
    source: str = "runtime"


class PlanRuntimeSettingsUpdateRequest(BaseModel):
    plans_db_only_mode: bool = Field(..., description="Toggle DB-only plan mode for this running backend instance.")


# ── Helpers ──────────────────────────────────────────────────────


def _bundle_to_summary(b: PlanBundle, children: Optional[List[PlanBundle]] = None) -> dict:
    """Build summary dict from PlanBundle (Document + PlanRegistry)."""
    doc, plan = b.doc, b.plan
    result = {
        "id": plan.id,
        "documentId": doc.id,
        "parentId": plan.parent_id,
        "title": doc.title,
        "status": doc.status,
        "stage": plan.stage,
        "owner": doc.owner,
        "lastUpdated": (plan.updated_at or doc.updated_at).date().isoformat() if (plan.updated_at or doc.updated_at) else "",
        "priority": plan.priority,
        "summary": doc.summary or "",
        "scope": plan.scope,
        "planType": plan.plan_type,
        "visibility": doc.visibility,
        "target": plan.target,
        "checkpoints": plan.checkpoints,
        "codePaths": plan.code_paths or [],
        "companions": plan.companions or [],
        "handoffs": plan.handoffs or [],
        "tags": doc.tags or [],
        "dependsOn": plan.depends_on or [],
        "children": [],
    }
    if children:
        result["children"] = [
            {
                "id": c.id,
                "title": c.doc.title,
                "status": c.doc.status,
                "stage": c.plan.stage,
                "priority": c.plan.priority,
            }
            for c in children
        ]
    return result


def _bundle_to_registry_entry(b: PlanBundle) -> dict:
    doc, plan = b.doc, b.plan
    return {
        "id": plan.id,
        "documentId": doc.id,
        "title": doc.title,
        "status": doc.status,
        "stage": plan.stage,
        "owner": doc.owner,
        "revision": doc.revision,
        "priority": plan.priority,
        "summary": doc.summary or "",
        "scope": plan.scope,
        "codePaths": plan.code_paths or [],
        "companions": plan.companions or [],
        "handoffs": plan.handoffs or [],
        "tags": doc.tags or [],
        "dependsOn": plan.depends_on or [],
        "manifestHash": plan.manifest_hash,
        "lastSyncedAt": plan.last_synced_at.isoformat() if plan.last_synced_at else None,
        "createdAt": plan.created_at.isoformat() if plan.created_at else None,
        "updatedAt": plan.updated_at.isoformat() if plan.updated_at else None,
    }


def _event_to_entry(ev: PlanEvent, plan_title: str = "") -> dict:
    return {
        "id": str(ev.id),
        "runId": str(ev.run_id) if ev.run_id else None,
        "planId": ev.plan_id,
        "planTitle": plan_title,
        "eventType": ev.event_type,
        "field": ev.field,
        "oldValue": ev.old_value,
        "newValue": ev.new_value,
        "commitSha": ev.commit_sha,
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else "",
    }


def _run_to_entry(run: PlanSyncRun) -> dict:
    return {
        "id": str(run.id),
        "status": run.status,
        "startedAt": run.started_at.isoformat() if run.started_at else "",
        "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
        "durationMs": run.duration_ms,
        "commitSha": run.commit_sha,
        "actor": run.actor,
        "errorMessage": run.error_message,
        "created": run.created or 0,
        "updated": run.updated or 0,
        "removed": run.removed or 0,
        "unchanged": run.unchanged or 0,
        "events": run.events or 0,
        "changedFields": run.changed_fields or {},
    }


# ── List endpoint ─────────────────────────────────────────────────


@router.get("", response_model=PlansIndexResponse)
async def list_plans(
    _user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status (active, done, parked)"),
    owner: Optional[str] = Query(None, description="Filter by owner (substring match)"),
    refresh: bool = Query(False),
    db: AsyncSession = Depends(get_database),
):
    bundles = await list_plan_bundles(db)

    # Build parent->children index
    children_map: dict[str, list[PlanBundle]] = {}
    for b in bundles:
        pid = b.plan.parent_id
        if pid:
            children_map.setdefault(pid, []).append(b)

    plans = []
    for b in sorted(bundles, key=lambda b: b.id):
        if status and b.doc.status != status:
            continue
        if owner and owner.lower() not in b.doc.owner.lower():
            continue
        plans.append(_bundle_to_summary(b, children=children_map.get(b.id)))

    return {
        "version": "1",
        "generatedAt": None,
        "plans": plans,
    }


# ── Sync endpoints ────────────────────────────────────────────────


@router.post("/sync", response_model=SyncResultResponse)
async def trigger_sync(
    _admin: CurrentAdminUser,
    commit_sha: Optional[str] = Query(None, description="Current git commit SHA"),
    db: AsyncSession = Depends(get_database),
):
    if settings.plans_db_only_mode:
        raise HTTPException(
            status_code=409,
            detail="Plan manifest sync is disabled in DB-only mode.",
        )

    actor_id = getattr(_admin, "id", None)
    actor = f"user:{actor_id}" if actor_id is not None else "user:unknown"
    try:
        result = await sync_plans(db, commit_sha=commit_sha, actor=actor)
    except PlanSyncLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "runId": result.run_id,
        "created": result.created,
        "updated": result.updated,
        "removed": result.removed,
        "unchanged": result.unchanged,
        "events": result.events,
        "durationMs": result.duration_ms,
        "changedFields": result.changed_fields,
        "details": result.details,
    }


@router.get("/sync-runs", response_model=PlanSyncRunsResponse)
async def list_sync_runs(
    _user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by run status (success, failed, running)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    stmt = select(PlanSyncRun).order_by(PlanSyncRun.started_at.desc()).offset(offset).limit(limit)
    if status:
        stmt = stmt.where(PlanSyncRun.status == status)

    rows = (await db.execute(stmt)).scalars().all()
    return {"runs": [_run_to_entry(row) for row in rows]}


@router.post("/sync-runs/retention", response_model=PlanSyncRetentionResponse)
async def run_sync_retention(
    _admin: CurrentAdminUser,
    days: int = Query(90, ge=1, le=3650, description="Retention window in days"),
    dry_run: bool = Query(True, description="Preview deletions without applying changes"),
    db: AsyncSession = Depends(get_database),
):
    try:
        result = await prune_plan_sync_history(db, retention_days=days, dry_run=dry_run)
    except PlanSyncLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "dryRun": result.dry_run,
        "retentionDays": result.retention_days,
        "cutoff": result.cutoff,
        "eventsDeleted": result.events_deleted,
        "runsDeleted": result.runs_deleted,
    }


@router.get("/sync-runs/{run_id}", response_model=PlanSyncRunEntry)
async def get_sync_run(
    run_id: UUID,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    row = await db.get(PlanSyncRun, run_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Sync run not found: {run_id}")
    return _run_to_entry(row)


# ── Registry endpoints ────────────────────────────────────────────


@router.get("/registry", response_model=PlanRegistryListResponse)
async def list_registry(
    _user: CurrentUser,
    status: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_database),
):
    bundles = await list_plan_bundles(db)
    result = []
    for b in sorted(bundles, key=lambda b: b.id):
        if status and b.doc.status != status:
            continue
        if owner and owner.lower() not in b.doc.owner.lower():
            continue
        result.append(_bundle_to_registry_entry(b))
    return {"plans": result}


@router.get("/registry/{plan_id}", response_model=PlanRegistryEntry)
async def get_registry_plan(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")
    return _bundle_to_registry_entry(bundle)


@router.get("/registry/{plan_id}/events", response_model=PlanEventsResponse)
async def get_plan_events(
    plan_id: str,
    _user: CurrentUser,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    plan = await db.get(PlanRegistry, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")

    stmt = (
        select(PlanEvent)
        .where(PlanEvent.plan_id == plan_id)
        .order_by(PlanEvent.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    events = (await db.execute(stmt)).scalars().all()

    return {
        "planId": plan_id,
        "events": [
            {
                "id": str(ev.id),
                "runId": str(ev.run_id) if ev.run_id else None,
                "planId": ev.plan_id,
                "eventType": ev.event_type,
                "field": ev.field,
                "oldValue": ev.old_value,
                "newValue": ev.new_value,
                "commitSha": ev.commit_sha,
                "timestamp": ev.timestamp.isoformat() if ev.timestamp else "",
            }
            for ev in events
        ],
    }


@router.get("/activity", response_model=PlanActivityResponse)
async def get_activity(
    _user: CurrentUser,
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
):
    from datetime import datetime, timedelta, timezone
    from pixsim7.backend.main.domain.docs.models import Document

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    stmt = (
        select(PlanEvent)
        .where(PlanEvent.timestamp >= cutoff)
        .order_by(PlanEvent.timestamp.desc())
        .limit(limit)
    )
    events = (await db.execute(stmt)).scalars().all()

    # Batch-fetch plan titles from Documents via PlanRegistry
    plan_ids = {ev.plan_id for ev in events}
    titles: dict[str, str] = {}
    if plan_ids:
        rows = (
            await db.execute(
                select(PlanRegistry.id, Document.title)
                .join(Document, PlanRegistry.document_id == Document.id)
                .where(PlanRegistry.id.in_(plan_ids))
            )
        ).all()
        titles = {r[0]: r[1] for r in rows}

    return {
        "events": [
            _event_to_entry(ev, titles.get(ev.plan_id, ev.plan_id))
            for ev in events
        ],
    }


# ── Write endpoints ──────────────────────────────────────────────


class PlanCreateRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=120, description="Unique plan ID (slug)")
    title: str = Field(..., min_length=1, max_length=255)
    plan_type: str = Field("feature", description="proposal | feature | bugfix | refactor | exploration | task")
    status: str = Field("active", description="active | parked | done | blocked")
    stage: str = Field("proposed", description="Free-form stage label")
    owner: str = Field("unassigned", description="Owner / lane")
    priority: str = Field("normal", description="high | normal | low")
    summary: str = Field("", description="Plan summary")
    markdown: Optional[str] = Field(None, description="Plan content")
    task_scope: str = Field("plan", description="plan | user | system")
    visibility: str = Field("public", description="private | shared | public")
    tags: Optional[List[str]] = Field(None)
    code_paths: Optional[List[str]] = Field(None)
    companions: Optional[List[str]] = Field(None)
    handoffs: Optional[List[str]] = Field(None)
    depends_on: Optional[List[str]] = Field(None)
    parent_id: Optional[str] = Field(None, description="Parent plan ID for sub-plans")


class PlanCreateResponse(BaseModel):
    planId: str
    documentId: str
    created: bool
    commitSha: Optional[str] = None


@router.post("", response_model=PlanCreateResponse)
async def create_plan(
    payload: PlanCreateRequest,
    _admin: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Create a new plan: Document (shared fields) + PlanRegistry (plan-specific)."""
    from pixsim7.backend.main.domain.docs.models import Document, PlanRegistry
    from pixsim7.backend.main.services.docs.plan_write import _git_commit
    from pixsim7.backend.main.shared.datetime_utils import utcnow

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
        user_id=getattr(_admin, "id", None),
        visibility=payload.visibility,
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
        code_paths=payload.code_paths or [],
        companions=payload.companions or [],
        handoffs=payload.handoffs or [],
        depends_on=payload.depends_on or [],
        scope=payload.status if payload.status in ("active", "done", "parked") else "active",
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    await db.commit()

    # Optional export to filesystem + git for dev plans
    commit_sha = None
    if payload.task_scope == "plan" and not settings.plans_db_only_mode:
        try:
            bundle = PlanBundle(plan=plan, doc=doc)
            paths = export_plan_to_disk(bundle)
            actor_id = getattr(_admin, "id", None)
            commit_sha = _git_commit(paths, f"plan({payload.id}): created\n\nActor: user:{actor_id}")
        except Exception:
            pass  # DB is the authority

    return PlanCreateResponse(planId=plan.id, documentId=doc_id, created=True, commitSha=commit_sha)


class PlanUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Plan title")
    status: Optional[str] = Field(None, description="active | parked | done | blocked")
    stage: Optional[str] = Field(None, description="Free-form stage label")
    owner: Optional[str] = Field(None, description="Owner / lane")
    priority: Optional[str] = Field(None, description="high | normal | low")
    summary: Optional[str] = Field(None, description="Plan summary")
    markdown: Optional[str] = Field(None, description="Plan markdown content")
    visibility: Optional[str] = Field(None, description="private | shared | public")
    tags: Optional[List[str]] = Field(None)
    code_paths: Optional[List[str]] = Field(None)
    companions: Optional[List[str]] = Field(None)
    handoffs: Optional[List[str]] = Field(None)
    depends_on: Optional[List[str]] = Field(None)


class PlanUpdateResponse(BaseModel):
    planId: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


@router.patch("/update/{plan_id}", response_model=PlanUpdateResponse)
async def update_plan_endpoint(
    plan_id: str,
    payload: PlanUpdateRequest,
    _admin: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    actor_id = getattr(_admin, "id", None)
    actor = f"user:{actor_id}" if actor_id is not None else "user:unknown"

    try:
        result = await update_plan(db, plan_id, updates, actor=actor)
    except PlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlanUpdateResponse(
        planId=result.plan_id,
        changes=result.changes,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


# ── Agent context ─────────────────────────────────────────────────


class AgentPlanDocument(BaseModel):
    docType: str
    path: str
    title: str
    markdown: Optional[str] = None


class AgentPlanContext(BaseModel):
    id: str
    documentId: Optional[str] = None
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    markdown: Optional[str] = None
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)
    documents: List[AgentPlanDocument] = Field(default_factory=list)


class AgentPlanSummary(BaseModel):
    id: str
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    dependsOn: List[str] = Field(default_factory=list)


class AgentContextResponse(BaseModel):
    assignment: Optional[AgentPlanContext] = None
    activePlans: List[AgentPlanSummary] = Field(default_factory=list)
    availableActions: List[Dict[str, str]] = Field(default_factory=list)
    discovery: Dict[str, str] = Field(
        default_factory=lambda: {
            "metaContracts": "/api/v1/meta/contracts",
            "hint": "GET /api/v1/meta/contracts for full API surface discovery across all domains (prompts, blocks, plans, codegen, ui, assistant).",
        }
    )


@router.get("/agent-context", response_model=AgentContextResponse)
async def get_agent_context(
    _user: CurrentUser,
    plan_id: Optional[str] = Query(None, description="Request a specific plan instead of auto-assignment"),
    db: AsyncSession = Depends(get_database),
):
    all_bundles = await list_plan_bundles(db)

    active_plans = [
        AgentPlanSummary(
            id=b.id, title=b.doc.title, status=b.doc.status, stage=b.plan.stage,
            owner=b.doc.owner, priority=b.plan.priority, summary=b.doc.summary or "",
            dependsOn=b.plan.depends_on or [],
        )
        for b in all_bundles if b.doc.status == "active"
    ]

    assignment: Optional[AgentPlanContext] = None

    if plan_id:
        target = next((b for b in all_bundles if b.id == plan_id), None)
    else:
        priority_rank = {"high": 0, "normal": 1, "low": 2}
        candidates = [b for b in all_bundles if b.doc.status == "active"]
        candidates.sort(key=lambda b: (
            priority_rank.get(b.plan.priority, 1),
            b.plan.updated_at.isoformat() if b.plan.updated_at else "",
        ))
        target = candidates[0] if candidates else None

    if target:
        docs = await get_plan_documents(db, target.id)
        assignment = AgentPlanContext(
            id=target.id,
            documentId=target.document_id,
            title=target.doc.title,
            status=target.doc.status,
            stage=target.plan.stage,
            owner=target.doc.owner,
            priority=target.plan.priority,
            summary=target.doc.summary or "",
            markdown=target.doc.markdown,
            codePaths=target.plan.code_paths or [],
            companions=target.plan.companions or [],
            handoffs=target.plan.handoffs or [],
            tags=target.doc.tags or [],
            dependsOn=target.plan.depends_on or [],
            documents=[
                AgentPlanDocument(
                    docType=d.doc_type, path=d.path,
                    title=d.title, markdown=d.markdown,
                )
                for d in docs
            ],
        )

    return AgentContextResponse(
        assignment=assignment,
        activePlans=active_plans,
        availableActions=[
            {
                "action": "create_plan",
                "method": "POST",
                "url": "/dev/plans",
                "body": '{"id": "slug", "title": "...", "summary": "...", "markdown": "...", "plan_type": "feature|bugfix|refactor|exploration|task", "status": "active", "stage": "proposed", "owner": "unassigned", "priority": "normal", "parent_id": null, "tags": [], "code_paths": [], "companions": [], "handoffs": [], "depends_on": []}',
                "description": "Create a new plan (Document + PlanRegistry). Use parent_id to create sub-plans under an initiative.",
            },
            {
                "action": "update_status",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"status": "active|parked|done|blocked"}',
                "description": "Change plan status (moves directory on disk + git commit)",
            },
            {
                "action": "update_fields",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"title": "...", "status": "active|parked|done|blocked", "stage": "...", "priority": "high|normal|low", "owner": "...", "summary": "...", "visibility": "public|shared|private", "tags": [], "code_paths": [], "companions": [], "handoffs": [], "depends_on": []}',
                "description": "Update any combination of plan fields in a single call",
            },
            {
                "action": "update_markdown",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"markdown": "full plan markdown content"}',
                "description": "Update plan prose content",
            },
            {
                "action": "list_plans",
                "method": "GET",
                "url": "/dev/plans?status=active",
                "description": "List all plans, optionally filtered by status or owner",
            },
            {
                "action": "get_plan",
                "method": "GET",
                "url": "/dev/plans/{plan_id}",
                "description": "Get full plan detail with markdown, checkpoints, children",
            },
            {
                "action": "get_documents",
                "method": "GET",
                "url": "/dev/plans/documents/{plan_id}",
                "description": "Fetch companion and handoff documents for a plan",
            },
        ],
    )


# ── Plan documents endpoint ───────────────────────────────────────


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

    return {
        **_bundle_to_summary(bundle, children=children),
        "planPath": bundle.plan.plan_path or "",
        "markdown": bundle.doc.markdown or "",
    }
