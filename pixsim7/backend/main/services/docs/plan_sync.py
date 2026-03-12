"""
Plan sync service.

Compares filesystem manifests against DB state, detects changes,
writes PlanEvent audit entries, and updates PlanRegistry rows.
The filesystem (manifest.yaml) remains the source of truth.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import PlanEvent, PlanRegistry
from pixsim7.backend.main.services.docs.plans import PlanEntry, build_plans_index
from pixsim7.backend.main.shared.config import _resolve_repo_root
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

TRACKED_FIELDS = ("title", "status", "stage", "owner", "priority", "summary", "scope")
TRACKED_LIST_FIELDS = ("code_paths", "companions", "handoffs", "tags", "depends_on")


@dataclass
class SyncResult:
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    details: List[Dict] = field(default_factory=list)


def compute_manifest_hash(manifest_path: Path) -> str:
    try:
        content = manifest_path.read_bytes()
        return hashlib.sha256(content).hexdigest()
    except Exception:
        return ""


def _find_manifest_path(plan_id: str, scope: str) -> Optional[Path]:
    repo_root = _resolve_repo_root()
    candidate = repo_root / "docs" / "plans" / scope / plan_id / "manifest.yaml"
    if candidate.exists():
        return candidate
    return None


def _stringify(value) -> str:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value) if value is not None else ""


def _diff_entry(
    existing: PlanRegistry, entry: PlanEntry
) -> List[Tuple[str, str, str]]:
    """Return list of (field, old_value, new_value) for changed fields."""
    changes: List[Tuple[str, str, str]] = []

    for f in TRACKED_FIELDS:
        old_val = getattr(existing, f, None)
        new_val = getattr(entry, f, None)
        old_str = str(old_val) if old_val is not None else ""
        new_str = str(new_val) if new_val is not None else ""
        if old_str != new_str:
            changes.append((f, old_str, new_str))

    for f in TRACKED_LIST_FIELDS:
        old_val = getattr(existing, f, None) or []
        new_val = getattr(entry, f, None) or []
        if sorted(old_val) != sorted(new_val):
            changes.append((f, _stringify(old_val), _stringify(new_val)))

    return changes


def _apply_entry_to_row(row: PlanRegistry, entry: PlanEntry, manifest_hash: str) -> None:
    row.title = entry.title
    row.status = entry.status
    row.stage = entry.stage
    row.owner = entry.owner
    row.priority = entry.priority
    row.summary = entry.summary
    row.scope = entry.scope
    row.code_paths = entry.code_paths
    row.companions = entry.companions
    row.handoffs = entry.handoffs
    row.tags = entry.tags
    row.depends_on = entry.depends_on
    row.manifest_hash = manifest_hash
    row.last_synced_at = utcnow()
    row.updated_at = utcnow()


async def sync_plans(
    db: AsyncSession,
    commit_sha: Optional[str] = None,
) -> SyncResult:
    """Sync filesystem plan manifests into the DB, emitting events for changes."""
    result = SyncResult()

    # Load current filesystem state
    fs_index = build_plans_index()
    fs_entries: Dict[str, PlanEntry] = fs_index.get("entries", {})

    # Load current DB state
    stmt = select(PlanRegistry)
    rows = (await db.execute(stmt)).scalars().all()
    db_plans: Dict[str, PlanRegistry] = {r.id: r for r in rows}

    now = utcnow()

    # Process filesystem entries
    for plan_id, entry in fs_entries.items():
        manifest_path = _find_manifest_path(plan_id, entry.scope)
        m_hash = compute_manifest_hash(manifest_path) if manifest_path else ""

        if plan_id not in db_plans:
            # New plan
            row = PlanRegistry(id=plan_id, revision=1, created_at=now)
            _apply_entry_to_row(row, entry, m_hash)
            db.add(row)

            event = PlanEvent(
                plan_id=plan_id,
                event_type="created",
                new_value=entry.status,
                commit_sha=commit_sha,
                timestamp=now,
            )
            db.add(event)

            result.created += 1
            result.events += 1
            result.details.append({"plan_id": plan_id, "action": "created"})

        else:
            existing = db_plans[plan_id]

            if existing.manifest_hash == m_hash and m_hash:
                # Hash unchanged — skip
                existing.last_synced_at = now
                result.unchanged += 1
                continue

            changes = _diff_entry(existing, entry)
            if not changes:
                # Hash changed but no field diffs (formatting only)
                existing.manifest_hash = m_hash
                existing.last_synced_at = now
                result.unchanged += 1
                continue

            # Apply changes
            existing.revision = (existing.revision or 0) + 1
            _apply_entry_to_row(existing, entry, m_hash)

            for field_name, old_val, new_val in changes:
                event = PlanEvent(
                    plan_id=plan_id,
                    event_type="field_changed",
                    field=field_name,
                    old_value=old_val,
                    new_value=new_val,
                    commit_sha=commit_sha,
                    timestamp=now,
                )
                db.add(event)
                result.events += 1

            result.updated += 1
            result.details.append({
                "plan_id": plan_id,
                "action": "updated",
                "changes": [f for f, _, _ in changes],
            })

    # Detect removed plans (in DB but not on filesystem)
    for plan_id, row in db_plans.items():
        if plan_id not in fs_entries and row.status != "removed":
            row.status = "removed"
            row.updated_at = now
            row.last_synced_at = now

            event = PlanEvent(
                plan_id=plan_id,
                event_type="removed",
                field="status",
                old_value=row.status,
                new_value="removed",
                commit_sha=commit_sha,
                timestamp=now,
            )
            db.add(event)

            result.removed += 1
            result.events += 1
            result.details.append({"plan_id": plan_id, "action": "removed"})

    await db.commit()

    logger.info(
        "plan_sync_complete",
        created=result.created,
        updated=result.updated,
        removed=result.removed,
        unchanged=result.unchanged,
        events=result.events,
    )

    return result
