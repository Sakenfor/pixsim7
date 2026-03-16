"""
Plan write service - DB-first with filesystem commit-back.

Plans are backed by Document (shared fields) + PlanRegistry (plan-specific fields).
The DB is the authority. Filesystem markdown is a convenience export.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import Document, PlanDocument, PlanEvent, PlanRegistry
from pixsim7.backend.main.services.docs.plans import (
    MANIFEST_FILENAMES,
    PLAN_SCOPES,
    PlanEntry,
    get_plans_index,
)
from pixsim7.backend.main.shared.config import _resolve_repo_root, settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

PLANS_DIR = "docs/plans"

# Fields that can be updated via the API.
# Doc fields go to Document, plan fields go to PlanRegistry.
DOC_MUTABLE_FIELDS = frozenset({"title", "status", "owner", "summary", "markdown", "visibility"})
PLAN_MUTABLE_FIELDS = frozenset(
    {
        "stage",
        "priority",
        "code_paths",
        "companions",
        "handoffs",
        "depends_on",
    }
)
LIST_MUTABLE_FIELDS = frozenset({"tags", "code_paths", "companions", "handoffs", "depends_on"})
ALL_MUTABLE_FIELDS = DOC_MUTABLE_FIELDS | PLAN_MUTABLE_FIELDS

VALID_STATUSES = ("active", "parked", "done", "blocked")
VALID_PRIORITIES = ("high", "normal", "low")


def _plans_db_only_mode() -> bool:
    return bool(getattr(settings, "plans_db_only_mode", False))


class PlanNotFoundError(ValueError):
    pass


class PlanWriteError(RuntimeError):
    pass


@dataclass
class PlanBundle:
    """Combined view of a plan: Document (shared) + PlanRegistry (plan-specific)."""
    plan: PlanRegistry
    doc: Document

    @property
    def id(self) -> str:
        return self.plan.id

    @property
    def document_id(self) -> str:
        return self.doc.id


@dataclass
class PlanUpdateResult:
    plan_id: str
    changes: List[Dict[str, Any]] = field(default_factory=list)
    commit_sha: Optional[str] = None
    new_scope: Optional[str] = None


# ---------------------------------------------------------------------------
# ID convention
# ---------------------------------------------------------------------------


def make_document_id(plan_id: str) -> str:
    return f"plan:{plan_id}"


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
    repo_root = _resolve_repo_root()
    for scope in PLAN_SCOPES:
        for name in MANIFEST_FILENAMES:
            candidate = repo_root / PLANS_DIR / scope / plan_id / name
            if candidate.exists():
                return candidate, scope
    return None


def _build_manifest_data(bundle: PlanBundle) -> Dict[str, Any]:
    """Build manifest dict from PlanBundle (reads shared fields from doc)."""
    doc, plan = bundle.doc, bundle.plan
    ts = plan.updated_at or doc.updated_at or utcnow()
    data: Dict[str, Any] = {
        "id": plan.id,
        "title": doc.title,
        "status": doc.status,
        "stage": plan.stage,
        "owner": doc.owner,
        "last_updated": ts.date().isoformat(),
        "priority": plan.priority,
        "summary": doc.summary or "",
        "plan_path": "./plan.md",
    }
    if plan.code_paths:
        data["code_paths"] = plan.code_paths
    if plan.companions:
        data["companions"] = plan.companions
    if plan.handoffs:
        data["handoffs"] = plan.handoffs
    if doc.tags:
        data["tags"] = doc.tags
    if plan.depends_on:
        data["depends_on"] = plan.depends_on
    return data


def export_plan_to_disk(bundle: PlanBundle) -> List[Path]:
    """Write manifest.yaml and plan.md to disk. Returns written paths."""
    repo_root = _resolve_repo_root()
    scope = _status_to_scope(bundle.doc.status)
    plan_dir = repo_root / PLANS_DIR / scope / bundle.plan.id

    manifest_path = plan_dir / "manifest.yaml"
    plan_md_path = plan_dir / "plan.md"

    _write_manifest(manifest_path, _build_manifest_data(bundle))

    if bundle.doc.markdown:
        _write_plan_md(plan_md_path, bundle.doc.markdown)

    return [manifest_path, plan_md_path]


def _move_plan_directory(plan_id: str, old_scope: str, new_scope: str) -> None:
    repo_root = _resolve_repo_root()
    old_dir = repo_root / PLANS_DIR / old_scope / plan_id
    new_dir = repo_root / PLANS_DIR / new_scope / plan_id

    if not old_dir.exists():
        return
    if new_dir.exists():
        raise PlanWriteError(f"Target directory already exists: {new_dir}")

    new_dir.parent.mkdir(parents=True, exist_ok=True)
    old_dir.rename(new_dir)


# ---------------------------------------------------------------------------
# Git operations
# ---------------------------------------------------------------------------


def _git_commit(paths: List[Path], message: str) -> Optional[str]:
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
        logger.warning("plan_git_commit_failed", error=str(exc))
        return None


def _git_commit_move(plan_id: str, old_scope: str, new_scope: str, message: str) -> Optional[str]:
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
    full_path = repo_root / doc_path
    if not full_path.exists() or not full_path.is_file():
        logger.warning("plan_doc_missing", plan_id=plan_id, doc_type=doc_type, path=doc_path)
        return None

    try:
        markdown = full_path.read_text(encoding="utf-8")
    except Exception:
        logger.warning("plan_doc_read_failed", plan_id=plan_id, path=doc_path)
        return None

    title = full_path.stem.replace("-", " ").replace("_", " ").title()
    for line in markdown.split("\n", 5):
        if line.startswith("# "):
            title = line[2:].strip()
            break

    return PlanDocument(
        plan_id=plan_id, doc_type=doc_type, path=doc_path,
        title=title, markdown=markdown, created_at=now, updated_at=now,
    )


def _create_document_for_plan(
    plan_id: str,
    *,
    title: str,
    status: str = "active",
    owner: str = "unassigned",
    summary: str = "",
    markdown: Optional[str] = None,
    user_id: Optional[int] = None,
    visibility: str = "public",
    tags: Optional[List[str]] = None,
) -> Document:
    """Create a new Document for a plan."""
    now = utcnow()
    return Document(
        id=make_document_id(plan_id),
        doc_type="plan",
        title=title,
        status=status,
        owner=owner,
        summary=summary,
        markdown=markdown,
        user_id=user_id,
        visibility=visibility,
        tags=tags or [],
        revision=1,
        created_at=now,
        updated_at=now,
    )


def _apply_entry_to_doc(doc: Document, entry: PlanEntry) -> None:
    """Apply filesystem PlanEntry shared fields to Document."""
    doc.title = entry.title
    doc.status = entry.status
    doc.owner = entry.owner
    doc.summary = entry.summary
    doc.markdown = entry.markdown
    doc.tags = entry.tags
    doc.updated_at = utcnow()


def _apply_entry_to_plan(plan: PlanRegistry, entry: PlanEntry, manifest_hash: str) -> None:
    """Apply filesystem PlanEntry plan-specific fields to PlanRegistry."""
    plan.stage = entry.stage
    plan.priority = entry.priority
    plan.scope = entry.scope
    plan.plan_path = entry.plan_path
    plan.code_paths = entry.code_paths
    plan.companions = entry.companions
    plan.handoffs = entry.handoffs
    plan.depends_on = entry.depends_on
    plan.manifest_hash = manifest_hash
    plan.last_synced_at = utcnow()
    plan.updated_at = utcnow()


async def _load_bundle(db: AsyncSession, plan_id: str) -> Optional[PlanBundle]:
    """Load PlanRegistry + Document for a plan."""
    plan = await db.get(PlanRegistry, plan_id)
    if not plan:
        return None
    doc = await db.get(Document, plan.document_id)
    if not doc:
        return None
    return PlanBundle(plan=plan, doc=doc)


async def _ensure_bundle(
    db: AsyncSession, plan_id: str, defaults: Optional[Dict[str, Any]] = None,
) -> PlanBundle:
    """Get or create PlanBundle. If creating, bootstraps from filesystem."""
    bundle = await _load_bundle(db, plan_id)
    if bundle:
        return bundle

    if _plans_db_only_mode():
        raise PlanNotFoundError(f"Plan not found in DB: {plan_id}")

    # Bootstrap from filesystem
    index = get_plans_index(refresh=True)
    entry = index.get("entries", {}).get(plan_id)

    now = utcnow()
    d = defaults or {}
    doc_id = make_document_id(plan_id)

    doc = Document(
        id=doc_id,
        doc_type="plan",
        title=entry.title if entry else d.get("title", plan_id),
        status=entry.status if entry else d.get("status", "active"),
        owner=entry.owner if entry else d.get("owner", "unassigned"),
        summary=entry.summary if entry else d.get("summary", ""),
        markdown=entry.markdown if entry else d.get("markdown"),
        user_id=d.get("user_id"),
        visibility=d.get("visibility", "public"),
        tags=entry.tags if entry else d.get("tags", []),
        revision=1,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    await db.flush()

    plan = PlanRegistry(
        id=plan_id,
        document_id=doc_id,
        stage=entry.stage if entry else d.get("stage", "unknown"),
        priority=entry.priority if entry else d.get("priority", "normal"),
        scope=entry.scope if entry else "active",
        plan_path=entry.plan_path if entry else None,
        code_paths=entry.code_paths if entry else [],
        companions=entry.companions if entry else [],
        handoffs=entry.handoffs if entry else [],
        depends_on=entry.depends_on if entry else [],
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    await db.flush()
    return PlanBundle(plan=plan, doc=doc)


async def _emit_events(
    db: AsyncSession,
    plan_id: str,
    changes: List[Dict[str, Any]],
    commit_sha: Optional[str],
) -> None:
    now = utcnow()
    for change in changes:
        if change["field"] == "markdown":
            db.add(PlanEvent(
                plan_id=plan_id, event_type="content_updated",
                field="markdown", commit_sha=commit_sha, timestamp=now,
            ))
        else:
            db.add(PlanEvent(
                plan_id=plan_id, event_type="field_changed",
                field=change["field"], old_value=change.get("old"),
                new_value=change.get("new"), commit_sha=commit_sha, timestamp=now,
            ))


async def _emit_plan_notification(
    db: AsyncSession,
    plan_id: str,
    title: str,
    changes: List[Dict[str, Any]],
    actor: Optional[str] = None,
) -> None:
    """Emit a notification for significant plan changes."""
    from pixsim7.backend.main.api.v1.notifications import emit_notification

    # Only notify on significant changes (status, not markdown edits)
    significant = [c for c in changes if c["field"] in ("status", "stage", "priority", "owner")]
    if not significant:
        return

    parts = []
    for c in significant:
        if c["field"] == "status":
            parts.append(f"status -> {c.get('new', '?')}")
        else:
            parts.append(f"{c['field']} -> {c.get('new', '?')}")

    body = f"**{title}**: {', '.join(parts)}"
    if actor:
        body += f" (by {actor})"

    await emit_notification(
        db,
        title=f"Plan updated: {title}",
        body=body,
        category="plan",
        severity="info",
        source=actor or "system",
        ref_type="plan",
        ref_id=plan_id,
    )


async def emit_plan_created_notification(
    db: AsyncSession,
    plan_id: str,
    title: str,
    actor: Optional[str] = None,
) -> None:
    """Emit a notification when a plan is created."""
    from pixsim7.backend.main.api.v1.notifications import emit_notification

    body = f"New plan: **{title}**"
    if actor:
        body += f" (by {actor})"

    await emit_notification(
        db,
        title=f"Plan created: {title}",
        body=body,
        category="plan",
        severity="success",
        source=actor or "system",
        ref_type="plan",
        ref_id=plan_id,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def update_plan(
    db: AsyncSession,
    plan_id: str,
    updates: Dict[str, Any],
    actor: Optional[str] = None,
) -> PlanUpdateResult:
    """
    Apply field updates to a plan (DB-first).

    Routes updates: doc fields -> Document, plan fields -> PlanRegistry.
    Emits PlanEvents, exports to disk, commits to git.
    """
    for key in updates:
        if key not in ALL_MUTABLE_FIELDS:
            raise ValueError(f"Cannot update field '{key}'. Mutable: {', '.join(sorted(ALL_MUTABLE_FIELDS))}")
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{updates['status']}'. Valid: {', '.join(VALID_STATUSES)}")
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise ValueError(f"Invalid priority '{updates['priority']}'. Valid: {', '.join(VALID_PRIORITIES)}")
    for key in LIST_MUTABLE_FIELDS:
        if key in updates:
            value = updates[key]
            if value is None:
                updates[key] = []
                continue
            if not isinstance(value, list) or any(not isinstance(v, str) for v in value):
                raise ValueError(f"Invalid {key!r}: expected list[str]")

    bundle = await _ensure_bundle(db, plan_id)
    doc, plan = bundle.doc, bundle.plan
    result = PlanUpdateResult(plan_id=plan_id)

    # Compute changes, route to correct table
    changes: List[Dict[str, Any]] = []
    for key, new_value in updates.items():
        if key in DOC_MUTABLE_FIELDS:
            target = doc
        else:
            target = plan

        old_value = getattr(target, key, None)
        old_str = str(old_value) if old_value is not None else ""

        if key == "markdown":
            if old_value != new_value:
                changes.append({"field": "markdown"})
                doc.markdown = new_value
        elif key in LIST_MUTABLE_FIELDS:
            old_list = old_value or []
            new_list = new_value or []
            if sorted(old_list) != sorted(new_list):
                changes.append(
                    {
                        "field": key,
                        "old": ", ".join(old_list),
                        "new": ", ".join(new_list),
                    }
                )
                setattr(target, key, new_list)
        elif old_str != new_value:
            changes.append({"field": key, "old": old_str, "new": new_value})
            setattr(target, key, new_value)

    if not changes:
        return result

    # Track scope change
    old_scope = plan.scope or _status_to_scope(doc.status)
    if "status" in updates:
        plan.scope = _status_to_scope(updates["status"])

    now = utcnow()
    plan.updated_at = now
    doc.updated_at = now
    doc.revision = (doc.revision or 0) + 1
    result.changes = changes

    # Emit events + notification
    sha = None
    await _emit_events(db, plan_id, changes, None)
    await _emit_plan_notification(db, plan_id, doc.title, changes, actor)
    await db.commit()

    # Optional commit-back to filesystem (disabled in DB-only mode)
    if not _plans_db_only_mode():
        try:
            new_scope = _status_to_scope(doc.status)
            needs_move = new_scope != old_scope

            if needs_move:
                _move_plan_directory(plan_id, old_scope, new_scope)
                result.new_scope = new_scope

            written_paths = export_plan_to_disk(bundle)

            commit_parts = [f"plan({plan_id}):"]
            for c in changes:
                if c["field"] == "markdown":
                    commit_parts.append("content updated")
                else:
                    commit_parts.append(f"{c['field']} {c.get('old', '')}->{c.get('new', '')}")
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


async def get_plan_bundle(db: AsyncSession, plan_id: str) -> Optional[PlanBundle]:
    """Get a plan bundle from DB, bootstrapping from filesystem if not yet synced."""
    bundle = await _load_bundle(db, plan_id)
    if bundle:
        return bundle
    if _plans_db_only_mode():
        return None
    return await _ensure_bundle(db, plan_id)


async def load_children(db: AsyncSession, parent_id: str) -> List[PlanBundle]:
    """Load all direct child plans of a parent."""
    child_plans = (
        await db.execute(
            select(PlanRegistry).where(PlanRegistry.parent_id == parent_id)
        )
    ).scalars().all()
    if not child_plans:
        return []

    doc_ids = [p.document_id for p in child_plans]
    docs = (
        await db.execute(select(Document).where(Document.id.in_(doc_ids)))
    ).scalars().all()
    doc_map = {d.id: d for d in docs}

    return [
        PlanBundle(plan=p, doc=doc_map[p.document_id])
        for p in child_plans
        if p.document_id in doc_map
    ]


async def list_plan_bundles(db: AsyncSession) -> List[PlanBundle]:
    """List all plans from DB as bundles. If DB is empty, runs initial bootstrap."""
    rows = (await db.execute(select(PlanRegistry))).scalars().all()

    if rows:
        # Batch-load all documents
        doc_ids = [r.document_id for r in rows]
        docs_result = await db.execute(
            select(Document).where(Document.id.in_(doc_ids))
        )
        doc_map = {d.id: d for d in docs_result.scalars().all()}
        return [
            PlanBundle(plan=r, doc=doc_map[r.document_id])
            for r in rows
            if r.document_id in doc_map
        ]

    # DB empty - optionally bootstrap from filesystem
    if _plans_db_only_mode():
        return []

    index = get_plans_index(refresh=True)
    entries = index.get("entries", {})
    if not entries:
        return []

    now = utcnow()
    bundles: List[PlanBundle] = []
    companion_count = 0
    repo_root = _resolve_repo_root()

    for plan_id, entry in entries.items():
        doc_id = make_document_id(plan_id)
        doc = Document(
            id=doc_id,
            doc_type="plan",
            title=entry.title,
            status=entry.status,
            owner=entry.owner,
            summary=entry.summary,
            markdown=entry.markdown,
            visibility="public",
            tags=entry.tags,
            revision=1,
            created_at=now,
            updated_at=now,
        )
        db.add(doc)

        plan = PlanRegistry(
            id=plan_id,
            document_id=doc_id,
            stage=entry.stage,
            priority=entry.priority,
            scope=entry.scope,
            plan_path=entry.plan_path,
            code_paths=entry.code_paths,
            companions=entry.companions,
            handoffs=entry.handoffs,
            depends_on=entry.depends_on,
            created_at=now,
            updated_at=now,
        )
        db.add(plan)
        bundles.append(PlanBundle(plan=plan, doc=doc))

    await db.flush()

    # Bootstrap companion/handoff documents
    for plan_id, entry in entries.items():
        for doc_path in entry.companions:
            pdoc = _read_plan_document(repo_root, plan_id, "companion", doc_path, now)
            if pdoc:
                db.add(pdoc)
                companion_count += 1
        for doc_path in entry.handoffs:
            pdoc = _read_plan_document(repo_root, plan_id, "handoff", doc_path, now)
            if pdoc:
                db.add(pdoc)
                companion_count += 1

    await db.commit()
    logger.info("plan_db_bootstrap", plan_count=len(bundles), doc_count=companion_count)
    return bundles


async def get_plan_documents(db: AsyncSession, plan_id: str) -> List[PlanDocument]:
    stmt = (
        select(PlanDocument)
        .where(PlanDocument.plan_id == plan_id)
        .order_by(PlanDocument.doc_type, PlanDocument.path)
    )
    return list((await db.execute(stmt)).scalars().all())


def get_active_assignment() -> Optional[Dict[str, Any]]:
    """Get the highest-priority active plan for agent assignment.

    Falls back to filesystem index (works even before DB bootstrap).
    """
    if _plans_db_only_mode():
        return None

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
