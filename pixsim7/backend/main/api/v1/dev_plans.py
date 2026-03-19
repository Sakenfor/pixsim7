"""
Dev Plans API — DB-first plan management.

Plans are backed by Document (shared fields) + PlanRegistry (plan-specific fields).
The DB is authoritative. Filesystem markdown is a convenience export.
"""
import re
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanEvent, PlanRegistry, PlanSyncRun
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
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
    _status_to_scope,
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
    update_plan,
)
from pixsim_logging import get_logger

logger = get_logger()

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
    namespace: Optional[str] = None
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
    namespace: Optional[str] = None
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
    actor: Optional[str] = None
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
    actor: Optional[str] = None
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
    forgeCommitUrlTemplate: Optional[str] = Field(
        None,
        description='Commit URL template derived from git remote, e.g. "https://github.com/org/repo/commit/{sha}".',
    )


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
        "namespace": doc.namespace,
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
        "namespace": doc.namespace,
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
        "actor": ev.actor,
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


CHECKPOINT_STATUSES = frozenset({"pending", "active", "done", "blocked"})

_GIT_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")
_COMMIT_RANGE_RE = re.compile(r"^[0-9a-fA-F]{7,40}\.\.\.?[0-9a-fA-F]{7,40}$")


def _validate_commit_sha(sha: str) -> str:
    """Validate a git commit SHA (7-40 hex chars). Returns lowercase."""
    sha = sha.strip()
    if not _GIT_SHA_RE.match(sha):
        raise ValueError(
            f"Invalid commit SHA format: '{sha}'. Expected 7-40 hex characters."
        )
    return sha.lower()


def _checkpoint_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    return value if isinstance(value, int) else None


def _derive_checkpoint_points(checkpoint: Dict[str, Any]) -> tuple[int, Optional[int]]:
    """Resolve points from explicit fields, or fall back to step checkboxes."""
    points_done = _checkpoint_int(checkpoint.get("points_done"))
    points_total = _checkpoint_int(checkpoint.get("points_total"))

    steps = checkpoint.get("steps")
    if isinstance(steps, list):
        step_dicts = [s for s in steps if isinstance(s, dict)]
        if points_total is None:
            points_total = len(step_dicts)
        if points_done is None:
            points_done = sum(1 for s in step_dicts if bool(s.get("done")))

    if points_done is None:
        points_done = 0
    return points_done, points_total


def _normalize_evidence_ref(item: Any) -> Optional[Dict[str, str]]:
    """Normalize an evidence item to ``{"kind": ..., "ref": ...}`` form.

    Accepts:
    - ``str`` (legacy file path) → ``{"kind": "file_path", "ref": "..."}``
    - ``{"kind": "test_suite", "ref": "suite-id"}`` → pass-through
    - ``{"kind": "file_path", "ref": "path/to/file"}`` → pass-through
    """
    if isinstance(item, str):
        text = item.strip()
        return {"kind": "file_path", "ref": text} if text else None
    if isinstance(item, dict) and item.get("ref"):
        kind = item.get("kind", "file_path")
        ref = str(item["ref"]).strip()
        if not ref:
            return None
        return {"kind": kind, "ref": ref}
    return None


def _evidence_key(ref: Dict[str, str]) -> str:
    return f"{ref['kind']}:{ref['ref']}"


def _merge_evidence(existing: Any, appends: Optional[list]) -> List[Dict[str, str]]:
    """Merge evidence refs, deduplicating by kind+ref.

    Backward-compatible: bare strings in ``existing`` are promoted to
    ``{"kind": "file_path", "ref": "..."}`` on read.
    """
    out: List[Dict[str, str]] = []
    seen: set[str] = set()

    for item in (existing if isinstance(existing, list) else []):
        ref = _normalize_evidence_ref(item)
        if ref is None:
            continue
        key = _evidence_key(ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)

    for item in appends or []:
        ref = _normalize_evidence_ref(item)
        if ref is None:
            continue
        key = _evidence_key(ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)

    return out


@router.get("", response_model=PlansIndexResponse)
async def list_plans(
    _user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status (active, done, parked)"),
    owner: Optional[str] = Query(None, description="Filter by owner (substring match)"),
    namespace: Optional[str] = Query(None, description="Filter by namespace"),
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
        if namespace and b.doc.namespace != namespace:
            continue
        plans.append(_bundle_to_summary(b, children=children_map.get(b.id)))

    return {
        "version": "1",
        "generatedAt": None,
        "plans": plans,
    }


# ── Sync endpoints ────────────────────────────────────────────────
@router.get("/settings", response_model=PlanRuntimeSettingsResponse)
async def get_plan_runtime_settings(
    _user: CurrentUser,
):
    return {
        "plansDbOnlyMode": settings.plans_db_only_mode,
        "source": "runtime",
        "forgeCommitUrlTemplate": git_forge_commit_url_template(),
    }


@router.patch("/settings", response_model=PlanRuntimeSettingsResponse)
async def update_plan_runtime_settings(
    payload: PlanRuntimeSettingsUpdateRequest,
    _admin: CurrentAdminUser,
):
    settings.plans_db_only_mode = payload.plans_db_only_mode
    return {"plansDbOnlyMode": settings.plans_db_only_mode, "source": "runtime"}


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
                "actor": ev.actor,
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
    plan_type: Literal["proposal", "feature", "bugfix", "refactor", "exploration", "task"] = Field(
        "feature", description="proposal | feature | bugfix | refactor | exploration | task"
    )
    status: Literal["active", "parked", "done", "blocked"] = Field(
        "active", description="active | parked | done | blocked"
    )
    stage: str = Field("proposed", description="Free-form stage label")
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


class PlanCreateResponse(BaseModel):
    planId: str
    documentId: str
    created: bool
    commitSha: Optional[str] = None
    exportError: Optional[str] = None


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
        companions=payload.companions or [],
        handoffs=payload.handoffs or [],
        depends_on=payload.depends_on or [],
        scope=_status_to_scope(payload.status),
        created_at=now,
        updated_at=now,
    )
    db.add(plan)

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
    stage: Optional[str] = Field(None, description="Free-form stage label")
    owner: Optional[str] = Field(None, description="Owner / lane")
    priority: Optional[str] = Field(None, description="high | normal | low")
    task_scope: Optional[str] = Field(None, description="plan | user | system")
    plan_type: Optional[str] = Field(None, description="proposal | feature | bugfix | refactor | exploration | task")
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
    checkpoints: Optional[List[Dict[str, Any]]] = Field(None, description="Structured checkpoints list.")
    patch: Optional[Dict[str, Any]] = Field(
        None,
        description="Raw mutable-field patch map. Merged with explicit fields; explicit fields win.",
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


class PlanUpdateResponse(BaseModel):
    planId: str
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


@router.patch("/update/{plan_id}", response_model=PlanUpdateResponse)
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

    updates: Dict[str, Any] = {}
    if isinstance(raw_patch, dict):
        updates.update(raw_patch)

    updates.update({k: v for k, v in payload_data.items() if v is not None})
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        result = await update_plan(
            db, plan_id, updates, principal=principal,
            evidence_commit_sha=request_commit_sha,
        )
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
        description="When true, set plan.stage to checkpoint_id in the same update.",
    )


class PlanProgressResponse(BaseModel):
    planId: str
    checkpointId: str
    checkpoint: Dict[str, Any] = Field(default_factory=dict)
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    commitSha: Optional[str] = None
    newScope: Optional[str] = None


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
            detail="Plan has no checkpoints. Seed checkpoints via /dev/plans/update/{plan_id} first.",
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

    new_checkpoints = list(checkpoints)
    new_checkpoints[checkpoint_index] = checkpoint
    updates: Dict[str, Any] = {"checkpoints": new_checkpoints}
    if payload.sync_plan_stage:
        updates["stage"] = payload.checkpoint_id

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

    return PlanProgressResponse(
        planId=result.plan_id,
        checkpointId=payload.checkpoint_id,
        checkpoint=checkpoint,
        changes=result.changes,
        commitSha=result.commit_sha,
        newScope=result.new_scope,
    )


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
    namespace: Optional[str] = None
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
    namespace: Optional[str] = None
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
            namespace=b.doc.namespace,
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
            namespace=target.doc.namespace,
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
                "body": '{"id": "slug", "title": "...", "summary": "...", "markdown": "...", "namespace": "dev/plans", "plan_type": "feature|bugfix|refactor|exploration|task", "task_scope": "plan|user|system", "status": "active", "stage": "proposed", "owner": "unassigned", "priority": "normal", "parent_id": null, "target": {}, "checkpoints": [], "tags": [], "code_paths": [], "companions": [], "handoffs": [], "depends_on": []}',
                "description": "Create a new plan (Document + PlanRegistry). Use parent_id to create sub-plans under an initiative.",
            },
            {
                "action": "get_plan_settings",
                "method": "GET",
                "url": "/dev/plans/settings",
                "description": "Read runtime plan mode settings (DB-only mode).",
            },
            {
                "action": "set_plan_settings",
                "method": "PATCH",
                "url": "/dev/plans/settings",
                "body": '{"plans_db_only_mode": true}',
                "description": "Toggle runtime DB-only mode for the current backend process (admin).",
            },
            {
                "action": "update_status",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"status": "active|parked|done|blocked"}',
                "description": "Change plan status.",
            },
            {
                "action": "update_fields",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"title": "...", "status": "active|parked|done|blocked", "stage": "...", "priority": "high|normal|low", "task_scope": "plan|user|system", "plan_type": "feature|bugfix|refactor|exploration|task", "owner": "...", "summary": "...", "visibility": "public|shared|private", "namespace": "dev/plans", "target": {}, "checkpoints": [], "tags": [], "code_paths": [], "companions": [], "handoffs": [], "depends_on": []}',
                "description": "Update any combination of plan fields in a single call",
            },
            {
                "action": "patch_fields",
                "method": "PATCH",
                "url": "/dev/plans/update/{plan_id}",
                "body": '{"patch": {"target": {"type": "system", "id": "agent-infra"}, "checkpoints": [{"id": "phase_1", "label": "Phase 1", "status": "active"}]}}',
                "description": "Generic patch map for mutable fields (explicit fields in body override patch keys).",
            },
            {
                "action": "log_progress",
                "method": "POST",
                "url": "/dev/plans/progress/{plan_id}",
                "body": '{"checkpoint_id": "phase_1", "points_delta": 1, "note": "implemented API scaffolding", "commit_sha": "a1b2c3d4e5f6", "append_commits": [], "commit_range": null, "auto_head": false, "verify_commits": false, "append_evidence": [{"kind": "test_suite", "ref": "my-feature-tests"}, "pixsim7/backend/tests/api/test_feature.py"]}',
                "description": "Apply checkpoint progress deltas and metadata. Commit traceability: commit_sha (single), append_commits (list), commit_range ('sha..sha' auto-expanded), auto_head (resolve HEAD), verify_commits (check SHAs exist). All commit sources auto-convert to git_commit evidence.",
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


# ── Test coverage discovery ──────────────────────────────────────


class CoverageSuiteMatch(BaseModel):
    suite_id: str
    suite_label: str
    kind: Optional[str] = None
    category: Optional[str] = None
    path: str = ""
    matched_paths: List[str] = Field(default_factory=list)


class PlanCoverageResponse(BaseModel):
    plan_id: str
    code_paths: List[str]
    explicit_suites: List[str] = Field(
        default_factory=list,
        description="Suite IDs explicitly linked via checkpoint evidence.",
    )
    auto_discovered: List[CoverageSuiteMatch] = Field(
        default_factory=list,
        description="Suites whose 'covers' paths overlap with plan code_paths.",
    )


@router.get("/coverage/{plan_id}", response_model=PlanCoverageResponse)
async def get_plan_coverage(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    """Discover test suites covering a plan's code paths.

    Returns both explicitly linked suites (from checkpoint evidence) and
    auto-discovered suites (from ``code_paths ∩ suite.covers`` overlap).
    """
    from pixsim7.backend.main.services.testing.catalog import build_catalog

    bundle = await get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    code_paths = bundle.plan.code_paths or []

    # Collect explicit test_suite refs from all checkpoints
    explicit_suite_ids: list[str] = []
    for cp in bundle.plan.checkpoints or []:
        for ev in cp.get("evidence") or []:
            ref = _normalize_evidence_ref(ev)
            if ref and ref["kind"] == "test_suite":
                if ref["ref"] not in explicit_suite_ids:
                    explicit_suite_ids.append(ref["ref"])

    # Auto-discover: find suites whose covers overlap with plan code_paths
    all_suites = build_catalog()
    auto_discovered: list[CoverageSuiteMatch] = []

    for suite in all_suites:
        suite_covers = suite.get("covers") or []
        if not suite_covers or not code_paths:
            continue

        matched: list[str] = []
        for plan_path in code_paths:
            for cover_path in suite_covers:
                # Match if either is a prefix of the other
                if plan_path.startswith(cover_path) or cover_path.startswith(plan_path):
                    matched.append(f"{plan_path} ↔ {cover_path}")
                    break

        if matched:
            auto_discovered.append(CoverageSuiteMatch(
                suite_id=suite["id"],
                suite_label=suite.get("label", suite["id"]),
                kind=suite.get("kind"),
                category=suite.get("category"),
                path=suite.get("path", ""),
                matched_paths=matched,
            ))

    return PlanCoverageResponse(
        plan_id=plan_id,
        code_paths=code_paths,
        explicit_suites=explicit_suite_ids,
        auto_discovered=auto_discovered,
    )
