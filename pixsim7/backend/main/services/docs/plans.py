"""
Plan registry service.

Reads plan manifest bundles from docs/plans/{active,done,parked}/ and
exposes them as structured data. The TS scripts remain the write/sync
side; this service is read-only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from pixsim7.backend.main.shared.config import _resolve_repo_root
from pixsim_logging import get_logger

logger = get_logger()

PLAN_SCOPES = ("active", "done", "parked")
PLANS_DIR = "docs/plans"

_plans_cache: Optional[Dict[str, Any]] = None


@dataclass
class PlanEntry:
    id: str
    title: str
    status: str
    stage: str
    owner: str
    last_updated: str
    priority: str
    summary: str
    plan_path: str
    code_paths: List[str] = field(default_factory=list)
    companions: List[str] = field(default_factory=list)
    handoffs: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    scope: str = ""
    markdown: str = ""


def get_plans_index(refresh: bool = False) -> Dict[str, Any]:
    global _plans_cache
    if _plans_cache is not None and not refresh:
        return _plans_cache

    _plans_cache = build_plans_index()
    return _plans_cache


def build_plans_index() -> Dict[str, Any]:
    repo_root = _resolve_repo_root()
    plans_root = repo_root / PLANS_DIR

    entries: Dict[str, PlanEntry] = {}

    for scope in PLAN_SCOPES:
        scope_dir = plans_root / scope
        if not scope_dir.exists():
            continue

        for manifest_path in scope_dir.rglob("manifest.yaml"):
            entry = _load_plan_entry(manifest_path, scope, repo_root)
            if entry:
                entries[entry.id] = entry

    return {
        "version": "1",
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "entries": entries,
    }


def _load_plan_entry(
    manifest_path: Path,
    scope: str,
    repo_root: Path,
) -> Optional[PlanEntry]:
    try:
        raw = manifest_path.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception:
        logger.exception("plan_manifest_parse_failed", path=str(manifest_path))
        return None

    plan_id = data.get("id")
    if not plan_id:
        logger.warning("plan_manifest_missing_id", path=str(manifest_path))
        return None

    # Resolve plan markdown path relative to manifest directory
    plan_rel = data.get("plan_path", "./plan.md")
    plan_file = (manifest_path.parent / plan_rel).resolve()
    markdown = ""
    if plan_file.exists():
        try:
            markdown = plan_file.read_text(encoding="utf-8")
        except Exception:
            logger.exception("plan_markdown_read_failed", path=str(plan_file))

    # Resolve companion/handoff paths to repo-relative
    bundle_dir = manifest_path.parent
    companions = _resolve_paths(data.get("companions", []), bundle_dir, repo_root)
    handoffs = _resolve_paths(data.get("handoffs", []), bundle_dir, repo_root)

    # Plan path as repo-relative
    try:
        plan_path = str(plan_file.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        plan_path = data.get("plan_path", "")

    return PlanEntry(
        id=plan_id,
        title=data.get("title", plan_id),
        status=data.get("status", scope),
        stage=data.get("stage", "unknown"),
        owner=data.get("owner", "unassigned"),
        last_updated=str(data.get("last_updated", "")),
        priority=data.get("priority", "normal"),
        summary=data.get("summary", ""),
        plan_path=plan_path,
        code_paths=list(data.get("code_paths") or []),
        companions=companions,
        handoffs=handoffs,
        tags=list(data.get("tags") or []),
        depends_on=list(data.get("depends_on") or []),
        scope=scope,
        markdown=markdown,
    )


def _resolve_paths(
    paths: List[str],
    bundle_dir: Path,
    repo_root: Path,
) -> List[str]:
    resolved = []
    for p in paths or []:
        full = (bundle_dir / p).resolve() if not Path(p).is_absolute() else Path(p)
        try:
            resolved.append(str(full.relative_to(repo_root)).replace("\\", "/"))
        except ValueError:
            resolved.append(p)
    return resolved
