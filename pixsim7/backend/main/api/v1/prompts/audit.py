"""Prompt audit endpoints backed by the shared audit query service."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_current_user, get_db
from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.audit import (
    count_entity_audit_events,
    list_entity_audit_events,
)
from pixsim7.backend.main.services.prompt import PromptVersionService

router = APIRouter()


class PromptAuditEventEntry(BaseModel):
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


class PromptAuditEventsResponse(BaseModel):
    events: List[PromptAuditEventEntry] = Field(default_factory=list)
    total: Optional[int] = None
    limit: int
    offset: int


def _to_prompt_audit_event(row) -> PromptAuditEventEntry:
    return PromptAuditEventEntry(
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


@router.get("/families/{family_id}/audit", response_model=PromptAuditEventsResponse)
async def list_family_audit_events(
    family_id: UUID,
    actor: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
    include_total: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    service = PromptVersionService(db)
    family = await service.get_family(family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    version_ids = (
        await db.execute(
            select(PromptVersion.id).where(PromptVersion.family_id == family_id)
        )
    ).scalars().all()
    entity_ids = [str(family_id), *[str(version_id) for version_id in version_ids]]

    rows = await list_entity_audit_events(
        db,
        domain="prompt",
        entity_ids=entity_ids,
        actor=actor,
        action=action,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    total = None
    if include_total:
        total = await count_entity_audit_events(
            db,
            domain="prompt",
            entity_ids=entity_ids,
            actor=actor,
            action=action,
            since=since,
            until=until,
        )

    return PromptAuditEventsResponse(
        events=[_to_prompt_audit_event(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/versions/{version_id}/audit", response_model=PromptAuditEventsResponse)
async def list_version_audit_events(
    version_id: UUID,
    actor: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
    include_total: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    service = PromptVersionService(db)
    version = await service.get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    rows = await list_entity_audit_events(
        db,
        domain="prompt",
        entity_type="prompt_version",
        entity_id=str(version_id),
        actor=actor,
        action=action,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    total = None
    if include_total:
        total = await count_entity_audit_events(
            db,
            domain="prompt",
            entity_type="prompt_version",
            entity_id=str(version_id),
            actor=actor,
            action=action,
            since=since,
            until=until,
        )

    return PromptAuditEventsResponse(
        events=[_to_prompt_audit_event(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
