"""Lightweight helpers for emitting entity audit entries.

Usage:
    from pixsim7.backend.main.services.audit import emit_audit, emit_audit_batch

All helpers add to the session but do NOT commit — callers control transactions.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

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
    commit_sha: str | None = None,
    extra: dict | None = None,
) -> List[EntityAudit]:
    """Emit multiple audit entries for a batch of field changes.

    Each change dict should have:
      - field (str): the field name
      - old (str | None): old value
      - new (str | None): new value
      - action (str, optional): defaults to "field_changed"; use "content_updated" for large text

    Does not commit.
    """
    now = utcnow()
    entries: List[EntityAudit] = []
    for change in changes:
        action = change.get("action", "field_changed")
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
            commit_sha=commit_sha,
            extra=extra,
            timestamp=now,
        )
        db.add(entry)
        entries.append(entry)
    return entries
