"""Shared audit read endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_current_user, get_db
from pixsim7.backend.main.services.audit import (
    count_entity_audit_events,
    list_entity_audit_events,
)

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEventEntry(BaseModel):
    id: str
    domain: str
    entityType: str
    entityId: str
    entityLabel: Optional[str] = None
    action: str
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    actor: Optional[str] = None
    runId: Optional[str] = None
    planId: Optional[str] = None
    commitSha: Optional[str] = None
    timestamp: str
    extra: Optional[Dict[str, Any]] = None


class AuditEventsResponse(BaseModel):
    events: List[AuditEventEntry] = Field(default_factory=list)
    total: Optional[int] = None
    limit: int
    offset: int


def _to_audit_event_entry(row) -> AuditEventEntry:
    return AuditEventEntry(
        id=str(row.id),
        domain=row.domain,
        entityType=row.entity_type,
        entityId=row.entity_id,
        entityLabel=row.entity_label,
        action=row.action,
        field=row.field,
        oldValue=row.old_value,
        newValue=row.new_value,
        actor=row.actor,
        runId=row.run_id,
        planId=row.plan_id,
        commitSha=row.commit_sha,
        timestamp=row.timestamp.isoformat() if row.timestamp else "",
        extra=row.extra or None,
    )


@router.get("/events", response_model=AuditEventsResponse)
async def list_audit_events(
    domain: Optional[str] = Query(None, description="Filter by domain (plan, prompt, game, asset, etc.)"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    entity_id: Optional[str] = Query(None, description="Filter by exact entity ID"),
    actor: Optional[str] = Query(None, description="Filter by actor (user:1, agent:profile-id, etc.)"),
    action: Optional[str] = Query(None, description="Filter by action (created/updated/deleted)"),
    run_id: Optional[str] = Query(None, description="Filter by agent run ID"),
    plan_id: Optional[str] = Query(None, description="Filter by associated plan ID"),
    since: Optional[datetime] = Query(None, description="Include events on/after this timestamp"),
    until: Optional[datetime] = Query(None, description="Include events on/before this timestamp"),
    include_total: bool = Query(False, description="Include total count for the filter"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    rows = await list_entity_audit_events(
        db,
        domain=domain,
        entity_type=entity_type,
        entity_id=entity_id,
        actor=actor,
        action=action,
        run_id=run_id,
        plan_id=plan_id,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    total = None
    if include_total:
        total = await count_entity_audit_events(
            db,
            domain=domain,
            entity_type=entity_type,
            entity_id=entity_id,
            actor=actor,
            action=action,
            run_id=run_id,
            plan_id=plan_id,
            since=since,
            until=until,
        )

    return AuditEventsResponse(
        events=[_to_audit_event_entry(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
