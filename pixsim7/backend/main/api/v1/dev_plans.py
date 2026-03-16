"""
Dev Plans API — DB-first plan management.

The DB (PlanRegistry) is the primary authority for plan state and content.
Filesystem markdown is a convenience export committed to git for history.
On first access, plans are auto-bootstrapped from filesystem into DB.
"""
from typing import Any, Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanEvent, PlanRegistry, PlanSyncRun
from pixsim7.backend.main.services.docs.plans import get_plans_index
from pixsim7.backend.main.services.docs.plan_sync import (
    PlanSyncLockedError,
    prune_plan_sync_history,
    sync_plans,
)
from pixsim7.backend.main.services.docs.plan_write import (
    PlanNotFoundError,
    PlanWriteError,
    get_active_assignment,
    get_plan_documents,
    get_plan_from_db,
    list_plans_from_db,
    update_plan,
)

router = APIRouter(prefix="/dev/plans", tags=["dev", "plans"])


# ── Response models ──────────────────────────────────────────────


class PlanSummary(BaseModel):
    """Compact plan entry for list responses."""
    id: str
    title: str
    status: str
    stage: str
    owner: str
    lastUpdated: str
    priority: str
    summary: str
    scope: str
    codePaths: List[str] = Field(default_factory=list)
    companions: List[str] = Field(default_factory=list)
    handoffs: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    dependsOn: List[str] = Field(default_factory=list)


class PlansIndexResponse(BaseModel):
    """All plans with manifest metadata."""
    version: str
    generatedAt: Optional[str] = None
    plans: List[PlanSummary] = Field(default_factory=list)


class PlanDetailResponse(PlanSummary):
    """Single plan with full markdown content."""
    planPath: str = ""
    markdown: str = ""


class PlanRegistryEntry(BaseModel):
    """DB-backed plan registry entry."""
    id: str
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


# ── Helpers ──────────────────────────────────────────────────────


def _entry_to_summary(entry) -> dict:
    return {
        "id": entry.id,
        "title": entry.title,
        "status": entry.status,
        "stage": entry.stage,
        "owner": entry.owner,
        "lastUpdated": entry.last_updated,
        "priority": entry.priority,
        "summary": entry.summary,
        "scope": entry.scope,
        "codePaths": entry.code_paths,
        "companions": entry.companions,
        "handoffs": entry.handoffs,
        "tags": entry.tags,
        "dependsOn": entry.depends_on,
    }


def _row_to_registry_entry(row: PlanRegistry) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "status": row.status,
        "stage": row.stage,
        "owner": row.owner,
        "revision": row.revision,
        "priority": row.priority,
        "summary": row.summary,
        "scope": row.scope,
        "codePaths": row.code_paths or [],
        "companions": row.companions or [],
        "handoffs": row.handoffs or [],
        "tags": row.tags or [],
        "dependsOn": row.depends_on or [],
        "manifestHash": row.manifest_hash,
        "lastSyncedAt": row.last_synced_at.isoformat() if row.last_synced_at else None,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
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


# ── DB-first endpoints ───────────────────────────────────────────


def _row_to_summary(row: PlanRegistry) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "status": row.status,
        "stage": row.stage,
        "owner": row.owner,
        "lastUpdated": row.updated_at.date().isoformat() if row.updated_at else "",
        "priority": row.priority,
        "summary": row.summary,
        "scope": row.scope,
        "planType": row.plan_type,
        "visibility": row.visibility,
        "target": row.target,
        "checkpoints": row.checkpoints,
        "codePaths": row.code_paths or [],
        "companions": row.companions or [],
        "handoffs": row.handoffs or [],
        "tags": row.tags or [],
        "dependsOn": row.depends_on or [],
    }


@router.get("", response_model=PlansIndexResponse)
async def list_plans(
    status: Optional[str] = Query(None, description="Filter by status (active, done, parked)"),
    owner: Optional[str] = Query(None, description="Filter by owner (substring match)"),
    refresh: bool = Query(False),
    db: AsyncSession = Depends(get_database),
):
    rows = await list_plans_from_db(db)

    plans = []
    for row in sorted(rows, key=lambda r: r.id):
        if status and row.status != status:
            continue
        if owner and owner.lower() not in row.owner.lower():
            continue
        plans.append(_row_to_summary(row))

    return {
        "version": "1",
        "generatedAt": None,
        "plans": plans,
    }


# ── DB-backed endpoints (before catch-all /{plan_id}) ────────────


@router.post("/sync", response_model=SyncResultResponse)
async def trigger_sync(
    _admin: CurrentAdminUser,
    commit_sha: Optional[str] = Query(None, description="Current git commit SHA"),
    db: AsyncSession = Depends(get_database),
):
    """Sync filesystem manifests into the DB, detecting and recording changes."""
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
        result = await prune_plan_sync_history(
            db,
            retention_days=days,
            dry_run=dry_run,
        )
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
    db: AsyncSession = Depends(get_database),
):
    row = await db.get(PlanSyncRun, run_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Sync run not found: {run_id}")
    return _run_to_entry(row)


@router.get("/registry", response_model=PlanRegistryListResponse)
async def list_registry(
    status: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_database),
):
    """List all plans from the DB registry."""
    stmt = select(PlanRegistry).order_by(PlanRegistry.id)
    if status:
        stmt = stmt.where(PlanRegistry.status == status)
    if owner:
        stmt = stmt.where(PlanRegistry.owner.ilike(f"%{owner}%"))

    rows = (await db.execute(stmt)).scalars().all()
    return {"plans": [_row_to_registry_entry(r) for r in rows]}


@router.get("/registry/{plan_id}", response_model=PlanRegistryEntry)
async def get_registry_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get a single plan from the DB registry."""
    row = await db.get(PlanRegistry, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")
    return _row_to_registry_entry(row)


@router.get("/registry/{plan_id}/events", response_model=PlanEventsResponse)
async def get_plan_events(
    plan_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    """Get the event audit trail for a specific plan."""
    row = await db.get(PlanRegistry, plan_id)
    if not row:
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
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
):
    """Unified activity feed across all plans."""
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    stmt = (
        select(PlanEvent)
        .where(PlanEvent.timestamp >= cutoff)
        .order_by(PlanEvent.timestamp.desc())
        .limit(limit)
    )
    events = (await db.execute(stmt)).scalars().all()

    # Batch-fetch plan titles
    plan_ids = {ev.plan_id for ev in events}
    titles: dict[str, str] = {}
    if plan_ids:
        rows = (
            await db.execute(
                select(PlanRegistry.id, PlanRegistry.title).where(
                    PlanRegistry.id.in_(plan_ids)
                )
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


class PlanUpdateRequest(BaseModel):
    """Partial update for plan fields."""
    status: Optional[str] = Field(None, description="active | parked | done | blocked")
    stage: Optional[str] = Field(None, description="Free-form stage label")
    owner: Optional[str] = Field(None, description="Owner / lane")
    priority: Optional[str] = Field(None, description="high | normal | low")
    summary: Optional[str] = Field(None, description="Plan summary")


class PlanUpdateResponse(BaseModel):
    planId: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


class AgentPlanDocument(BaseModel):
    docType: str
    path: str
    title: str
    markdown: Optional[str] = None


class AgentPlanContext(BaseModel):
    """Full plan context for an AI agent."""
    id: str
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
    """Compact plan summary for agent awareness of other plans."""
    id: str
    title: str
    status: str
    stage: str
    owner: str
    priority: str
    summary: str
    dependsOn: List[str] = Field(default_factory=list)


class AgentContextResponse(BaseModel):
    """Everything an AI agent needs to start working on a plan."""
    assignment: Optional[AgentPlanContext] = Field(
        None, description="The plan the agent should work on (highest priority active)"
    )
    activePlans: List[AgentPlanSummary] = Field(
        default_factory=list, description="All active plans for dependency awareness"
    )
    availableActions: List[Dict[str, str]] = Field(
        default_factory=list, description="API actions the agent can take"
    )


@router.patch("/update/{plan_id}", response_model=PlanUpdateResponse)
async def update_plan_endpoint(
    plan_id: str,
    payload: PlanUpdateRequest,
    _admin: CurrentAdminUser,
    db: AsyncSession = Depends(get_database),
):
    """Update plan status, stage, owner, priority, or summary.

    Writes to manifest.yaml, commits to git, and updates DB + events.
    """
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


@router.get("/agent-context", response_model=AgentContextResponse)
async def get_agent_context(
    plan_id: Optional[str] = Query(None, description="Request a specific plan instead of auto-assignment"),
    db: AsyncSession = Depends(get_database),
):
    """Full context for an AI agent to work on a plan.

    Returns:
    - **assignment**: The plan to work on (with full markdown + companion/handoff docs)
    - **activePlans**: All active plans for dependency awareness
    - **availableActions**: API endpoints the agent can call to update plan state
    """
    # Get all plans from DB (auto-bootstraps if needed)
    all_rows = await list_plans_from_db(db)

    # Active plans summary
    active_plans = [
        AgentPlanSummary(
            id=r.id, title=r.title, status=r.status, stage=r.stage,
            owner=r.owner, priority=r.priority, summary=r.summary,
            dependsOn=r.depends_on or [],
        )
        for r in all_rows if r.status == "active"
    ]

    # Determine assignment
    assignment: Optional[AgentPlanContext] = None

    if plan_id:
        target = next((r for r in all_rows if r.id == plan_id), None)
    else:
        # Auto-assign: highest priority active plan
        priority_rank = {"high": 0, "normal": 1, "low": 2}
        candidates = [r for r in all_rows if r.status == "active"]
        candidates.sort(key=lambda r: (
            priority_rank.get(r.priority, 1),
            r.updated_at.isoformat() if r.updated_at else "",
        ))
        target = candidates[0] if candidates else None

    if target:
        docs = await get_plan_documents(db, target.id)
        assignment = AgentPlanContext(
            id=target.id,
            title=target.title,
            status=target.status,
            stage=target.stage,
            owner=target.owner,
            priority=target.priority,
            summary=target.summary,
            markdown=target.markdown,
            codePaths=target.code_paths or [],
            companions=target.companions or [],
            handoffs=target.handoffs or [],
            tags=target.tags or [],
            dependsOn=target.depends_on or [],
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
                "action": "update_status",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"status": "active|parked|done|blocked"}',
                "description": "Change plan status (moves directory on disk + git commit)",
            },
            {
                "action": "update_stage",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"stage": "free-form stage label"}',
                "description": "Update plan stage to reflect progress",
            },
            {
                "action": "update_priority",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"priority": "high|normal|low"}',
                "description": "Change plan priority",
            },
            {
                "action": "update_markdown",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"markdown": "full plan markdown content"}',
                "description": "Update plan prose content",
            },
            {
                "action": "get_documents",
                "method": "GET",
                "url": "/dev/plans/documents/{plan_id}",
                "description": "Fetch companion and handoff documents for a plan",
            },
        ],
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
    db: AsyncSession = Depends(get_database),
):
    """Get companion and handoff documents for a plan."""
    docs = await get_plan_documents(db, plan_id)
    return PlanDocumentsResponse(
        planId=plan_id,
        documents=[
            PlanDocumentEntry(
                id=str(d.id),
                planId=d.plan_id,
                docType=d.doc_type,
                path=d.path,
                title=d.title,
                markdown=d.markdown,
            )
            for d in docs
        ],
    )


# ── Catch-all: plan by ID (DB-first, must be last) ──────────────


@router.get("/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_database),
):
    row = await get_plan_from_db(db, plan_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    return {
        **_row_to_summary(row),
        "planPath": row.plan_path or "",
        "markdown": row.markdown or "",
    }
