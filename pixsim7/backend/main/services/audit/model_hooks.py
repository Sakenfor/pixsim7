"""SQLAlchemy event-based audit for opted-in models.

Registers after_insert / after_update / after_delete listeners that
automatically emit EntityAudit rows for any model that declares an
`__audit__` class attribute.

Usage — opt a model in:

    class Asset(SQLModel, table=True):
        __audit__ = AuditMeta(domain="asset", entity_type="asset", label_field="prompt")
        ...

Then call `register_audit_hooks()` once at app startup (after all models
are imported).  Every INSERT/UPDATE/DELETE on opted-in models will create
an EntityAudit row in the same transaction, using the actor from the
request-scoped audit context.
"""
from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Optional, Sequence

from sqlalchemy import event, inspect
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.services.audit.context import get_audit_actor, get_audit_commit_sha
from pixsim7.backend.main.shared.datetime_utils import utcnow

import json


@dataclass
class AuditMeta:
    """Declare on a model class to opt into automatic audit."""
    domain: str
    entity_type: str
    id_field: str = "id"
    label_field: Optional[str] = None
    tracked_fields: Sequence[str] = ()  # empty = track all mutable fields


def _serialize(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


def _get_label(target: Any, meta: AuditMeta) -> Optional[str]:
    if meta.label_field:
        return str(getattr(target, meta.label_field, "") or "")
    return None


def _get_id(target: Any, meta: AuditMeta) -> str:
    return str(getattr(target, meta.id_field, ""))


def _on_after_insert(mapper, connection, target):
    meta: AuditMeta = getattr(target.__class__, "__audit__", None)
    if not meta:
        return
    entry = EntityAudit(
        domain=meta.domain,
        entity_type=meta.entity_type,
        entity_id=_get_id(target, meta),
        entity_label=_get_label(target, meta),
        action="created",
        actor=get_audit_actor(),
        commit_sha=get_audit_commit_sha(),
        timestamp=utcnow(),
    )
    # Use the sync connection from the flush context to add to same transaction
    from sqlalchemy.orm import object_session
    session = object_session(target)
    if session:
        session.add(entry)


def _on_after_update(mapper, connection, target):
    meta: AuditMeta = getattr(target.__class__, "__audit__", None)
    if not meta:
        return

    insp = inspect(target)
    now = utcnow()
    actor = get_audit_actor()
    commit_sha = get_audit_commit_sha()
    entity_id = _get_id(target, meta)
    entity_label = _get_label(target, meta)

    tracked = set(meta.tracked_fields) if meta.tracked_fields else None

    from sqlalchemy.orm import object_session
    session = object_session(target)
    if not session:
        return

    for attr in insp.attrs:
        if attr.key.startswith("_"):
            continue
        if attr.key in ("created_at", "updated_at"):
            continue
        if tracked and attr.key not in tracked:
            continue
        hist = attr.history
        if not hist.has_changes():
            continue

        old_val = hist.deleted[0] if hist.deleted else None
        new_val = hist.added[0] if hist.added else None

        session.add(EntityAudit(
            domain=meta.domain,
            entity_type=meta.entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            action="updated",
            field=attr.key,
            old_value=_serialize(old_val),
            new_value=_serialize(new_val),
            actor=actor,
            commit_sha=commit_sha,
            timestamp=now,
        ))


def _on_after_delete(mapper, connection, target):
    meta: AuditMeta = getattr(target.__class__, "__audit__", None)
    if not meta:
        return
    from sqlalchemy.orm import object_session
    session = object_session(target)
    if not session:
        return
    session.add(EntityAudit(
        domain=meta.domain,
        entity_type=meta.entity_type,
        entity_id=_get_id(target, meta),
        entity_label=_get_label(target, meta),
        action="deleted",
        actor=get_audit_actor(),
        commit_sha=get_audit_commit_sha(),
        timestamp=utcnow(),
    ))


_registered = False


def register_audit_hooks() -> None:
    """Register SQLAlchemy event listeners for all models with __audit__.

    Call once at startup after models are imported.
    Safe to call multiple times (idempotent).
    """
    global _registered
    if _registered:
        return
    _registered = True

    # Listen on the base class with propagate=True so all subclasses are covered
    event.listen(SQLModel, "after_insert", _on_after_insert, propagate=True)
    event.listen(SQLModel, "after_update", _on_after_update, propagate=True)
    event.listen(SQLModel, "after_delete", _on_after_delete, propagate=True)
