"""
Plan write service — DB-first with filesystem commit-back.

The DB (PlanRegistry) is the authority for plan state and content.
After every DB write, the manifest.yaml and plan.md on disk are updated
and committed to git as a convenience export for searchability and history.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import PlanDocument, PlanEvent, PlanRegistry
from pixsim7.backend.main.services.docs.plans import (
    MANIFEST_FILENAMES,
    PLAN_SCOPES,
    get_plans_index,
)
from pixsim7.backend.main.shared.config import _resolve_repo_root
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

PLANS_DIR = "docs/plans"
MUTABLE_FIELDS = ("status", "stage", "owner", "priority", "summary", "markdown")
VALID_STATUSES = ("active", "parked", "done", "blocked")
VALID_PRIORITIES = ("high", "normal", "low")


class PlanNotFoundError(ValueError):
    pass


class PlanWriteError(RuntimeError):
    pass


@dataclass
class PlanUpdateResult:
    plan_id: str
    changes: List[Dict[str, Any]] = field(default_factory=list)
    commit_sha: Optional[str] = None
    new_scope: Optional[str] = None


# ---------------------------------------------------------------------------
# Filesystem commit-back
# ---------------------------------------------------------------------------

_MANIFEST_KEY_ORDER = [
    "id", "title", "status", "stage", "owner", "last_updated",
    "priority", "summary", "plan_path", "code_paths",
    "companions", "handoffs", "tags", "depends_on",
]


def _write_manifest(path: Path, data: Dict[str, Any]) -> None:
    """Write manifest YAML with stable key ordering."""
    ordered: Dict[str, Any] = {}
    for k in _MANIFEST_KEY_ORDER:
        if k in data:
            ordered[k] = data[k]
    for k, v in data.items():
        if k not in ordered:
            ordered[k] = v

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.dump(ordered, default_flow_style=False, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def _write_plan_md(path: Path, markdown: str) -> None:
    """Write plan markdown to disk."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown, encoding="utf-8")


def _status_to_scope(status: str) -> str:
    """Map plan status to filesystem scope directory."""
    if status in ("active", "blocked"):
        return "active"
    if status == "done":
        return "done"
    return "parked"


def _find_manifest_on_disk(plan_id: str) -> Optional[Tuple[Path, str]]:
    """Find existing manifest on disk. Returns (path, scope) or None."""
    repo_root = _resolve_repo_root()
    for scope in PLAN_SCOPES:
        for name in MANIFEST_FILENAMES:
            candidate = repo_root / PLANS_DIR / scope / plan_id / name
            if candidate.exists():
                return candidate, scope
    return None


def _build_manifest_data(row: PlanRegistry) -> Dict[str, Any]:
    """Build manifest dict from DB row."""
    data: Dict[str, Any] = {
        "id": row.id,
        "title": row.title,
        "status": row.status,
        "stage": row.stage,
        "owner": row.owner,
        "last_updated": row.updated_at.date().isoformat() if row.updated_at else utcnow().date().isoformat(),
        "priority": row.priority,
        "summary": row.summary,
        "plan_path": "./plan.md",
    }
    if row.code_paths:
        data["code_paths"] = row.code_paths
    if row.companions:
        data["companions"] = row.companions
    if row.handoffs:
        data["handoffs"] = row.handoffs
    if row.tags:
        data["tags"] = row.tags
    if row.depends_on:
        data["depends_on"] = row.depends_on
    return data


def _export_plan_to_disk(row: PlanRegistry) -> List[Path]:
    """Write manifest.yaml and plan.md to disk from DB row. Returns written paths."""
    repo_root = _resolve_repo_root()
    scope = _status_to_scope(row.status)
    plan_dir = repo_root / PLANS_DIR / scope / row.id

    manifest_path = plan_dir / "manifest.yaml"
    plan_md_path = plan_dir / "plan.md"

    _write_manifest(manifest_path, _build_manifest_data(row))

    if row.markdown:
        _write_plan_md(plan_md_path, row.markdown)

    return [manifest_path, plan_md_path]


def _move_plan_directory(plan_id: str, old_scope: str, new_scope: str) -> None:
    """Move plan bundle directory when status maps to a different scope folder."""
    repo_root = _resolve_repo_root()
    old_dir = repo_root / PLANS_DIR / old_scope / plan_id
    new_dir = repo_root / PLANS_DIR / new_scope / plan_id

    if not old_dir.exists():
        # Plan doesn't exist on disk yet — that's fine, export will create it
        return
    if new_dir.exists():
        raise PlanWriteError(f"Target directory already exists: {new_dir}")

    new_dir.parent.mkdir(parents=True, exist_ok=True)
    old_dir.rename(new_dir)


# ---------------------------------------------------------------------------
# Git operations
# ---------------------------------------------------------------------------


def _git_commit(paths: List[Path], message: str) -> Optional[str]:
    """Stage specific files and commit. Returns commit SHA or None."""
    repo_root = _resolve_repo_root()
    try:
        rel_paths = [str(p.relative_to(repo_root)) for p in paths if p.exists()]
        if not rel_paths:
            return None

        subprocess.run(
            ["git", "add", "--"] + rel_paths,
            cwd=str(repo_root), check=True, capture_output=True, timeout=30,
        )
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=str(repo_root), capture_output=True, timeout=10,
        )
        if result.returncode == 0:
            return None  # nothing staged

        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=str(repo_root), check=True, capture_output=True, timeout=30,
        )
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root), capture_output=True, text=True, timeout=10,
        )
        return sha.stdout.strip() if sha.returncode == 0 else None
    except subprocess.SubprocessError as exc:
        logger.warning("plan_git_commit_failed", error=str(exc))
        return None


def _git_commit_move(plan_id: str, old_scope: str, new_scope: str, message: str) -> Optional[str]:
    """Commit a plan directory move."""
    repo_root = _resolve_repo_root()
    old_pattern = f"{PLANS_DIR}/{old_scope}/{plan_id}/"
    new_pattern = f"{PLANS_DIR}/{new_scope}/{plan_id}/"
    try:
        subprocess.run(
            ["git", "add", "--all", "--", old_pattern, new_pattern],
            cwd=str(repo_root), check=True, capture_output=True, timeout=30,
        )
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=str(repo_root), capture_output=True, timeout=10,
        )
        if result.returncode == 0:
            return None

        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=str(repo_root), check=True, capture_output=True, timeout=30,
        )
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root), capture_output=True, text=True, timeout=10,
        )
        return sha.stdout.strip() if sha.returncode == 0 else None
    except subprocess.SubprocessError as exc:
        logger.warning("plan_git_move_commit_failed", error=str(exc))
        return None


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _read_plan_document(
    repo_root: Path, plan_id: str, doc_type: str, doc_path: str, now,
) -> Optional[PlanDocument]:
    """Read a companion/handoff markdown file from disk into a PlanDocument."""
    full_path = repo_root / doc_path
    if not full_path.exists() or not full_path.is_file():
        logger.warning("plan_doc_missing", plan_id=plan_id, doc_type=doc_type, path=doc_path)
        return None

    try:
        markdown = full_path.read_text(encoding="utf-8")
    except Exception:
        logger.warning("plan_doc_read_failed", plan_id=plan_id, path=doc_path)
        return None

    # Derive title from first markdown heading or filename
    title = full_path.stem.replace("-", " ").replace("_", " ").title()
    for line in markdown.split("\n", 5):
        if line.startswith("# "):
            title = line[2:].strip()
            break

    return PlanDocument(
        plan_id=plan_id,
        doc_type=doc_type,
        path=doc_path,
        title=title,
        markdown=markdown,
        created_at=now,
        updated_at=now,
    )


async def _ensure_db_row(
    db: AsyncSession, plan_id: str, defaults: Optional[Dict[str, Any]] = None,
) -> PlanRegistry:
    """Get or create PlanRegistry row. If creating, bootstraps from filesystem."""
    row = await db.get(PlanRegistry, plan_id)
    if row:
        return row

    # Bootstrap from filesystem
    index = get_plans_index(refresh=True)
    entry = index.get("entries", {}).get(plan_id)

    now = utcnow()
    row = PlanRegistry(
        id=plan_id,
        title=entry.title if entry else defaults.get("title", plan_id) if defaults else plan_id,
        status=entry.status if entry else defaults.get("status", "active") if defaults else "active",
        stage=entry.stage if entry else defaults.get("stage", "unknown") if defaults else "unknown",
        owner=entry.owner if entry else defaults.get("owner", "unassigned") if defaults else "unassigned",
        priority=entry.priority if entry else defaults.get("priority", "normal") if defaults else "normal",
        summary=entry.summary if entry else defaults.get("summary", "") if defaults else "",
        scope=entry.scope if entry else "active",
        markdown=entry.markdown if entry else None,
        plan_path=entry.plan_path if entry else None,
        code_paths=entry.code_paths if entry else [],
        companions=entry.companions if entry else [],
        handoffs=entry.handoffs if entry else [],
        tags=entry.tags if entry else [],
        depends_on=entry.depends_on if entry else [],
        revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await db.flush()
    return row


async def _emit_events(
    db: AsyncSession,
    plan_id: str,
    changes: List[Dict[str, Any]],
    commit_sha: Optional[str],
) -> None:
    """Write PlanEvent rows for each field change."""
    now = utcnow()
    for change in changes:
        # Don't store full markdown content in events
        if change["field"] == "markdown":
            db.add(PlanEvent(
                plan_id=plan_id,
                event_type="content_updated",
                field="markdown",
                commit_sha=commit_sha,
                timestamp=now,
            ))
        else:
            db.add(PlanEvent(
                plan_id=plan_id,
                event_type="field_changed",
                field=change["field"],
                old_value=change.get("old"),
                new_value=change.get("new"),
                commit_sha=commit_sha,
                timestamp=now,
            ))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def update_plan(
    db: AsyncSession,
    plan_id: str,
    updates: Dict[str, str],
    actor: Optional[str] = None,
) -> PlanUpdateResult:
    """
    Apply field updates to a plan (DB-first).

    1. Updates DB row (creates if needed via filesystem bootstrap)
    2. Emits PlanEvents
    3. Exports manifest.yaml + plan.md to disk
    4. Commits to git
    """
    # Validate
    for key in updates:
        if key not in MUTABLE_FIELDS:
            raise ValueError(f"Cannot update field '{key}'. Mutable: {', '.join(MUTABLE_FIELDS)}")
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{updates['status']}'. Valid: {', '.join(VALID_STATUSES)}")
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise ValueError(f"Invalid priority '{updates['priority']}'. Valid: {', '.join(VALID_PRIORITIES)}")

    row = await _ensure_db_row(db, plan_id)
    result = PlanUpdateResult(plan_id=plan_id)

    # Compute changes against DB state
    changes: List[Dict[str, Any]] = []
    for key, new_value in updates.items():
        old_value = getattr(row, key, None)
        old_str = str(old_value) if old_value is not None else ""
        if key == "markdown":
            # Don't compare full text for change record
            if old_value != new_value:
                changes.append({"field": "markdown"})
                row.markdown = new_value
        elif old_str != new_value:
            changes.append({"field": key, "old": old_str, "new": new_value})
            setattr(row, key, new_value)

    if not changes:
        return result

    # Track scope change
    old_scope = row.scope or _status_to_scope(row.status)
    if "status" in updates:
        row.scope = _status_to_scope(updates["status"])

    row.updated_at = utcnow()
    row.revision = (row.revision or 0) + 1
    result.changes = changes

    # Emit events
    sha = None
    await _emit_events(db, plan_id, changes, None)  # SHA filled after commit-back
    await db.commit()

    # Commit-back to filesystem
    try:
        new_scope = _status_to_scope(row.status)
        needs_move = new_scope != old_scope

        if needs_move:
            _move_plan_directory(plan_id, old_scope, new_scope)
            result.new_scope = new_scope

        written_paths = _export_plan_to_disk(row)

        # Git commit
        commit_parts = [f"plan({plan_id}):"]
        for c in changes:
            if c["field"] == "markdown":
                commit_parts.append("content updated")
            else:
                commit_parts.append(f"{c['field']} {c.get('old', '')}→{c.get('new', '')}")
        commit_msg = " ".join(commit_parts)
        if actor:
            commit_msg += f"\n\nActor: {actor}"

        if needs_move:
            sha = _git_commit_move(plan_id, old_scope, new_scope, commit_msg)
        else:
            sha = _git_commit(written_paths, commit_msg)

        result.commit_sha = sha
    except Exception as exc:
        logger.warning("plan_commit_back_failed", plan_id=plan_id, error=str(exc))

    # Invalidate filesystem cache
    import pixsim7.backend.main.services.docs.plans as plans_module
    plans_module._plans_cache = None

    logger.info(
        "plan_updated",
        plan_id=plan_id,
        changes=[c["field"] for c in changes],
        commit_sha=sha,
        actor=actor,
    )

    return result


async def get_plan_from_db(db: AsyncSession, plan_id: str) -> Optional[PlanRegistry]:
    """Get a plan from DB, bootstrapping from filesystem if not yet synced."""
    row = await db.get(PlanRegistry, plan_id)
    if row:
        return row

    # Auto-bootstrap this specific plan
    return await _ensure_db_row(db, plan_id)


async def list_plans_from_db(db: AsyncSession) -> List[PlanRegistry]:
    """List all plans from DB. If DB is empty, runs initial bootstrap."""
    rows = (await db.execute(select(PlanRegistry))).scalars().all()
    if rows:
        return list(rows)

    # DB empty — bootstrap from filesystem
    index = get_plans_index(refresh=True)
    entries = index.get("entries", {})
    if not entries:
        return []

    now = utcnow()
    result = []
    doc_count = 0
    repo_root = _resolve_repo_root()

    for plan_id, entry in entries.items():
        row = PlanRegistry(
            id=plan_id,
            title=entry.title,
            status=entry.status,
            stage=entry.stage,
            owner=entry.owner,
            priority=entry.priority,
            summary=entry.summary,
            scope=entry.scope,
            markdown=entry.markdown,
            plan_path=entry.plan_path,
            code_paths=entry.code_paths,
            companions=entry.companions,
            handoffs=entry.handoffs,
            tags=entry.tags,
            depends_on=entry.depends_on,
            revision=1,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        result.append(row)

    # Flush plan rows first so FK constraints are satisfied
    await db.flush()

    # Bootstrap companion/handoff documents
    for plan_id, entry in entries.items():
        for doc_path in entry.companions:
            doc = _read_plan_document(repo_root, plan_id, "companion", doc_path, now)
            if doc:
                db.add(doc)
                doc_count += 1
        for doc_path in entry.handoffs:
            doc = _read_plan_document(repo_root, plan_id, "handoff", doc_path, now)
            if doc:
                db.add(doc)
                doc_count += 1

    await db.commit()
    logger.info("plan_db_bootstrap", plan_count=len(result), doc_count=doc_count)
    return result


async def get_plan_documents(db: AsyncSession, plan_id: str) -> List[PlanDocument]:
    """Get all companion/handoff documents for a plan."""
    stmt = (
        select(PlanDocument)
        .where(PlanDocument.plan_id == plan_id)
        .order_by(PlanDocument.doc_type, PlanDocument.path)
    )
    return list((await db.execute(stmt)).scalars().all())


def get_active_assignment() -> Optional[Dict[str, Any]]:
    """
    Get the highest-priority active plan for agent assignment.

    Falls back to filesystem index (works even before DB bootstrap).
    """
    index = get_plans_index(refresh=True)
    entries = index.get("entries", {})

    active_plans = [e for e in entries.values() if e.status == "active"]
    if not active_plans:
        return None

    priority_rank = {"high": 0, "normal": 1, "low": 2}
    active_plans.sort(key=lambda e: (
        priority_rank.get(e.priority, 1),
        e.last_updated,
    ))

    plan = active_plans[0]
    return {
        "id": plan.id,
        "title": plan.title,
        "status": plan.status,
        "stage": plan.stage,
        "owner": plan.owner,
        "priority": plan.priority,
        "summary": plan.summary,
        "codePaths": plan.code_paths,
        "companions": plan.companions,
        "tags": plan.tags,
        "dependsOn": plan.depends_on,
    }
