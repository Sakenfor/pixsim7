"""
Plan write service - DB-first with filesystem commit-back.

Plans are backed by Document (shared fields) + PlanRegistry (plan-specific fields).
The DB is the authority. Filesystem markdown is a convenience export.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import (
    Document,
    PlanDocument,
    PlanParticipant,
    PlanReviewLink,
    PlanReviewNode,
    PlanRequest,
    PlanReviewRound,
    PlanRegistry,
    PlanRevision,
)
from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.services.docs.plans import (
    MANIFEST_FILENAMES,
    PLAN_SCOPES,
    PlanEntry,
    get_plans_index,
)
from pixsim7.backend.main.services.docs.plan_stages import (
    CANONICAL_PLAN_PRIORITIES,
    CANONICAL_PLAN_STATUSES,
    CANONICAL_TASK_SCOPES,
    normalize_plan_stage,
)
from pixsim7.backend.main.services.notifications.notification_categories import (
    NotificationCategoryGranularityOption,
    NotificationCategorySpec,
    notification_category_registry,
)
from pixsim7.backend.main.shared.config import _resolve_repo_root, settings
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

PLANS_DIR = "docs/plans"

# Fields that can be updated via the API.
# Doc fields go to Document, plan fields go to PlanRegistry.
DOC_MUTABLE_FIELDS = frozenset({"title", "status", "owner", "summary", "markdown", "visibility", "namespace"})

# Plan-specific list fields (JSON columns holding List[str]).
# Single source of truth — add new list fields here only.
PLAN_LIST_FIELDS = ("code_paths", "companions", "handoffs", "depends_on", "phases")

PLAN_MUTABLE_FIELDS = frozenset(
    {"stage", "priority", "task_scope", "plan_type", "target", "checkpoints", "parent_id"}
    | set(PLAN_LIST_FIELDS)
)
LIST_MUTABLE_FIELDS = frozenset({"tags"} | set(PLAN_LIST_FIELDS))
JSON_MUTABLE_FIELDS = frozenset({"target", "checkpoints"})
ALL_MUTABLE_FIELDS = DOC_MUTABLE_FIELDS | PLAN_MUTABLE_FIELDS

VALID_STATUSES = CANONICAL_PLAN_STATUSES
VALID_PRIORITIES = CANONICAL_PLAN_PRIORITIES
VALID_TASK_SCOPES = CANONICAL_TASK_SCOPES

# Statuses hidden from default listings (require explicit include flag).
HIDDEN_STATUSES = frozenset({"removed", "archived"})


def _validate_checkpoints(raw: list) -> list[dict]:
    """Validate checkpoint dicts against the Checkpoint schema.

    Each dict must have at least 'id'. The Checkpoint model fills defaults
    (label="", status="pending") and preserves extra keys.
    Returns a list of validated dicts (round-tripped through model_validate).
    """
    from pixsim7.backend.main.api.v1.plans.schemas import Checkpoint

    validated = []
    for i, cp in enumerate(raw):
        if not isinstance(cp, dict):
            raise ValueError(f"Invalid checkpoint at index {i}: expected object")
        if "id" not in cp:
            raise ValueError(f"Invalid checkpoint at index {i}: missing required 'id'")
        try:
            validated.append(Checkpoint.model_validate(cp).model_dump(by_alias=False, exclude_none=True))
        except Exception as exc:
            raise ValueError(f"Invalid checkpoint '{cp.get('id', f'index {i}')}': {exc}") from exc
    return validated

_PLAN_NOTIFICATION_SYSTEM_ID = "plan"
_PLAN_NOTIFICATION_SYSTEM_LABEL = "Plans"


def _plan_opt(id: str, label: str, description: str = "") -> NotificationCategoryGranularityOption:
    return NotificationCategoryGranularityOption(id=id, label=label, description=description)


_PLAN_STATUS_OFF = [
    _plan_opt("all_changes", "All changes", "Show all change notifications"),
    _plan_opt("status_only", "Status changes only", "Only show status transitions"),
    _plan_opt("off", "Off", "Suppress all notifications"),
]

_PLAN_ALL_OFF = [
    _plan_opt("all", "All", "Show all notifications"),
    _plan_opt("off", "Off", "Suppress all notifications"),
]

_PLAN_NOTIFICATION_CATEGORIES: List[NotificationCategorySpec] = [
    NotificationCategorySpec(
        id="plan",
        label="Plans",
        description="Plan status changes and updates",
        icon="clipboard",
        default_enabled=True,
        default_granularity="all_changes",
        granularity_options=_PLAN_STATUS_OFF,
        sort_order=20,
        system_id=_PLAN_NOTIFICATION_SYSTEM_ID,
        system_label=_PLAN_NOTIFICATION_SYSTEM_LABEL,
    ),
    NotificationCategorySpec(
        id="plan.created",
        label="Created",
        description="New plans created",
        icon="plus",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_PLAN_ALL_OFF,
        sort_order=21,
        system_id=_PLAN_NOTIFICATION_SYSTEM_ID,
        system_label=_PLAN_NOTIFICATION_SYSTEM_LABEL,
        parent_category_id="plan",
    ),
    NotificationCategorySpec(
        id="plan.status",
        label="Status",
        description="Plan status changes",
        icon="checkCircle",
        default_enabled=True,
        default_granularity="all_changes",
        granularity_options=_PLAN_STATUS_OFF,
        sort_order=22,
        system_id=_PLAN_NOTIFICATION_SYSTEM_ID,
        system_label=_PLAN_NOTIFICATION_SYSTEM_LABEL,
        parent_category_id="plan",
    ),
    NotificationCategorySpec(
        id="plan.stage",
        label="Stage",
        description="Plan stage updates",
        icon="layers",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_PLAN_ALL_OFF,
        sort_order=23,
        system_id=_PLAN_NOTIFICATION_SYSTEM_ID,
        system_label=_PLAN_NOTIFICATION_SYSTEM_LABEL,
        parent_category_id="plan",
    ),
    NotificationCategorySpec(
        id="plan.priority",
        label="Priority",
        description="Plan priority changes",
        icon="arrowUp",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_PLAN_ALL_OFF,
        sort_order=24,
        system_id=_PLAN_NOTIFICATION_SYSTEM_ID,
        system_label=_PLAN_NOTIFICATION_SYSTEM_LABEL,
        parent_category_id="plan",
    ),
    NotificationCategorySpec(
        id="plan.owner",
        label="Owner",
        description="Plan ownership changes",
        icon="user",
        default_enabled=True,
        default_granularity="all",
        granularity_options=_PLAN_ALL_OFF,
        sort_order=25,
        system_id=_PLAN_NOTIFICATION_SYSTEM_ID,
        system_label=_PLAN_NOTIFICATION_SYSTEM_LABEL,
        parent_category_id="plan",
    ),
]


def register_plan_notification_categories() -> None:
    """Register plan-owned notification categories and subcategories."""
    for spec in _PLAN_NOTIFICATION_CATEGORIES:
        notification_category_registry.register(spec.id, spec)


register_plan_notification_categories()


def _plans_db_only_mode() -> bool:
    return bool(getattr(settings, "plans_db_only_mode", False))


class PlanNotFoundError(ValueError):
    pass


class PlanWriteError(RuntimeError):
    pass


class PlanRevisionConflictError(ValueError):
    def __init__(self, *, expected_revision: int, current_revision: int):
        self.expected_revision = int(expected_revision)
        self.current_revision = int(current_revision)
        super().__init__(
            f"Plan revision conflict: expected {self.expected_revision}, current {self.current_revision}"
        )


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
    revision: Optional[int] = None


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
    "priority", "summary", "plan_path", "target", "checkpoints", "code_paths",
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


def status_to_scope(status: str) -> str:
    """Map plan status to filesystem scope directory."""
    if status in ("active", "blocked"):
        return "active"
    if status == "done":
        return "done"
    # archived and removed plans park alongside parked ones on disk
    return "parked"


def _json_fingerprint(value: Any) -> str:
    """Stable string form for complex JSON values in change tracking/events."""
    if value is None:
        return ""
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    except TypeError:
        return str(value)


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
    for field in PLAN_LIST_FIELDS:
        val = getattr(plan, field, None)
        if val:
            data[field] = val
    if plan.target is not None:
        data["target"] = plan.target
    if plan.checkpoints is not None:
        data["checkpoints"] = plan.checkpoints
    if doc.tags:
        data["tags"] = doc.tags
    return data


def export_plan_to_disk(bundle: PlanBundle) -> List[Path]:
    """Write manifest.yaml and plan.md to disk. Returns written paths."""
    repo_root = _resolve_repo_root()
    scope = status_to_scope(bundle.doc.status)
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
# Git query helpers (used by the API layer for commit traceability)
# ---------------------------------------------------------------------------


def git_resolve_head() -> Optional[str]:
    """Resolve current HEAD commit SHA (full 40-char hex)."""
    repo_root = _resolve_repo_root()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root), capture_output=True, text=True, timeout=10,
        )
        sha = result.stdout.strip()
        return sha if result.returncode == 0 and sha else None
    except subprocess.SubprocessError:
        return None


def git_verify_commit(sha: str) -> bool:
    """Check whether *sha* resolves to a commit object in the repo."""
    repo_root = _resolve_repo_root()
    try:
        result = subprocess.run(
            ["git", "cat-file", "-t", sha],
            cwd=str(repo_root), capture_output=True, text=True, timeout=10,
        )
        return result.returncode == 0 and result.stdout.strip() == "commit"
    except subprocess.SubprocessError:
        return False


def git_rev_list(range_spec: str, max_count: int = 50) -> List[str]:
    """Expand a git range (e.g. ``sha1..sha2``) into individual commit SHAs.

    Returns an empty list if the range is invalid or git is unavailable.
    Caps output at *max_count* to prevent runaway expansion.
    """
    repo_root = _resolve_repo_root()
    try:
        result = subprocess.run(
            ["git", "rev-list", "--max-count", str(max_count), range_spec],
            cwd=str(repo_root), capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return []
        return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]
    except subprocess.SubprocessError:
        return []


def git_forge_commit_url_template() -> Optional[str]:
    """Derive a commit URL template from the origin remote.

    Returns a string with ``{sha}`` placeholder, e.g.
    ``https://github.com/org/repo/commit/{sha}``, or *None*.
    """
    repo_root = _resolve_repo_root()
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=str(repo_root), capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        url = result.stdout.strip()
    except subprocess.SubprocessError:
        return None

    if not url:
        return None

    import re as _re

    # SSH: git@github.com:org/repo.git
    m = _re.match(r"git@([^:]+):(.+?)(?:\.git)?$", url)
    if m:
        return f"https://{m.group(1)}/{m.group(2)}/commit/{{sha}}"

    # HTTPS: https://github.com/org/repo.git
    m = _re.match(r"https?://([^/]+)/(.+?)(?:\.git)?$", url)
    if m:
        return f"https://{m.group(1)}/{m.group(2)}/commit/{{sha}}"

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
    namespace: Optional[str] = "dev/plans",
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
        namespace=namespace,
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
    plan.stage = normalize_plan_stage(entry.stage, strict=False)
    plan.priority = entry.priority
    plan.scope = entry.scope
    plan.plan_path = entry.plan_path
    for field in PLAN_LIST_FIELDS:
        setattr(plan, field, getattr(entry, field, None))
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
        namespace=d.get("namespace", "dev/plans"),
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
        stage=(
            normalize_plan_stage(entry.stage, strict=False)
            if entry
            else normalize_plan_stage(str(d.get("stage", "unknown")), strict=False)
        ),
        priority=entry.priority if entry else d.get("priority", "normal"),
        scope=entry.scope if entry else "active",
        plan_path=entry.plan_path if entry else None,
        **{f: (getattr(entry, f, None) if entry else []) for f in PLAN_LIST_FIELDS},
        created_at=now,
        updated_at=now,
    )
    db.add(plan)
    await db.flush()
    return PlanBundle(plan=plan, doc=doc)


def _snapshot_timestamp(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _build_plan_snapshot(bundle: PlanBundle) -> Dict[str, Any]:
    """Serialize current Document + PlanRegistry state to JSON-friendly snapshot."""
    doc, plan = bundle.doc, bundle.plan
    return {
        "doc": {
            "id": doc.id,
            "doc_type": doc.doc_type,
            "title": doc.title,
            "status": doc.status,
            "owner": doc.owner,
            "summary": doc.summary,
            "markdown": doc.markdown,
            "user_id": doc.user_id,
            "visibility": doc.visibility,
            "namespace": doc.namespace,
            "tags": list(doc.tags or []),
            "extra": doc.extra,
            "revision": doc.revision,
            "created_at": _snapshot_timestamp(doc.created_at),
            "updated_at": _snapshot_timestamp(doc.updated_at),
        },
        "plan": {
            "id": plan.id,
            "document_id": plan.document_id,
            "parent_id": plan.parent_id,
            "stage": plan.stage,
            "priority": plan.priority,
            "scope": plan.scope,
            "task_scope": plan.task_scope,
            "plan_type": plan.plan_type,
            "target": plan.target,
            "checkpoints": plan.checkpoints,
            "plan_path": plan.plan_path,
            **{f: list(getattr(plan, f, None) or []) for f in PLAN_LIST_FIELDS},
            "manifest_hash": plan.manifest_hash,
            "last_synced_at": _snapshot_timestamp(plan.last_synced_at),
            "created_at": _snapshot_timestamp(plan.created_at),
            "updated_at": _snapshot_timestamp(plan.updated_at),
        },
    }


async def record_plan_revision(
    db: AsyncSession,
    bundle: PlanBundle,
    *,
    event_type: str,
    actor: Optional[str],
    commit_sha: Optional[str],
    changed_fields: Optional[List[str]] = None,
    restore_from_revision: Optional[int] = None,
) -> PlanRevision:
    """Persist an immutable revision snapshot for a plan."""
    max_revision = (
        await db.execute(
            select(func.max(PlanRevision.revision)).where(
                PlanRevision.plan_id == bundle.plan.id
            )
        )
    ).scalar_one_or_none()
    next_revision = int(max_revision or 0) + 1

    row = PlanRevision(
        plan_id=bundle.plan.id,
        document_id=bundle.doc.id,
        revision=next_revision,
        event_type=event_type,
        actor=actor,
        commit_sha=commit_sha,
        changed_fields=list(changed_fields or []),
        restore_from_revision=restore_from_revision,
        snapshot=_build_plan_snapshot(bundle),
    )
    db.add(row)
    return row


async def _emit_plan_notification(
    db: AsyncSession,
    plan_id: str,
    title: str,
    changes: List[Dict[str, Any]],
    principal=None,
) -> None:
    """Emit a notification for significant plan changes."""
    from pixsim7.backend.main.api.v1.notifications import emit_notification

    # Only notify on significant changes (status, not markdown edits)
    significant = [c for c in changes if c["field"] in ("status", "stage", "priority", "owner")]
    if not significant:
        return

    # Route to the most significant matching subcategory for preference filtering.
    preferred_field_order = ("status", "stage", "priority", "owner")
    subcategory = "plan"
    for field in preferred_field_order:
        if any(c["field"] == field for c in significant):
            subcategory = f"plan.{field}"
            break

    parts = []
    for c in significant:
        if c["field"] == "status":
            parts.append(f"status -> {c.get('new', '?')}")
        else:
            parts.append(f"{c['field']} -> {c.get('new', '?')}")

    source = principal.source if principal else "system"
    actor_name = principal.actor_display_name if principal else None
    actor_user_id = principal.user_id if principal else None

    await emit_notification(
        db,
        title=f"Plan updated: {title}",
        body=f"**{title}**: {', '.join(parts)}",
        category=subcategory,
        severity="info",
        source=source,
        event_type="plan.updated",
        actor_name=actor_name,
        actor_user_id=actor_user_id,
        ref_type="plan",
        ref_id=plan_id,
        payload={
            "changes": [
                {
                    "field": c["field"],
                    "old": c.get("old"),
                    "new": c.get("new"),
                }
                for c in significant
            ],
            "planTitle": title,
        },
    )


async def emit_plan_created_notification(
    db: AsyncSession,
    plan_id: str,
    title: str,
    principal=None,
    # Legacy kwargs kept for any remaining callers
    actor: Optional[str] = None,
    actor_name: Optional[str] = None,
    actor_user_id: Optional[int] = None,
) -> None:
    """Emit a notification when a plan is created."""
    from pixsim7.backend.main.api.v1.notifications import emit_notification

    source = principal.source if principal else (actor or "system")
    name = principal.actor_display_name if principal else actor_name
    uid = principal.user_id if principal else actor_user_id

    await emit_notification(
        db,
        title=f"Plan created: {title}",
        body=f"New plan: **{title}**",
        category="plan.created",
        severity="success",
        source=source,
        event_type="plan.created",
        actor_name=name,
        actor_user_id=uid,
        ref_type="plan",
        ref_id=plan_id,
        payload={"planTitle": title},
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def update_plan(
    db: AsyncSession,
    plan_id: str,
    updates: Dict[str, Any],
    principal=None,
    evidence_commit_sha: Optional[str] = None,
    expected_revision: Optional[int] = None,
    revision_event_type: str = "update",
    restore_from_revision: Optional[int] = None,
) -> PlanUpdateResult:
    """
    Apply field updates to a plan (DB-first).

    Routes updates: doc fields -> Document, plan fields -> PlanRegistry.
    Emits audit entries, exports to disk, commits to git.
    """
    for key in updates:
        if key not in ALL_MUTABLE_FIELDS:
            raise ValueError(f"Cannot update field '{key}'. Mutable: {', '.join(sorted(ALL_MUTABLE_FIELDS))}")
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{updates['status']}'. Valid: {', '.join(VALID_STATUSES)}")
    if "stage" in updates:
        stage_value = updates["stage"]
        if not isinstance(stage_value, str) or not stage_value.strip():
            raise ValueError("Invalid 'stage': expected non-empty string")
        updates["stage"] = normalize_plan_stage(stage_value, strict=False)
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise ValueError(f"Invalid priority '{updates['priority']}'. Valid: {', '.join(VALID_PRIORITIES)}")
    if "task_scope" in updates and updates["task_scope"] not in VALID_TASK_SCOPES:
        raise ValueError(f"Invalid task_scope '{updates['task_scope']}'. Valid: {', '.join(VALID_TASK_SCOPES)}")
    if "plan_type" in updates:
        plan_type = updates["plan_type"]
        if not isinstance(plan_type, str) or not plan_type.strip():
            raise ValueError("Invalid 'plan_type': expected non-empty string")
    for key in LIST_MUTABLE_FIELDS:
        if key in updates:
            value = updates[key]
            if value is None:
                updates[key] = []
                continue
            if not isinstance(value, list) or any(not isinstance(v, str) for v in value):
                raise ValueError(f"Invalid {key!r}: expected list[str]")
    if "target" in updates:
        target = updates["target"]
        if target is not None and not isinstance(target, dict):
            raise ValueError("Invalid 'target': expected object or null")
    if "checkpoints" in updates:
        checkpoints = updates["checkpoints"]
        if checkpoints is None:
            updates["checkpoints"] = []
        elif not isinstance(checkpoints, list):
            raise ValueError("Invalid 'checkpoints': expected list[object] or null")
        else:
            updates["checkpoints"] = _validate_checkpoints(checkpoints)

    actor_source = principal.source if principal else None

    bundle = await _ensure_bundle(db, plan_id)
    doc, plan = bundle.doc, bundle.plan
    if isinstance(expected_revision, int):
        current_revision = int(getattr(doc, "revision", 0) or 0)
        if current_revision != expected_revision:
            raise PlanRevisionConflictError(
                expected_revision=expected_revision,
                current_revision=current_revision,
            )
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
        elif key in JSON_MUTABLE_FIELDS:
            old_json = _json_fingerprint(old_value)
            new_json = _json_fingerprint(new_value)
            if old_json != new_json:
                changes.append({"field": key, "old": old_json, "new": new_json})
                setattr(target, key, new_value)
        elif old_str != new_value:
            changes.append({"field": key, "old": old_str, "new": new_value})
            setattr(target, key, new_value)

    if not changes:
        return result

    # Track scope change
    old_scope = plan.scope or status_to_scope(doc.status)
    if "status" in updates:
        plan.scope = status_to_scope(updates["status"])

    now = utcnow()
    plan.updated_at = now
    doc.updated_at = now
    doc.revision = (doc.revision or 0) + 1
    result.changes = changes

    # Audit: PlanRegistry.__audit__ and Document.__audit__ use excluded_fields mode,
    # so most field changes are tracked automatically by model hooks.
    # Emit explicit audit entries only for fields excluded from hooks (e.g. markdown).
    if evidence_commit_sha:
        from pixsim7.backend.main.services.audit.context import set_audit_commit_sha
        set_audit_commit_sha(evidence_commit_sha)

    _HOOK_EXCLUDED = {"markdown"}
    manual_changes = [c for c in changes if c["field"] in _HOOK_EXCLUDED]
    if manual_changes:
        from pixsim7.backend.main.services.audit import AuditService
        await AuditService(db).record_changes(
            domain="plan",
            entity_type="plan_registry",
            entity_id=plan_id,
            entity_label=doc.title,
            changes=manual_changes,
            plan_id=plan_id,
            commit_sha=evidence_commit_sha,
        )
    revision_row = await record_plan_revision(
        db,
        bundle,
        event_type=revision_event_type,
        actor=actor_source,
        commit_sha=evidence_commit_sha,
        changed_fields=[c["field"] for c in changes],
        restore_from_revision=restore_from_revision,
    )
    result.revision = revision_row.revision
    await _emit_plan_notification(db, plan_id, doc.title, changes, principal=principal)
    await db.commit()

    # Optional commit-back to filesystem (disabled in DB-only mode)
    sha: Optional[str] = None
    if not _plans_db_only_mode():
        try:
            new_scope = status_to_scope(doc.status)
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
            if actor_source:
                commit_msg += f"\n\nActor: {actor_source}"

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
        actor=actor_source,
    )

    return result


# ---------------------------------------------------------------------------
# Archive / delete
# ---------------------------------------------------------------------------


async def archive_plan(
    db: AsyncSession,
    plan_id: str,
    *,
    principal=None,
    evidence_commit_sha: Optional[str] = None,
) -> PlanUpdateResult:
    """Archive a plan (status → archived). Reversible via unarchive."""
    return await update_plan(
        db, plan_id, {"status": "archived"},
        principal=principal, evidence_commit_sha=evidence_commit_sha,
    )


async def unarchive_plan(
    db: AsyncSession,
    plan_id: str,
    *,
    restore_status: str = "active",
    principal=None,
    evidence_commit_sha: Optional[str] = None,
) -> PlanUpdateResult:
    """Unarchive a plan back to *restore_status* (default ``active``)."""
    if restore_status not in ("active", "parked"):
        raise ValueError(f"restore_status must be 'active' or 'parked', got '{restore_status}'")
    return await update_plan(
        db, plan_id, {"status": restore_status},
        principal=principal, evidence_commit_sha=evidence_commit_sha,
    )


@dataclass
class PlanDeleteResult:
    plan_id: str
    hard: bool
    success: bool
    message: str


async def delete_plan(
    db: AsyncSession,
    plan_id: str,
    *,
    hard: bool = False,
    principal=None,
    evidence_commit_sha: Optional[str] = None,
) -> PlanDeleteResult:
    """Delete a plan.

    Soft delete (default): sets status to ``removed`` — hidden from listings
    but recoverable via status update.

    Hard delete (``hard=True``): permanently removes PlanRegistry, Document,
    audit entries, PlanRevisions, and PlanDocuments from the database.
    """
    bundle = await _load_bundle(db, plan_id)
    if not bundle:
        raise PlanNotFoundError(f"Plan not found: {plan_id}")

    actor_source = principal.source if principal else None

    if not hard:
        # Soft delete: status → removed (reuses update_plan for events/revision)
        await update_plan(
            db, plan_id, {"status": "removed"},
            principal=principal, evidence_commit_sha=evidence_commit_sha,
        )
        return PlanDeleteResult(
            plan_id=plan_id, hard=False, success=True,
            message=f"Plan '{plan_id}' soft-deleted (status=removed).",
        )

    # Hard delete: cascade removal
    doc_id = bundle.doc.id

    # Delete child rows first (audit entries, revisions, documents)
    from sqlalchemy import delete as sa_delete

    await db.execute(sa_delete(EntityAudit).where(
        EntityAudit.domain == "plan", EntityAudit.entity_id == plan_id,
    ))
    await db.execute(sa_delete(PlanParticipant).where(PlanParticipant.plan_id == plan_id))
    await db.execute(sa_delete(PlanReviewLink).where(PlanReviewLink.plan_id == plan_id))
    await db.execute(sa_delete(PlanReviewNode).where(PlanReviewNode.plan_id == plan_id))
    await db.execute(sa_delete(PlanRequest).where(PlanRequest.plan_id == plan_id))
    await db.execute(sa_delete(PlanReviewRound).where(PlanReviewRound.plan_id == plan_id))
    await db.execute(sa_delete(PlanRevision).where(PlanRevision.plan_id == plan_id))
    await db.execute(sa_delete(PlanDocument).where(PlanDocument.plan_id == plan_id))

    # Delete plan registry row, then document
    await db.execute(sa_delete(PlanRegistry).where(PlanRegistry.id == plan_id))
    await db.execute(sa_delete(Document).where(Document.id == doc_id))
    await db.commit()

    # Invalidate filesystem cache
    import pixsim7.backend.main.services.docs.plans as plans_module
    plans_module._plans_cache = None

    logger.info("plan_hard_deleted", plan_id=plan_id, actor=actor_source)

    return PlanDeleteResult(
        plan_id=plan_id, hard=True, success=True,
        message=f"Plan '{plan_id}' permanently deleted.",
    )


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
            namespace="dev/plans",
            tags=entry.tags,
            revision=1,
            created_at=now,
            updated_at=now,
        )
        db.add(doc)

        plan = PlanRegistry(
            id=plan_id,
            document_id=doc_id,
            stage=normalize_plan_stage(entry.stage, strict=False),
            priority=entry.priority,
            scope=entry.scope,
            plan_path=entry.plan_path,
            **{f: getattr(entry, f, None) for f in PLAN_LIST_FIELDS},
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
