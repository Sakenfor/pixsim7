"""
Plan registry service.

Reads plan manifest bundles from docs/plans/{active,done,parked}/ and
exposes them as structured data. The TS scripts remain the write/sync
side; this service is read-only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Tuple

import yaml

from pixsim7.backend.main.shared.config import _resolve_repo_root
from pixsim_logging import get_logger

logger = get_logger()

PLAN_SCOPES = ("active", "done", "parked")
PLANS_DIR = "docs/plans"
MANIFEST_FILENAMES = ("manifest.yaml", "manifest.yml")
VALID_PRIORITIES = ("high", "normal", "low")
AUTO_COMPANION_DIRS = ("companions", "batches", "experiments", "tasks", "appendices")
AUTO_HANDOFF_DIRS = ("handoffs",)
APPENDIX_MANIFEST_FILENAMES = ("manifest.yaml", "manifest.yml")

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
    manifest_path: str = ""
    markdown: str = ""


def get_plans_index(refresh: bool = False) -> Dict[str, Any]:
    global _plans_cache
    if _plans_cache is not None and not refresh:
        return _plans_cache

    _plans_cache = build_plans_index()
    return _plans_cache


def build_plans_index(scopes: Optional[Tuple[str, ...]] = None) -> Dict[str, Any]:
    repo_root = _resolve_repo_root()
    plans_root = repo_root / PLANS_DIR

    entries: Dict[str, PlanEntry] = {}
    errors: List[str] = []
    target_scopes = scopes or PLAN_SCOPES

    for scope in target_scopes:
        scope_dir = plans_root / scope
        if not scope_dir.exists():
            continue

        # Bundle manifests are only valid at:
        # docs/plans/<scope>/<plan-id>/manifest.(yaml|yml)
        # Nested manifests under companions/batches/etc are appendix manifests
        # and must not be treated as top-level plan manifests.
        manifest_paths: List[Path] = []
        for bundle_dir in sorted(
            (p for p in scope_dir.iterdir() if p.is_dir()),
            key=lambda p: str(p).lower(),
        ):
            for manifest_name in MANIFEST_FILENAMES:
                candidate = bundle_dir / manifest_name
                if candidate.exists() and candidate.is_file():
                    manifest_paths.append(candidate)
                    break

        for manifest_path in manifest_paths:
            entry, entry_errors = _load_plan_entry(manifest_path, scope, repo_root)
            errors.extend(entry_errors)
            if not entry:
                continue

            if entry.id in entries:
                message = (
                    f"Duplicate plan id '{entry.id}' detected at {manifest_path}"
                )
                logger.error("plan_manifest_duplicate_id", plan_id=entry.id, path=str(manifest_path))
                errors.append(message)
                continue

            entries[entry.id] = entry

    return {
        "version": "1",
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "entries": entries,
        "errors": errors,
    }


def _load_plan_entry(
    manifest_path: Path,
    scope: str,
    repo_root: Path,
) -> Tuple[Optional[PlanEntry], List[str]]:
    errors: List[str] = []
    manifest_display = str(manifest_path)

    try:
        raw = manifest_path.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) or {}
    except Exception:
        logger.exception("plan_manifest_parse_failed", path=str(manifest_path))
        errors.append(f"Could not parse manifest: {manifest_display}")
        return None, errors

    if not isinstance(data, dict):
        logger.warning("plan_manifest_invalid_shape", path=str(manifest_path))
        errors.append(f"Manifest is not a YAML object: {manifest_display}")
        return None, errors

    plan_id = data.get("id")
    if not isinstance(plan_id, str) or not plan_id.strip():
        logger.warning("plan_manifest_missing_id", path=str(manifest_path))
        errors.append(f"Manifest missing/invalid id: {manifest_display}")
        return None, errors
    plan_id = plan_id.strip()

    required_string_fields = ("title", "status", "stage", "owner", "last_updated")
    required_strings: Dict[str, str] = {}
    for field_name in required_string_fields:
        value = data.get(field_name)
        if field_name == "last_updated" and isinstance(value, (date, datetime)):
            required_strings[field_name] = value.isoformat()
            continue
        if not isinstance(value, str) or not value.strip():
            logger.warning(
                "plan_manifest_missing_required_field",
                path=str(manifest_path),
                field=field_name,
            )
            errors.append(f"[{plan_id}] manifest missing/invalid \"{field_name}\": {manifest_display}")
            return None, errors
        required_strings[field_name] = value.strip()

    # Resolve plan markdown path relative to manifest directory
    plan_rel_raw = data.get("plan_path", "./plan.md")
    if not isinstance(plan_rel_raw, str) or not plan_rel_raw.strip():
        logger.warning("plan_manifest_invalid_plan_path", path=str(manifest_path))
        errors.append(f"[{plan_id}] manifest has invalid plan_path: {manifest_display}")
        return None, errors

    plan_file = _resolve_repo_path(plan_rel_raw, manifest_path.parent, repo_root)
    if plan_file is None:
        logger.warning(
            "plan_manifest_plan_path_outside_repo",
            path=str(manifest_path),
            plan_path=plan_rel_raw,
        )
        errors.append(f"[{plan_id}] plan_path escapes repo root: {plan_rel_raw}")
        return None, errors

    markdown = ""
    if plan_file.exists():
        try:
            markdown = plan_file.read_text(encoding="utf-8")
        except Exception:
            logger.exception("plan_markdown_read_failed", path=str(plan_file))
            errors.append(f"[{plan_id}] Could not read plan markdown: {plan_file}")
            return None, errors
    else:
        logger.warning("plan_markdown_missing", plan_id=plan_id, path=str(plan_file))
        errors.append(f"[{plan_id}] Missing plan markdown file: {plan_file}")
        return None, errors

    code_paths, code_path_err = _coerce_string_list(
        data.get("code_paths"),
        field_name="code_paths",
        plan_id=plan_id,
        required=True,
    )
    tags, tags_err = _coerce_string_list(
        data.get("tags"),
        field_name="tags",
        plan_id=plan_id,
    )
    depends_on, depends_on_err = _coerce_string_list(
        data.get("depends_on"),
        field_name="depends_on",
        plan_id=plan_id,
    )
    companions_raw, companions_err = _coerce_string_list(
        data.get("companions"),
        field_name="companions",
        plan_id=plan_id,
    )
    handoffs_raw, handoffs_err = _coerce_string_list(
        data.get("handoffs"),
        field_name="handoffs",
        plan_id=plan_id,
    )
    priority_raw = data.get("priority", "normal")
    if not isinstance(priority_raw, str) or priority_raw.strip() not in VALID_PRIORITIES:
        errors.append(
            f"[{plan_id}] manifest has invalid priority '{priority_raw}' (expected one of: {', '.join(VALID_PRIORITIES)})"
        )
        priority = "normal"
    else:
        priority = priority_raw.strip()

    summary_raw = data.get("summary", "")
    if summary_raw is None:
        summary = ""
    elif isinstance(summary_raw, str):
        summary = summary_raw.strip()
    else:
        errors.append(f"[{plan_id}] manifest has invalid summary (must be a string)")
        summary = ""

    for maybe_err in (
        code_path_err,
        tags_err,
        depends_on_err,
        companions_err,
        handoffs_err,
    ):
        if maybe_err:
            logger.warning(
                "plan_manifest_invalid_list_field",
                plan_id=plan_id,
                path=str(manifest_path),
                error=maybe_err,
            )
            errors.append(maybe_err)
    if errors:
        return None, errors

    # Resolve manifest-declared companion/handoff paths to repo-relative.
    bundle_dir = manifest_path.parent
    companions = _resolve_paths(companions_raw, bundle_dir, repo_root)
    handoffs = _resolve_paths(handoffs_raw, bundle_dir, repo_root)

    # Auto-discover appendix docs under known bundle folders so batch tasks can
    # be added without editing the main plan file or manifest lists.
    companions = _merge_plan_paths(
        companions,
        _discover_bundle_markdown_paths(bundle_dir, repo_root, AUTO_COMPANION_DIRS),
    )
    handoffs = _merge_plan_paths(
        handoffs,
        _discover_bundle_markdown_paths(bundle_dir, repo_root, AUTO_HANDOFF_DIRS),
    )

    # Plan path as repo-relative
    try:
        plan_path = str(plan_file.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        errors.append(f"[{plan_id}] Could not derive repo-relative plan_path from: {plan_file}")
        return None, errors

    try:
        manifest_rel = str(manifest_path.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        errors.append(f"[{plan_id}] Could not derive repo-relative manifest_path from: {manifest_path}")
        return None, errors

    return PlanEntry(
        id=plan_id,
        title=required_strings["title"],
        status=required_strings["status"],
        stage=required_strings["stage"],
        owner=required_strings["owner"],
        last_updated=required_strings["last_updated"],
        priority=priority,
        summary=summary,
        plan_path=plan_path,
        code_paths=code_paths,
        companions=companions,
        handoffs=handoffs,
        tags=tags,
        depends_on=depends_on,
        scope=scope,
        manifest_path=manifest_rel,
        markdown=markdown,
    ), errors


def _resolve_repo_path(raw_path: str, bundle_dir: Path, repo_root: Path) -> Optional[Path]:
    path_text = raw_path.strip()
    if not path_text:
        return None

    if Path(path_text).is_absolute():
        candidate = Path(path_text).resolve()
    elif path_text.startswith("./") or path_text.startswith("../"):
        candidate = (bundle_dir / path_text).resolve()
    else:
        candidate = (repo_root / path_text).resolve()
    try:
        candidate.relative_to(repo_root)
    except ValueError:
        return None
    return candidate


def _coerce_string_list(
    value: Any,
    *,
    field_name: str,
    plan_id: str,
    required: bool = False,
) -> Tuple[List[str], Optional[str]]:
    if value is None:
        if required:
            return [], f"[{plan_id}] {field_name} must be a list of strings"
        return [], None
    if not isinstance(value, list):
        return [], f"[{plan_id}] {field_name} must be a list of strings"

    out: List[str] = []
    for i, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            return [], f"[{plan_id}] {field_name}[{i}] must be a non-empty string"
        out.append(item.strip())
    return out, None


def _resolve_paths(
    paths: List[str],
    bundle_dir: Path,
    repo_root: Path,
) -> List[str]:
    resolved = []
    for p in paths or []:
        full = _resolve_repo_path(p, bundle_dir, repo_root)
        if full is None:
            logger.warning("plan_manifest_path_outside_repo", path=p, bundle_dir=str(bundle_dir))
            continue
        try:
            resolved.append(str(full.relative_to(repo_root)).replace("\\", "/"))
        except ValueError:
            logger.warning("plan_manifest_path_outside_repo", path=p, bundle_dir=str(bundle_dir))
    return resolved


def _discover_bundle_markdown_paths(
    bundle_dir: Path,
    repo_root: Path,
    subdirs: tuple[str, ...],
) -> List[str]:
    discovered: List[str] = []
    for subdir in subdirs:
        root = bundle_dir / subdir
        if not root.exists() or not root.is_dir():
            continue
        discovered.extend(
            _discover_markdown_under_appendix_root(
                appendix_root=root,
                repo_root=repo_root,
                bundle_dir=bundle_dir,
            )
        )
    return discovered


def _merge_plan_paths(primary: List[str], secondary: List[str]) -> List[str]:
    merged: List[str] = []
    seen = set()
    for path in [*primary, *secondary]:
        if path in seen:
            continue
        seen.add(path)
        merged.append(path)
    return merged


def _discover_markdown_under_appendix_root(
    *,
    appendix_root: Path,
    repo_root: Path,
    bundle_dir: Path,
) -> List[str]:
    all_markdown_files = sorted(
        (p for p in appendix_root.rglob("*.md") if p.is_file()),
        key=lambda p: str(p).lower(),
    )

    manifests = _discover_appendix_manifests(appendix_root)
    excluded_files = set()
    prioritized_files: List[Path] = []

    for manifest in manifests:
        explicit_files, exclude_globs = _parse_appendix_manifest(
            manifest_path=manifest,
            appendix_root=appendix_root,
        )
        for file_path in explicit_files:
            if file_path not in prioritized_files:
                prioritized_files.append(file_path)

        if not exclude_globs:
            continue

        manifest_dir = manifest.parent
        for md_file in all_markdown_files:
            try:
                rel = md_file.relative_to(manifest_dir).as_posix()
            except ValueError:
                continue
            if any(PurePosixPath(rel).match(pattern) for pattern in exclude_globs):
                excluded_files.add(md_file)

    filtered_files = [p for p in all_markdown_files if p not in excluded_files]
    ordered_files: List[Path] = []
    seen_files = set()
    for file_path in [*prioritized_files, *filtered_files]:
        if file_path in excluded_files:
            continue
        if file_path in seen_files:
            continue
        seen_files.add(file_path)
        ordered_files.append(file_path)

    discovered: List[str] = []
    for md_file in ordered_files:
        try:
            discovered.append(str(md_file.relative_to(repo_root)).replace("\\", "/"))
        except ValueError:
            logger.warning(
                "plan_manifest_path_outside_repo",
                path=str(md_file),
                bundle_dir=str(bundle_dir),
            )
    return discovered


def _discover_appendix_manifests(appendix_root: Path) -> List[Path]:
    manifests: List[Path] = []
    for filename in APPENDIX_MANIFEST_FILENAMES:
        manifests.extend(
            p for p in appendix_root.rglob(filename)
            if p.is_file()
        )
    manifests.sort(key=lambda p: str(p).lower())
    return manifests


def _parse_appendix_manifest(
    *,
    manifest_path: Path,
    appendix_root: Path,
) -> tuple[List[Path], List[str]]:
    try:
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    except Exception:
        logger.exception("appendix_manifest_parse_failed", path=str(manifest_path))
        return [], []

    if not isinstance(raw, dict):
        logger.warning(
            "appendix_manifest_invalid_shape",
            path=str(manifest_path),
        )
        return [], []

    explicit_paths: List[Path] = []
    task_entries = raw.get("tasks")
    if isinstance(task_entries, list):
        for entry in task_entries:
            relative = ""
            if isinstance(entry, str):
                relative = entry.strip()
            elif isinstance(entry, dict) and isinstance(entry.get("file"), str):
                relative = entry["file"].strip()
            if not relative:
                continue
            resolved = (manifest_path.parent / relative).resolve()
            if not resolved.exists() or not resolved.is_file():
                logger.warning(
                    "appendix_manifest_task_file_missing",
                    path=str(manifest_path),
                    task_file=relative,
                )
                continue
            if resolved.suffix.lower() != ".md":
                logger.warning(
                    "appendix_manifest_task_file_not_markdown",
                    path=str(manifest_path),
                    task_file=relative,
                )
                continue
            try:
                resolved.relative_to(appendix_root)
            except ValueError:
                logger.warning(
                    "appendix_manifest_task_file_outside_root",
                    path=str(manifest_path),
                    task_file=relative,
                )
                continue
            explicit_paths.append(resolved)

    file_entries = raw.get("files")
    if isinstance(file_entries, list):
        for entry in file_entries:
            if not isinstance(entry, str):
                continue
            relative = entry.strip()
            if not relative:
                continue
            resolved = (manifest_path.parent / relative).resolve()
            if not resolved.exists() or not resolved.is_file():
                continue
            if resolved.suffix.lower() != ".md":
                continue
            try:
                resolved.relative_to(appendix_root)
            except ValueError:
                continue
            if resolved not in explicit_paths:
                explicit_paths.append(resolved)

    exclude_globs: List[str] = []
    excludes = raw.get("exclude")
    if isinstance(excludes, list):
        for pattern in excludes:
            if isinstance(pattern, str) and pattern.strip():
                exclude_globs.append(pattern.strip())

    return explicit_paths, exclude_globs
