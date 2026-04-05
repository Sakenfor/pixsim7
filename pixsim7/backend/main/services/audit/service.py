"""Centralised audit service.

Replaces scattered ``emit_audit`` / ``emit_audit_batch`` calls with a
single entry point that auto-resolves actor, run_id, and commit_sha from
request-scoped context.

Usage:
    audit = AuditService(db)
    await audit.record(domain="agent", entity_type="agent_profile",
                       entity_id=pid, action="created")

    await audit.record_changes(domain="plan", entity_type="plan_registry",
                               entity_id=plan_id, changes=[...])

    await audit.record_diff(domain="agent", entity_type="agent_profile",
                            entity_id=pid, old_obj=old, new_obj=updated,
                            fields=["label", "description"])

Actor / run_id / commit_sha are read from context by default but can be
overridden per-call.  The service does NOT commit — callers own the
transaction.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.services.audit.context import (
    get_audit_actor,
    get_audit_commit_sha,
    get_audit_run_id,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(value: Any) -> Optional[str]:
    """Coerce a value to a string suitable for audit old_value / new_value."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class AuditService:
    """Single entry-point for all audit emission.

    Reads actor / run_id / commit_sha from request-scoped context by
    default so callers don't need to repeat boilerplate.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -- Context resolution -------------------------------------------------

    @staticmethod
    def _resolve_actor(actor: Optional[str]) -> str:
        return actor if actor is not None else get_audit_actor()

    @staticmethod
    def _resolve_run_id(run_id: Optional[str]) -> Optional[str]:
        return run_id if run_id is not None else get_audit_run_id()

    @staticmethod
    def _resolve_commit_sha(commit_sha: Optional[str]) -> Optional[str]:
        return commit_sha if commit_sha is not None else get_audit_commit_sha()

    # -- Core methods -------------------------------------------------------

    async def record(
        self,
        *,
        domain: str,
        entity_type: str,
        entity_id: str,
        action: str,
        entity_label: Optional[str] = None,
        field: Optional[str] = None,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        actor: Optional[str] = None,
        run_id: Optional[str] = None,
        plan_id: Optional[str] = None,
        commit_sha: Optional[str] = None,
        extra: Optional[dict] = None,
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
            actor=self._resolve_actor(actor),
            run_id=self._resolve_run_id(run_id),
            plan_id=plan_id,
            commit_sha=self._resolve_commit_sha(commit_sha),
            extra=extra,
            timestamp=utcnow(),
        )
        self.db.add(entry)
        return entry

    async def record_changes(
        self,
        *,
        domain: str,
        entity_type: str,
        entity_id: str,
        changes: List[Dict[str, Any]],
        entity_label: Optional[str] = None,
        actor: Optional[str] = None,
        run_id: Optional[str] = None,
        plan_id: Optional[str] = None,
        commit_sha: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> List[EntityAudit]:
        """Emit one audit entry per field change. Does not commit.

        Each change dict: ``{"field": str, "old": str|None, "new": str|None}``.
        Optional ``"action"`` key defaults to ``"updated"``.
        """
        now = utcnow()
        resolved_actor = self._resolve_actor(actor)
        resolved_run_id = self._resolve_run_id(run_id)
        resolved_sha = self._resolve_commit_sha(commit_sha)
        entries: List[EntityAudit] = []
        for change in changes:
            entry = EntityAudit(
                domain=domain,
                entity_type=entity_type,
                entity_id=entity_id,
                entity_label=entity_label,
                action=change.get("action", "updated"),
                field=change.get("field"),
                old_value=change.get("old"),
                new_value=change.get("new"),
                actor=resolved_actor,
                run_id=resolved_run_id,
                plan_id=plan_id,
                commit_sha=resolved_sha,
                extra=extra,
                timestamp=now,
            )
            self.db.add(entry)
            entries.append(entry)
        return entries

    async def record_diff(
        self,
        *,
        domain: str,
        entity_type: str,
        entity_id: str,
        old_obj: Any,
        new_obj: Any,
        fields: Sequence[str],
        entity_label: Optional[str] = None,
        actor: Optional[str] = None,
        run_id: Optional[str] = None,
        plan_id: Optional[str] = None,
        commit_sha: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> List[EntityAudit]:
        """Diff *fields* between two objects and emit entries for changes.

        Works with ORM instances, dicts, or any attribute-bearing objects.
        Does not commit.
        """
        def _get(obj: Any, field: str) -> Any:
            if isinstance(obj, dict):
                return obj.get(field)
            return getattr(obj, field, None)

        changes: List[Dict[str, Any]] = []
        for f in fields:
            old_val = _get(old_obj, f)
            new_val = _get(new_obj, f)
            if old_val != new_val:
                changes.append({
                    "field": f,
                    "old": _serialize(old_val),
                    "new": _serialize(new_val),
                })
        if not changes:
            return []
        return await self.record_changes(
            domain=domain,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=changes,
            entity_label=entity_label,
            actor=actor,
            run_id=run_id,
            plan_id=plan_id,
            commit_sha=commit_sha,
            extra=extra,
        )
