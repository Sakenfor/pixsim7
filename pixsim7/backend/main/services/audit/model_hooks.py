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

Field tracking modes (on update):
  - Neither tracked_fields nor excluded_fields → track ALL mutable fields
  - excluded_fields=("markdown", "extra") → track all EXCEPT those
  - tracked_fields=("stage", "priority")  → whitelist, only those fields

Prefer excluded_fields for new models — it's additive-safe (new columns
are tracked automatically).  tracked_fields is a legacy whitelist that
silently misses new fields.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field as dc_field
from typing import Any, Optional, Sequence
from uuid import uuid4

from sqlalchemy import event, inspect as sa_inspect
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.services.audit.context import get_audit_actor, get_audit_commit_sha, get_audit_run_id
from pixsim7.backend.main.shared.datetime_utils import utcnow

import json

logger = logging.getLogger(__name__)

# Fields excluded from tracking on every model (timestamps, internal bookkeeping).
_ALWAYS_EXCLUDED = frozenset({"created_at", "updated_at"})


def _emit_audit(connection, **kwargs):
    """Insert an EntityAudit row via core connection (safe during flush)."""
    kwargs.setdefault("id", uuid4())
    connection.execute(EntityAudit.__table__.insert().values(**kwargs))


@dataclass
class AuditMeta:
    """Declare on a model class to opt into automatic audit.

    Field tracking (mutually exclusive — do not set both):
      tracked_fields:  whitelist — ONLY these fields emit audit entries on update.
      excluded_fields: blocklist — track ALL fields EXCEPT these (plus _ALWAYS_EXCLUDED).

    When neither is set, all mutable fields are tracked.
    """
    domain: str
    entity_type: str
    id_field: str = "id"
    label_field: Optional[str] = None
    tracked_fields: Sequence[str] = ()   # whitelist (legacy)
    excluded_fields: Sequence[str] = ()  # blocklist (preferred for new models)
    plan_id_field: Optional[str] = None  # populates EntityAudit.plan_id from this model field


def _should_track(attr_key: str, meta: AuditMeta) -> bool:
    """Decide whether a field should be tracked for audit on update."""
    if attr_key.startswith("_"):
        return False
    if attr_key in _ALWAYS_EXCLUDED:
        return False
    # Whitelist mode (legacy) — takes precedence if set
    if meta.tracked_fields:
        return attr_key in meta.tracked_fields
    # Blocklist mode — track everything except excluded
    if meta.excluded_fields:
        return attr_key not in meta.excluded_fields
    # Default — track all
    return True


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


def _get_plan_id(target: Any, meta: AuditMeta) -> Optional[str]:
    if not meta.plan_id_field:
        return None
    val = getattr(target, meta.plan_id_field, None)
    return str(val) if val else None


def _on_after_insert(mapper, connection, target):
    meta: AuditMeta = getattr(target.__class__, "__audit__", None)
    if not meta:
        return
    _emit_audit(
        connection,
        domain=meta.domain,
        entity_type=meta.entity_type,
        entity_id=_get_id(target, meta),
        entity_label=_get_label(target, meta),
        action="created",
        actor=get_audit_actor(),
        run_id=get_audit_run_id(),
        plan_id=_get_plan_id(target, meta),
        commit_sha=get_audit_commit_sha(),
        timestamp=utcnow(),
    )


def _on_after_update(mapper, connection, target):
    meta: AuditMeta = getattr(target.__class__, "__audit__", None)
    if not meta:
        return

    insp = sa_inspect(target)
    now = utcnow()
    actor = get_audit_actor()
    run_id = get_audit_run_id()
    commit_sha = get_audit_commit_sha()
    entity_id = _get_id(target, meta)
    entity_label = _get_label(target, meta)
    plan_id = _get_plan_id(target, meta)

    for attr in insp.attrs:
        if not _should_track(attr.key, meta):
            continue
        hist = attr.history
        if not hist.has_changes():
            continue

        old_val = hist.deleted[0] if hist.deleted else None
        new_val = hist.added[0] if hist.added else None

        _emit_audit(
            connection,
            domain=meta.domain,
            entity_type=meta.entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            action="updated",
            field=attr.key,
            old_value=_serialize(old_val),
            new_value=_serialize(new_val),
            actor=actor,
            run_id=run_id,
            plan_id=plan_id,
            commit_sha=commit_sha,
            timestamp=now,
        )


def _on_after_delete(mapper, connection, target):
    meta: AuditMeta = getattr(target.__class__, "__audit__", None)
    if not meta:
        return
    _emit_audit(
        connection,
        domain=meta.domain,
        entity_type=meta.entity_type,
        entity_id=_get_id(target, meta),
        entity_label=_get_label(target, meta),
        action="deleted",
        actor=get_audit_actor(),
        run_id=get_audit_run_id(),
        plan_id=_get_plan_id(target, meta),
        commit_sha=get_audit_commit_sha(),
        timestamp=utcnow(),
    )


_registered = False


def _audit_coverage_diagnostic() -> None:
    """Log a warning for models where tracked_fields covers a small fraction of columns.

    Runs once at startup to surface silent audit gaps.
    """
    for cls in SQLModel.__subclasses__():
        meta: Optional[AuditMeta] = getattr(cls, "__audit__", None)
        if not meta:
            continue
        if not meta.tracked_fields:
            # Using excluded_fields or track-all — no gap risk
            continue
        # Count mutable columns (excluding always-excluded and private)
        try:
            mapper = sa_inspect(cls)
            all_cols = {
                c.key for c in mapper.column_attrs
                if not c.key.startswith("_") and c.key not in _ALWAYS_EXCLUDED
            }
        except Exception:
            continue
        tracked = set(meta.tracked_fields)
        untracked = all_cols - tracked - {meta.id_field} - {meta.label_field or ""} - {meta.plan_id_field or ""}
        if untracked and len(tracked) < len(all_cols) * 0.5:
            logger.warning(
                "Audit coverage gap on %s.%s: tracked_fields covers %d/%d columns. "
                "Untracked: %s. Consider switching to excluded_fields.",
                cls.__name__, meta.entity_type,
                len(tracked), len(all_cols),
                ", ".join(sorted(untracked)),
            )


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

    _audit_coverage_diagnostic()
