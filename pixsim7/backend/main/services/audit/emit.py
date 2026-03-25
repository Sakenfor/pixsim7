"""Lightweight helpers for emitting entity audit entries.

Usage:
    from pixsim7.backend.main.services.audit import emit_audit, emit_audit_batch

All helpers add to the session but do NOT commit — callers control transactions.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.shared.datetime_utils import utcnow


async def emit_audit(
    db: AsyncSession,
    *,
    domain: str,
    entity_type: str,
    entity_id: str,
    action: str,
    entity_label: str | None = None,
    field: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    actor: str = "system",
    run_id: str | None = None,
    plan_id: str | None = None,
    commit_sha: str | None = None,
    extra: dict | None = None,
) -> EntityAudit:
    """Emit a single audit entry. Does not commit."""
    entry = EntityAudit(
        domain=domain,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        action=action,
        field=field,
        old_value=old_value,
        new_value=new_value,
        actor=actor,
        run_id=run_id,
        plan_id=plan_id,
        commit_sha=commit_sha,
        extra=extra,
        timestamp=utcnow(),
    )
    db.add(entry)
    return entry


async def emit_audit_batch(
    db: AsyncSession,
    *,
    domain: str,
    entity_type: str,
    entity_id: str,
    changes: List[Dict[str, Any]],
    entity_label: str | None = None,
    actor: str = "system",
    run_id: str | None = None,
    plan_id: str | None = None,
    commit_sha: str | None = None,
    extra: dict | None = None,
) -> List[EntityAudit]:
    """Emit multiple audit entries for a batch of field changes.

    Each change dict should have:
      - field (str): the field name
      - old (str | None): old value
      - new (str | None): new value
      - action (str, optional): defaults to "updated"

    Does not commit.
    """
    now = utcnow()
    entries: List[EntityAudit] = []
    for change in changes:
        action = change.get("action", "updated")
        entry = EntityAudit(
            domain=domain,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            action=action,
            field=change["field"],
            old_value=change.get("old"),
            new_value=change.get("new"),
            actor=actor,
            run_id=run_id,
            plan_id=plan_id,
            commit_sha=commit_sha,
            extra=extra,
            timestamp=now,
        )
        db.add(entry)
        entries.append(entry)
    return entries


def resolve_actor(user: Any) -> str:
    """Derive audit actor string from a user/principal object."""
    if user and hasattr(user, 'source'):
        return user.source
    if user:
        return f"user:{getattr(user, 'id', 0)}"
    return "system"


def resolve_run_id(principal: Any) -> str | None:
    """Extract run_id from a principal if available."""
    return getattr(principal, 'run_id', None) or None


def _serialize_value(value: Any) -> str | None:
    """Coerce a value to a string suitable for audit old_value / new_value."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


def diff_fields(
    old: Any,
    new: Any,
    fields: Sequence[str],
) -> List[Tuple[str, str | None, str | None]]:
    """Compare *fields* on two objects, return list of (field, old_val, new_val) for changed fields."""
    changes: List[Tuple[str, str | None, str | None]] = []
    for field in fields:
        old_val = getattr(old, field, None)
        new_val = getattr(new, field, None) if not isinstance(new, dict) else new.get(field)
        if old_val != new_val:
            changes.append((field, _serialize_value(old_val), _serialize_value(new_val)))
    return changes
