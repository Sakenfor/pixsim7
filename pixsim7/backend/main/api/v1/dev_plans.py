"""
Dev Plans API

Provides access to the plan registry: manifest metadata, plan markdown,
companions, handoffs, DB-backed sync, and event history.
"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_database
from pixsim7.backend.main.domain.docs.models import PlanEvent, PlanRegistry
from pixsim7.backend.main.services.docs.plans import get_plans_index
from pixsim7.backend.main.services.docs.plan_sync import sync_plans

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
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    details: List[Dict[str, Any]] = Field(default_factory=list)


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
        "planId": ev.plan_id,
        "planTitle": plan_title,
        "eventType": ev.event_type,
        "field": ev.field,
        "oldValue": ev.old_value,
        "newValue": ev.new_value,
        "commitSha": ev.commit_sha,
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else "",
    }


# ── Filesystem endpoints ─────────────────────────────────────────


@router.get("", response_model=PlansIndexResponse)
async def list_plans(
    status: Optional[str] = Query(None, description="Filter by status (active, done, parked)"),
    owner: Optional[str] = Query(None, description="Filter by owner (substring match)"),
    refresh: bool = Query(False),
):
    index = get_plans_index(refresh=refresh)
    entries = index.get("entries", {})

    plans = []
    for entry in sorted(entries.values(), key=lambda e: e.id):
        if status and entry.status != status:
            continue
        if owner and owner.lower() not in entry.owner.lower():
            continue
        plans.append(_entry_to_summary(entry))

    return {
        "version": index.get("version", "1"),
        "generatedAt": index.get("generated_at"),
        "plans": plans,
    }


# ── DB-backed endpoints (before catch-all /{plan_id}) ────────────


@router.post("/sync", response_model=SyncResultResponse)
async def trigger_sync(
    commit_sha: Optional[str] = Query(None, description="Current git commit SHA"),
    db: AsyncSession = Depends(get_database),
):
    """Sync filesystem manifests into the DB, detecting and recording changes."""
    result = await sync_plans(db, commit_sha=commit_sha)
    return {
        "created": result.created,
        "updated": result.updated,
        "removed": result.removed,
        "unchanged": result.unchanged,
        "events": result.events,
        "details": result.details,
    }


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


# ── Catch-all: filesystem plan by ID (must be last) ─────────────


@router.get("/{plan_id}", response_model=PlanDetailResponse)
async def get_plan(
    plan_id: str,
    refresh: bool = Query(False),
):
    index = get_plans_index(refresh=refresh)
    entries = index.get("entries", {})
    entry = entries.get(plan_id)

    if not entry:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    return {
        **_entry_to_summary(entry),
        "planPath": entry.plan_path,
        "markdown": entry.markdown,
    }
