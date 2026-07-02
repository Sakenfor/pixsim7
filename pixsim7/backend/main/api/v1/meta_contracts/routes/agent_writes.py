"""Meta-contract agent writes endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database

from ..models import (
    AgentWriteEntry,
    AgentWritesResponse,
)

router = APIRouter(tags=["meta"])


@router.get("/agents/writes", response_model=AgentWritesResponse)
async def get_agent_writes(
    _user: CurrentUser,
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(100, ge=1, le=500),
    agent_id: Optional[str] = Query(None, description="Filter by specific agent ID"),
    domain: Optional[str] = Query(None, description="Filter by domain: plan, prompt, or all"),
    db: AsyncSession = Depends(get_database),
):
    """Query mutation events attributed to agents across all domains."""
    from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

    stmt = (
        select(EntityAudit)
        .where(EntityAudit.timestamp >= cutoff)
        .where(EntityAudit.actor.like("agent:%"))
    )
    if agent_id:
        stmt = stmt.where(EntityAudit.actor == f"agent:{agent_id}")
    if domain:
        stmt = stmt.where(EntityAudit.domain == domain)
    stmt = stmt.order_by(EntityAudit.timestamp.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    entries = [
        AgentWriteEntry(
            id=str(row.id),
            domain=row.domain,
            entity_id=row.entity_id,
            entity_label=row.entity_label or row.entity_id,
            event_type=row.action,
            field=row.field,
            old_value=row.old_value,
            new_value=row.new_value,
            commit_sha=row.commit_sha,
            actor=row.actor,
            timestamp=row.timestamp.isoformat() if row.timestamp else "",
        )
        for row in rows
    ]

    return AgentWritesResponse(entries=entries, total=len(entries))
