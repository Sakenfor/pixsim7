"""Shared read helpers for entity audit queries."""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit


def _normalize_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _build_audit_select(
    *,
    domain: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    entity_ids: Optional[Sequence[str]] = None,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    plan_id: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Select:
    stmt: Select = select(EntityAudit)
    conditions = []

    normalized_domain = _normalize_string(domain)
    if normalized_domain:
        conditions.append(EntityAudit.domain == normalized_domain)

    normalized_entity_type = _normalize_string(entity_type)
    if normalized_entity_type:
        conditions.append(EntityAudit.entity_type == normalized_entity_type)

    normalized_entity_id = _normalize_string(entity_id)
    if normalized_entity_id:
        conditions.append(EntityAudit.entity_id == normalized_entity_id)

    if entity_ids:
        normalized_ids = [v for v in (_normalize_string(raw) for raw in entity_ids) if v]
        if normalized_ids:
            conditions.append(EntityAudit.entity_id.in_(normalized_ids))

    normalized_actor = _normalize_string(actor)
    if normalized_actor:
        conditions.append(EntityAudit.actor == normalized_actor)

    normalized_action = _normalize_string(action)
    if normalized_action:
        conditions.append(EntityAudit.action == normalized_action)

    normalized_run_id = _normalize_string(run_id)
    if normalized_run_id:
        conditions.append(EntityAudit.run_id == normalized_run_id)

    normalized_plan_id = _normalize_string(plan_id)
    if normalized_plan_id:
        conditions.append(EntityAudit.plan_id == normalized_plan_id)

    if since is not None:
        conditions.append(EntityAudit.timestamp >= since)
    if until is not None:
        conditions.append(EntityAudit.timestamp <= until)

    if conditions:
        stmt = stmt.where(and_(*conditions))
    return stmt


async def list_entity_audit_events(
    db: AsyncSession,
    *,
    domain: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    entity_ids: Optional[Sequence[str]] = None,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    plan_id: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[EntityAudit]:
    stmt = _build_audit_select(
        domain=domain,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_ids=entity_ids,
        actor=actor,
        action=action,
        run_id=run_id,
        plan_id=plan_id,
        since=since,
        until=until,
    )
    stmt = stmt.order_by(EntityAudit.timestamp.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def count_entity_audit_events(
    db: AsyncSession,
    *,
    domain: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    entity_ids: Optional[Sequence[str]] = None,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    plan_id: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> int:
    stmt = _build_audit_select(
        domain=domain,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_ids=entity_ids,
        actor=actor,
        action=action,
        run_id=run_id,
        plan_id=plan_id,
        since=since,
        until=until,
    )
    stmt = stmt.with_only_columns(func.count(EntityAudit.id)).order_by(None)
    total = (await db.execute(stmt)).scalar_one()
    return int(total or 0)
