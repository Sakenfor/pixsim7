"""
Plan sync service.

Compares filesystem manifests against DB state, detects changes,
writes PlanEvent audit entries, and updates PlanRegistry rows.
The filesystem (manifest.yaml) remains the source of truth.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import PlanEvent, PlanRegistry, PlanSyncRun
from pixsim7.backend.main.services.docs.plans import PlanEntry, build_plans_index
from pixsim7.backend.main.shared.config import _resolve_repo_root
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

TRACKED_FIELDS = ("title", "status", "stage", "owner", "priority", "summary", "scope")
TRACKED_LIST_FIELDS = ("code_paths", "companions", "handoffs", "tags", "depends_on")
PLAN_SYNC_ADVISORY_LOCK_KEY = 760_003_001


class PlanSyncLockedError(RuntimeError):
    """Raised when another plan sync is already running."""


@dataclass
class SyncResult:
    run_id: Optional[str] = None
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0
    events: int = 0
    duration_ms: Optional[int] = None
    changed_fields: Dict[str, int] = field(default_factory=dict)
    details: List[Dict] = field(default_factory=list)


@dataclass
class PlanRetentionResult:
    dry_run: bool = True
    retention_days: int = 90
    cutoff: str = ""
    events_deleted: int = 0
    runs_deleted: int = 0


def compute_manifest_hash(manifest_path: Path) -> str:
    try:
        content = manifest_path.read_bytes()
        return hashlib.sha256(content).hexdigest()
    except Exception:
        return ""


def _find_manifest_path(plan_id: str, scope: str) -> Optional[Path]:
    repo_root = _resolve_repo_root()
    for manifest_name in ("manifest.yaml", "manifest.yml"):
        candidate = repo_root / "docs" / "plans" / scope / plan_id / manifest_name
        if candidate.exists():
            return candidate
    return None


def _stringify(value) -> str:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value) if value is not None else ""


async def _acquire_sync_lock(db: AsyncSession) -> None:
    lock_stmt = text("SELECT pg_try_advisory_xact_lock(:lock_key)")
    acquired = (
        await db.execute(lock_stmt, {"lock_key": PLAN_SYNC_ADVISORY_LOCK_KEY})
    ).scalar_one()
    if not acquired:
        raise PlanSyncLockedError("A plan sync is already in progress.")


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
    row.markdown = entry.markdown
    row.plan_path = entry.plan_path
    row.code_paths = entry.code_paths
    row.companions = entry.companions
    row.handoffs = entry.handoffs
    row.tags = entry.tags
    row.depends_on = entry.depends_on
    row.manifest_hash = manifest_hash
    row.last_synced_at = utcnow()
    row.updated_at = utcnow()


def _apply_result_to_run(run: PlanSyncRun, result: SyncResult) -> None:
    run.created = result.created
    run.updated = result.updated
    run.removed = result.removed
    run.unchanged = result.unchanged
    run.events = result.events
    run.duration_ms = result.duration_ms
    run.changed_fields = dict(result.changed_fields)


def _record_changed_field(result: SyncResult, field_name: str) -> None:
    result.changed_fields[field_name] = result.changed_fields.get(field_name, 0) + 1


def _duration_ms(started_at, finished_at) -> int:
    return max(0, int((finished_at - started_at).total_seconds() * 1000))


async def sync_plans(
    db: AsyncSession,
    commit_sha: Optional[str] = None,
    actor: Optional[str] = None,
) -> SyncResult:
    """Sync filesystem plan manifests into the DB, emitting events for changes."""
    result = SyncResult()
    await _acquire_sync_lock(db)

    run_started_at = utcnow()
    sync_run = PlanSyncRun(
        status="running",
        started_at=run_started_at,
        commit_sha=commit_sha,
        actor=actor,
    )
    db.add(sync_run)
    await db.flush()
    result.run_id = str(sync_run.id)

    try:
        # Load current filesystem state
        fs_index = build_plans_index()
        fs_entries: Dict[str, PlanEntry] = fs_index.get("entries", {})
        fs_errors: List[str] = fs_index.get("errors", []) or []
        if fs_errors:
            logger.error(
                "plan_sync_aborted_manifest_errors",
                error_count=len(fs_errors),
                sample_errors=fs_errors[:10],
            )
            raise ValueError(
                "Plan manifest index contains errors. Run docs:plans:check and fix manifests before sync."
            )

        # Load current DB state
        rows = (await db.execute(select(PlanRegistry))).scalars().all()
        db_plans: Dict[str, PlanRegistry] = {r.id: r for r in rows}

        now = utcnow()

        # Process filesystem entries
        for plan_id, entry in fs_entries.items():
            manifest_path = _find_manifest_path(plan_id, entry.scope)
            m_hash = compute_manifest_hash(manifest_path) if manifest_path else ""

            if plan_id not in db_plans:
                row = PlanRegistry(id=plan_id, revision=1, created_at=now)
                _apply_entry_to_row(row, entry, m_hash)
                db.add(row)

                db.add(
                    PlanEvent(
                        run_id=sync_run.id,
                        plan_id=plan_id,
                        event_type="created",
                        new_value=entry.status,
                        commit_sha=commit_sha,
                        timestamp=now,
                    )
                )
                result.created += 1
                result.events += 1
                result.details.append({"plan_id": plan_id, "action": "created"})
                continue

            existing = db_plans[plan_id]
            if existing.manifest_hash == m_hash and m_hash and existing.status != "removed":
                existing.last_synced_at = now
                result.unchanged += 1
                continue

            changes = _diff_entry(existing, entry)
            if not changes:
                existing.manifest_hash = m_hash
                existing.last_synced_at = now
                result.unchanged += 1
                continue

            existing.revision = (existing.revision or 0) + 1
            _apply_entry_to_row(existing, entry, m_hash)

            for field_name, old_val, new_val in changes:
                db.add(
                    PlanEvent(
                        run_id=sync_run.id,
                        plan_id=plan_id,
                        event_type="field_changed",
                        field=field_name,
                        old_value=old_val,
                        new_value=new_val,
                        commit_sha=commit_sha,
                        timestamp=now,
                    )
                )
                _record_changed_field(result, field_name)
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
                old_status = row.status
                row.status = "removed"
                row.revision = (row.revision or 0) + 1
                row.updated_at = now
                row.last_synced_at = now

                db.add(
                    PlanEvent(
                        run_id=sync_run.id,
                        plan_id=plan_id,
                        event_type="removed",
                        field="status",
                        old_value=old_status,
                        new_value="removed",
                        commit_sha=commit_sha,
                        timestamp=now,
                    )
                )
                result.removed += 1
                _record_changed_field(result, "status")
                result.events += 1
                result.details.append({"plan_id": plan_id, "action": "removed"})

        sync_run.status = "success"
        sync_run.finished_at = utcnow()
        result.duration_ms = _duration_ms(run_started_at, sync_run.finished_at)
        _apply_result_to_run(sync_run, result)
        await db.commit()

        logger.info(
            "plan_sync_complete",
            run_id=str(sync_run.id),
            created=result.created,
            updated=result.updated,
            removed=result.removed,
            unchanged=result.unchanged,
            events=result.events,
            duration_ms=result.duration_ms,
        )
        return result
    except Exception as exc:
        await db.rollback()

        finished_at = utcnow()
        result.duration_ms = _duration_ms(run_started_at, finished_at)
        failed_run = PlanSyncRun(
            status="failed",
            started_at=run_started_at,
            finished_at=finished_at,
            commit_sha=commit_sha,
            actor=actor,
            error_message=str(exc),
        )
        _apply_result_to_run(failed_run, result)
        db.add(failed_run)
        await db.commit()
        result.run_id = str(failed_run.id)
        raise


async def prune_plan_sync_history(
    db: AsyncSession,
    *,
    retention_days: int = 90,
    dry_run: bool = True,
) -> PlanRetentionResult:
    """Delete old plan sync runs/events based on retention window."""
    if retention_days < 1:
        raise ValueError("retention_days must be >= 1")

    await _acquire_sync_lock(db)
    cutoff_dt = utcnow() - timedelta(days=retention_days)
    result = PlanRetentionResult(
        dry_run=dry_run,
        retention_days=retention_days,
        cutoff=cutoff_dt.isoformat(),
    )

    try:
        recent_events_exist = (
            select(PlanEvent.id)
            .where(
                PlanEvent.run_id == PlanSyncRun.id,
                PlanEvent.timestamp >= cutoff_dt,
            )
            .exists()
        )
        result.events_deleted = int(
            (await db.execute(
                select(func.count())
                .select_from(PlanEvent)
                .where(PlanEvent.timestamp < cutoff_dt)
            )).scalar_one()
            or 0
        )
        result.runs_deleted = int(
            (await db.execute(
                select(func.count())
                .select_from(PlanSyncRun)
                .where(func.coalesce(PlanSyncRun.finished_at, PlanSyncRun.started_at) < cutoff_dt)
                .where(~recent_events_exist)
            )).scalar_one()
            or 0
        )

        if dry_run:
            await db.commit()
            return result

        await db.execute(delete(PlanEvent).where(PlanEvent.timestamp < cutoff_dt))
        await db.execute(
            delete(PlanSyncRun).where(
                func.coalesce(PlanSyncRun.finished_at, PlanSyncRun.started_at) < cutoff_dt
            ).where(~recent_events_exist)
        )
        await db.commit()
        logger.info(
            "plan_sync_retention_complete",
            retention_days=retention_days,
            events_deleted=result.events_deleted,
            runs_deleted=result.runs_deleted,
        )
        return result
    except Exception:
        await db.rollback()
        raise
