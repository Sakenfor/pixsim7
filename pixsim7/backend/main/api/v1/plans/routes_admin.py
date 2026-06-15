"""Admin routes — settings, sync, registry, activity."""
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, get_database
from pixsim7.backend.main.domain.docs.models import PlanRegistry, PlanSyncRun
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.services.audit import list_entity_audit_events
from pixsim7.backend.main.services.docs.plan_sync import (
    PlanSyncLockedError,
    prune_plan_sync_history,
    sync_plans,
)
from pixsim7.backend.main.services.docs.plan_write import (
    PlanBundle,
    list_plan_bundles,
    git_forge_commit_url_template,
)
from pixsim7.backend.main.services.docs.plan_stages import (
    DEFAULT_PLAN_STAGE,
    DEFAULT_PLAN_TYPE,
    plan_stage_options,
    plan_type_options,
)
from pixsim7.backend.main.api.v1.plans.schemas import (
    PlanRuntimeSettingsResponse,
    PlanRuntimeSettingsUpdateRequest,
    PlanStageOptionEntry,
    PlanStagesResponse,
    PlanTypeOptionEntry,
    SyncResultResponse,
    PlanSyncRunEntry,
    PlanSyncRunsResponse,
    PlanSyncRetentionResponse,
    PlanRegistryEntry,
    PlanRegistryListResponse,
    PlanEventEntry,
    PlanEventsResponse,
    PlanActivityEntry,
    PlanActivityResponse,
)
from pixsim7.backend.main.api.v1.plans import helpers as _h

router = APIRouter()

@router.get("/settings", response_model=PlanRuntimeSettingsResponse)
async def get_plan_runtime_settings(
    _user: CurrentUser,
):
    return {
        "plans_db_only_mode": settings.plans_db_only_mode,
        "source": "runtime",
        "forge_commit_url_template": git_forge_commit_url_template(),
        "participant_stale_minutes": _h.participant_stale_minutes(),
        "claim_idle_release_minutes": _h.claim_idle_release_minutes(),
    }


@router.get("/stages", response_model=PlanStagesResponse)
async def list_plan_stages(
    _user: CurrentUser,
):
    return PlanStagesResponse(
        default_stage=DEFAULT_PLAN_STAGE,
        stages=[PlanStageOptionEntry(**opt) for opt in plan_stage_options()],
        default_plan_type=DEFAULT_PLAN_TYPE,
        plan_types=[PlanTypeOptionEntry(**opt) for opt in plan_type_options()],
    )


@router.patch("/settings", response_model=PlanRuntimeSettingsResponse)
async def update_plan_runtime_settings(
    payload: PlanRuntimeSettingsUpdateRequest,
    _admin: CurrentAdminUser,
):
    settings.plans_db_only_mode = payload.plans_db_only_mode
    # Apply a TTL override only when the field was explicitly sent — omitting it
    # leaves the current value untouched; sending null resets to env/default.
    # Process-global (runtime override): the resolvers read settings first.
    fields_set = payload.model_fields_set
    if "participant_stale_minutes" in fields_set:
        settings.plan_participant_stale_minutes = payload.participant_stale_minutes
    if "claim_idle_release_minutes" in fields_set:
        settings.plan_claim_idle_release_minutes = payload.claim_idle_release_minutes
    return {
        "plans_db_only_mode": settings.plans_db_only_mode,
        "source": "runtime",
        "forge_commit_url_template": git_forge_commit_url_template(),
        "participant_stale_minutes": _h.participant_stale_minutes(),
        "claim_idle_release_minutes": _h.claim_idle_release_minutes(),
    }


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
        "run_id": result.run_id,
        "created": result.created,
        "updated": result.updated,
        "removed": result.removed,
        "unchanged": result.unchanged,
        "events": result.events,
        "duration_ms": result.duration_ms,
        "changed_fields": result.changed_fields,
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
    return {"runs": [_h._run_to_entry(row) for row in rows]}


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
        "dry_run": result.dry_run,
        "retention_days": result.retention_days,
        "cutoff": result.cutoff,
        "events_deleted": result.events_deleted,
        "runs_deleted": result.runs_deleted,
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
    return _h._run_to_entry(row)


# ── Registry endpoints ────────────────────────────────────────────


@router.get("/registry", response_model=PlanRegistryListResponse)
async def list_registry(
    _user: CurrentUser,
    q: Optional[str] = Query(None, description="Free-text search across id/title/summary/owner/tags"),
    status: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    compact: bool = Query(False, description="Return lightweight registry entries"),
    include_hidden: bool = Query(False, description="Include archived and removed plans"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_database),
):
    bundles = await _h.list_plan_bundles(db)
    filtered = _h._filter_bundles(
        bundles,
        status=status,
        owner=owner,
        q=q,
        include_hidden=include_hidden,
    )

    total = len(filtered)
    page = filtered[offset : offset + limit]
    entries = [_h._bundle_to_registry_entry(b, compact=compact) for b in page]
    return {"plans": entries, "total": total, "limit": limit, "offset": offset, "has_more": offset + limit < total}


@router.get("/registry/{plan_id}", response_model=PlanRegistryEntry)
async def get_registry_plan(
    plan_id: str,
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
):
    bundle = await _h.get_plan_bundle(db, plan_id)
    if not bundle:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")
    return _h._bundle_to_registry_entry(bundle)


@router.get("/registry/{plan_id}/events", response_model=PlanEventsResponse)
async def get_plan_events(
    plan_id: str,
    _user: CurrentUser,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    include_raw_diffs: bool = Query(
        False,
        description=(
            "When true, ``field == 'checkpoints'`` events keep the full "
            "``old_value`` + ``new_value`` JSON-array strings. Default false: "
            "those entries get a compact ``checkpoint_delta`` instead and the "
            "raw values are dropped (saves ~5–10 KB per event)."
        ),
    ),
    db: AsyncSession = Depends(get_database),
):
    plan = await db.get(PlanRegistry, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan not in registry: {plan_id}")

    # Include both plan-level events (entity_id = plan_id) and
    # sub-entity events (review rounds, nodes, requests) linked via plan_id column.
    stmt = (
        select(EntityAudit)
        .where(
            and_(
                EntityAudit.domain == "plan",
                or_(
                    EntityAudit.entity_id == plan_id,
                    EntityAudit.plan_id == plan_id,
                ),
            )
        )
        .order_by(EntityAudit.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())

    events = []
    for row in rows:
        entry: Dict[str, Any] = {
            "id": str(row.id),
            "run_id": (row.extra or {}).get("sync_run_id"),
            "plan_id": plan_id,
            "event_type": row.action,
            "entity_type": row.entity_type,
            "entity_label": row.entity_label,
            "field": row.field,
            "old_value": row.old_value,
            "new_value": row.new_value,
            "commit_sha": row.commit_sha,
            "actor": row.actor,
            "timestamp": row.timestamp.isoformat() if row.timestamp else "",
        }
        # C-lite trim: replace the giant checkpoints-array JSON blobs with
        # a per-checkpoint structured delta when we can compute one. Same
        # logic as ``get_activity`` above.
        if row.field == "checkpoints":
            delta = _h._compute_checkpoint_delta(row.old_value, row.new_value)
            if delta is not None:
                entry["checkpoint_delta"] = delta
                if not include_raw_diffs:
                    entry["old_value"] = None
                    entry["new_value"] = None
        events.append(entry)

    return {
        "plan_id": plan_id,
        "events": events,
    }


@router.get("/activity", response_model=PlanActivityResponse)
async def get_activity(
    _user: CurrentUser,
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(100, ge=1, le=500),
    include_raw_diffs: bool = Query(
        False,
        description=(
            "When true, ``field == 'checkpoints'`` events keep the full "
            "``old_value`` + ``new_value`` JSON-array strings. Default false: "
            "those entries get a compact ``checkpoint_delta`` instead and the "
            "raw values are dropped (saves ~5–10 KB per event)."
        ),
    ),
    db: AsyncSession = Depends(get_database),
):
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    rows = await list_entity_audit_events(
        db,
        domain="plan",
        since=cutoff,
        limit=limit,
        offset=0,
    )

    events = []
    for row in rows:
        entry: Dict[str, Any] = {
            "id": str(row.id),
            "run_id": (row.extra or {}).get("sync_run_id"),
            "plan_id": row.entity_id,
            "plan_title": row.entity_label or row.entity_id,
            "event_type": row.action,
            "field": row.field,
            "old_value": row.old_value,
            "new_value": row.new_value,
            "commit_sha": row.commit_sha,
            "actor": row.actor,
            "timestamp": row.timestamp.isoformat() if row.timestamp else "",
        }
        # C-lite trim: replace the giant checkpoints-array JSON blobs with
        # a per-checkpoint structured delta when we can compute one.
        if row.field == "checkpoints":
            delta = _h._compute_checkpoint_delta(row.old_value, row.new_value)
            if delta is not None:
                entry["checkpoint_delta"] = delta
                if not include_raw_diffs:
                    entry["old_value"] = None
                    entry["new_value"] = None
        events.append(entry)

    return {"events": events}


# ── Companion documents ──────────────────────────────────────────


@router.get("/documents")
async def list_companion_documents(
    _user: CurrentUser,
    namespace_prefix: str = Query("plans/", description="Namespace prefix filter"),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
):
    """List companion documents across all plans."""
    from pixsim7.backend.main.domain.docs.models import Document

    stmt = (
        select(Document.id, Document.title, Document.namespace)
        .where(Document.namespace.ilike(f"{namespace_prefix}%"))
        .order_by(Document.updated_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return {
        "documents": [
            {"id": r[0], "title": r[1], "namespace": r[2]}
            for r in rows
        ],
    }


# ── Write endpoints ──────────────────────────────────────────────


