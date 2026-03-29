"""
Plan governance: sync and check logic for docs/plans.

This module is the single source of truth for:
- Generating docs/plans/registry.yaml from active manifests
- Updating the generated plan index in docs/plans/README.md
- Validating registry schema, entry shapes, file existence
- Manifest-registry parity checks
- Plan doc metadata marker checks
- Path reference integrity checks
- Code-to-plan drift detection (via git diff)
- Architecture doc metadata (rulebook) checks
- Companion/handoff link integrity checks

All strict-mode flags and ignore-pattern handling lives here.
"""
from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Sequence, Tuple

import yaml

from pixsim7.backend.main.services.docs.plans import (
    PLAN_SCOPES,
    PlanEntry,
    build_plans_index,
)
from pixsim7.backend.main.services.docs.plan_stages import (
    CANONICAL_PLAN_PRIORITIES,
)
from pixsim7.backend.main.shared.config import _resolve_repo_root

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

VALID_PRIORITIES = CANONICAL_PLAN_PRIORITIES
PRIORITY_ORDER = {p: i for i, p in enumerate(CANONICAL_PLAN_PRIORITIES)}

INDEX_BEGIN = "<!-- BEGIN:GENERATED_PLAN_INDEX -->"
INDEX_END = "<!-- END:GENERATED_PLAN_INDEX -->"


@dataclass
class GovernanceConfig:
    """Configuration for governance checks, typically populated from env."""

    strict_plan_docs: bool = False
    strict_plan_metadata: bool = False
    strict_plan_path_refs: bool = False
    strict_plan_rulebook: bool = False
    plan_base_sha: str = ""
    plan_head_sha: str = ""
    path_ref_ignore_file: str = ""
    path_ref_ignore_patterns: List[str] = field(default_factory=list)


@dataclass
class GovernanceResult:
    """Accumulated errors and warnings from governance operations."""

    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return len(self.errors) == 0

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warning(self, msg: str) -> None:
        self.warnings.append(msg)


@dataclass
class RegistryEntry:
    """A single entry in the registry.yaml file."""

    id: str
    path: str
    status: str
    stage: str
    owner: str
    last_updated: str
    code_paths: List[str]
    priority: str
    summary: str


@dataclass
class RegistryFile:
    """Parsed registry.yaml structure."""

    version: int
    plans: List[RegistryEntry]


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _to_posix(p: str) -> str:
    return p.replace("\\", "/")


def _normalize_candidate_path(candidate: str) -> Optional[str]:
    """Filter a candidate string to determine if it's a plausible file path."""
    cleaned = candidate.strip()
    if not cleaned:
        return None

    # Strip surrounding quotes
    cleaned = re.sub(r"^['\"]|['\"]$", "", cleaned)
    # Remove anchor fragments
    cleaned = cleaned.split("#")[0].strip()
    # Remove trailing punctuation
    cleaned = re.sub(r"[),.;]+$", "", cleaned)

    if not cleaned:
        return None
    if " " in cleaned:
        return None
    if "://" in cleaned:
        return None
    if cleaned.startswith("mailto:"):
        return None
    if cleaned.startswith("/api/"):
        return None
    if cleaned.startswith("/"):
        return None
    if "*" in cleaned or "?" in cleaned:
        return None
    if "..." in cleaned:
        return None
    if cleaned.startswith("{{") or cleaned.startswith("${") or "<" in cleaned or ">" in cleaned:
        return None

    # Strip line:col suffix from file references like `file.ts:42:10`
    line_suffix = re.match(
        r"^(.*\.(?:md|py|ts|tsx|json|yml|yaml|sh|ps1)):\d+(?::\d+)?$",
        cleaned,
        re.IGNORECASE,
    )
    if line_suffix:
        cleaned = line_suffix.group(1)

    posix = _to_posix(cleaned)
    has_slash = "/" in cleaned or "\\" in cleaned
    looks_like_file = bool(re.search(r"\.[a-z0-9]+$", cleaned, re.IGNORECASE))
    allowed_prefix = re.match(
        r"^(apps|packages|pixsim7|docs|scripts|tools|services|admin|chrome-extension|launcher|tests)/",
        posix,
    )
    is_relative = cleaned.startswith("./") or cleaned.startswith("../")

    if not is_relative and not allowed_prefix:
        return None
    if not has_slash and not looks_like_file:
        return None

    return cleaned


def _resolve_doc_path(
    candidate: str,
    doc_file: str,
    project_root: Path,
) -> Optional[str]:
    """Resolve a candidate path reference relative to a doc file."""
    normalized = _normalize_candidate_path(candidate)
    if not normalized:
        return None

    doc_abs = project_root / doc_file
    if normalized.startswith("./") or normalized.startswith("../"):
        resolved = (doc_abs.parent / normalized).resolve()
    else:
        resolved = (project_root / normalized).resolve()

    try:
        resolved.relative_to(project_root.resolve())
    except ValueError:
        return None

    return _to_posix(str(resolved.relative_to(project_root.resolve())))


# ---------------------------------------------------------------------------
# Content extraction
# ---------------------------------------------------------------------------


def _extract_inline_code_segments(content: str) -> List[str]:
    return [m.group(1) for m in re.finditer(r"`([^`\r\n]+)`", content)]


def _extract_markdown_link_targets(content: str) -> List[str]:
    return [m.group(1) for m in re.finditer(r"\[[^\]]+\]\(([^)]+)\)", content)]


# ---------------------------------------------------------------------------
# Ignore patterns
# ---------------------------------------------------------------------------


def _load_path_ref_ignore_regexes(
    project_root: Path,
    result: GovernanceResult,
    config: GovernanceConfig,
) -> List[re.Pattern[str]]:
    raw_patterns: List[Tuple[str, str]] = []

    for pat in config.path_ref_ignore_patterns:
        raw_patterns.append((pat, "PLAN_PATH_REF_IGNORE_PATTERNS"))

    ignore_file = config.path_ref_ignore_file
    if not ignore_file:
        ignore_file = str(project_root / "docs" / "plans" / "path-ref-ignores.txt")

    ignore_path = Path(ignore_file)
    if not ignore_path.is_absolute():
        ignore_path = (project_root / ignore_path).resolve()

    if ignore_path.exists():
        rel_file = _to_posix(str(ignore_path.relative_to(project_root)))
        for i, line in enumerate(ignore_path.read_text(encoding="utf-8").splitlines()):
            pat = line.strip()
            if not pat or pat.startswith("#"):
                continue
            raw_patterns.append((pat, f"{rel_file}:{i + 1}"))

    regexes: List[re.Pattern[str]] = []
    for pat, source in raw_patterns:
        try:
            regexes.append(re.compile(pat))
        except re.error as err:
            result.warning(f'Invalid path-ref ignore regex ({source}): "{pat}" ({err})')

    return regexes


def _is_path_ref_ignored(
    candidate: str,
    resolved: Optional[str],
    ignore_regexes: Sequence[re.Pattern[str]],
) -> bool:
    return any(
        rx.search(candidate) or (resolved is not None and rx.search(resolved))
        for rx in ignore_regexes
    )


# ---------------------------------------------------------------------------
# Sync logic
# ---------------------------------------------------------------------------


def build_registry_from_entries(entries: Dict[str, PlanEntry]) -> RegistryFile:
    """Build a RegistryFile from active PlanEntry objects."""
    plans: List[RegistryEntry] = []
    for entry in sorted(entries.values(), key=lambda e: e.id):
        if entry.scope != "active":
            continue
        plans.append(
            RegistryEntry(
                id=entry.id,
                path=entry.plan_path,
                status=entry.status,
                stage=entry.stage,
                owner=entry.owner,
                last_updated=entry.last_updated,
                code_paths=list(entry.code_paths),
                priority=entry.priority,
                summary=entry.summary,
            )
        )
    return RegistryFile(version=1, plans=plans)


def registry_to_dict(registry: RegistryFile) -> Dict[str, Any]:
    """Convert RegistryFile to a plain dict for YAML serialization."""
    return {
        "version": registry.version,
        "plans": [
            {
                "id": p.id,
                "path": p.path,
                "status": p.status,
                "stage": p.stage,
                "owner": p.owner,
                "last_updated": p.last_updated,
                "code_paths": p.code_paths,
                "priority": p.priority,
                "summary": p.summary,
            }
            for p in registry.plans
        ],
    }


class _RegistryDumper(yaml.SafeDumper):
    """Custom YAML dumper matching the TS yaml library output format.

    Two adjustments vs SafeDumper defaults:
    1. List items are indented under their parent key (not flush).
    2. Date-like strings (e.g. "2026-03-10") are emitted unquoted,
       matching the TS yaml library which treats them as plain strings.
    """

    def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:  # type: ignore[override]
        return super().increase_indent(flow, False)


# Remove timestamp implicit resolvers so date-like strings aren't quoted
if hasattr(_RegistryDumper, "yaml_implicit_resolvers"):
    for _key in list(_RegistryDumper.yaml_implicit_resolvers):
        _RegistryDumper.yaml_implicit_resolvers[_key] = [
            (tag, regexp)
            for tag, regexp in _RegistryDumper.yaml_implicit_resolvers[_key]
            if "timestamp" not in tag
        ]


def stringify_registry_yaml(registry: RegistryFile) -> str:
    """Serialize a RegistryFile to YAML matching TS output format."""
    return yaml.dump(
        registry_to_dict(registry),
        Dumper=_RegistryDumper,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=10000,
    )


def generate_plan_index_markdown(entries: Dict[str, PlanEntry]) -> str:
    """Generate the markdown table for the README plan index."""
    active = sorted(
        (e for e in entries.values() if e.scope == "active"),
        key=lambda e: (PRIORITY_ORDER.get(e.priority, 1), e.id),
    )

    if not active:
        return "*(No active plans found.)*"

    def esc(s: str) -> str:
        return s.replace("|", "\\|")

    lines = [
        "| Plan | Stage | Owner | Priority | Summary |",
        "| ---- | ----- | ----- | -------- | ------- |",
    ]
    for m in active:
        link = f"[{esc(m.title)}](active/{m.id}/plan.md)"
        pri = "" if m.priority == "normal" else m.priority
        lines.append(
            f"| {link} | {esc(m.stage)} | {esc(m.owner)} | {pri} | {esc(m.summary)} |"
        )
    return "\n".join(lines)


def _inject_between_markers(
    content: str,
    begin_marker: str,
    end_marker: str,
    generated: str,
) -> Optional[str]:
    begin_idx = content.find(begin_marker)
    end_idx = content.find(end_marker)
    if begin_idx == -1 or end_idx == -1 or end_idx <= begin_idx:
        return None
    return (
        content[: begin_idx + len(begin_marker)]
        + "\n"
        + generated
        + "\n"
        + content[end_idx:]
    )


def _normalized_content(raw: str) -> str:
    return raw.replace("\r\n", "\n").rstrip() + "\n"


def sync_registry(
    project_root: Optional[Path] = None,
    *,
    check_only: bool = False,
) -> GovernanceResult:
    """Sync (or check) registry.yaml and README.md plan index.

    When check_only=True, validates that files are in sync without writing.
    """
    result = GovernanceResult()
    root = project_root or _resolve_repo_root()
    registry_path = root / "docs" / "plans" / "registry.yaml"
    readme_path = root / "docs" / "plans" / "README.md"

    index = build_plans_index(scopes=("active",))
    entries = index.get("entries", {})
    errors = index.get("errors", [])

    for err in errors:
        result.error(err)
    if result.errors:
        return result

    if not entries:
        result.error("No active manifests found under docs/plans/active.")
        return result

    registry = build_registry_from_entries(entries)
    generated_yaml = _normalized_content(stringify_registry_yaml(registry))
    index_markdown = generate_plan_index_markdown(entries)

    if check_only:
        if not registry_path.exists():
            result.error(
                f"Missing registry file: {_to_posix(str(registry_path.relative_to(root)))}"
            )
        else:
            existing = _normalized_content(registry_path.read_text(encoding="utf-8"))
            if existing != generated_yaml:
                result.error(
                    "docs/plans/registry.yaml is out of sync with manifests."
                )

        if readme_path.exists():
            readme_content = readme_path.read_text(encoding="utf-8")
            expected = _inject_between_markers(
                readme_content, INDEX_BEGIN, INDEX_END, index_markdown
            )
            if expected is not None:
                if _normalized_content(readme_content) != _normalized_content(expected):
                    result.error(
                        "docs/plans/README.md plan index is out of sync with manifests."
                    )
        return result

    # Write mode — use newline="" to prevent Python from converting \n to \r\n
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(generated_yaml, encoding="utf-8", newline="")

    if readme_path.exists():
        readme_content = readme_path.read_text(encoding="utf-8")
        updated = _inject_between_markers(
            readme_content, INDEX_BEGIN, INDEX_END, index_markdown
        )
        if updated is not None:
            readme_path.write_text(
                _normalized_content(updated), encoding="utf-8", newline=""
            )

    return result


# ---------------------------------------------------------------------------
# Check logic
# ---------------------------------------------------------------------------


def _parse_registry(
    project_root: Path,
    result: GovernanceResult,
) -> Optional[RegistryFile]:
    """Load and validate registry.yaml schema."""
    registry_path = project_root / "docs" / "plans" / "registry.yaml"

    if not registry_path.exists():
        result.error(
            f"Missing registry file: {_to_posix(str(registry_path.relative_to(project_root)))}"
        )
        return None

    raw = registry_path.read_text(encoding="utf-8")
    try:
        parsed = yaml.safe_load(raw)
    except yaml.YAMLError as err:
        result.error(f"Could not parse registry YAML: {err}")
        return None

    if not parsed or not isinstance(parsed, dict):
        result.error("Registry root must be an object")
        return None

    if parsed.get("version") != 1:
        result.error(
            f"Registry version must be 1 (received: {parsed.get('version')})"
        )

    plans_raw = parsed.get("plans")
    if not isinstance(plans_raw, list):
        result.error("Registry must define plans as an array")
        return None

    entries: List[RegistryEntry] = []
    for i, raw_entry in enumerate(plans_raw):
        entry = _validate_plan_entry_shape(raw_entry, i, result)
        if entry:
            entries.append(entry)

    return RegistryFile(version=1, plans=entries)


def _validate_plan_entry_shape(
    raw: Any,
    index: int,
    result: GovernanceResult,
) -> Optional[RegistryEntry]:
    """Validate shape of a single registry entry."""
    prefix = f"plans[{index}]"

    if not isinstance(raw, dict):
        result.error(f"{prefix} must be an object")
        return None

    required_string_fields = ("id", "path", "status", "stage", "owner", "last_updated")
    for field_name in required_string_fields:
        if field_name not in raw:
            result.error(f"{prefix} missing required field: {field_name}")
        else:
            value = raw[field_name]
            # YAML parses bare dates (e.g. 2026-03-10) as date objects
            if field_name == "last_updated" and isinstance(value, (date, datetime)):
                raw[field_name] = value.isoformat()
            elif not isinstance(value, str) or not str(value).strip():
                result.error(f"{prefix}.{field_name} must be a non-empty string")

    if "code_paths" not in raw:
        result.error(f"{prefix} missing required field: code_paths")
    elif not isinstance(raw.get("code_paths"), list):
        result.error(f"{prefix}.code_paths must be an array")
    else:
        for ci, cp in enumerate(raw["code_paths"]):
            if not isinstance(cp, str) or not cp.strip():
                result.error(f"{prefix}.code_paths[{ci}] must be a non-empty string")

    if "priority" not in raw:
        result.error(f"{prefix} missing required field: priority")
    elif not isinstance(raw.get("priority"), str) or raw["priority"] not in VALID_PRIORITIES:
        result.error(f"{prefix}.priority must be one of: high, normal, low")

    if "summary" not in raw:
        result.error(f"{prefix} missing required field: summary")
    elif not isinstance(raw.get("summary"), str):
        result.error(f"{prefix}.summary must be a string")

    # Build entry even if there were errors (for downstream checks)
    try:
        return RegistryEntry(
            id=str(raw.get("id", "")).strip(),
            path=str(raw.get("path", "")).strip(),
            status=str(raw.get("status", "")).strip(),
            stage=str(raw.get("stage", "")).strip(),
            owner=str(raw.get("owner", "")).strip(),
            last_updated=str(raw.get("last_updated", "")).strip(),
            code_paths=raw.get("code_paths", []) if isinstance(raw.get("code_paths"), list) else [],
            priority=str(raw.get("priority", "normal")).strip(),
            summary=str(raw.get("summary", "")).strip(),
        )
    except Exception:
        return None


def _validate_registry_entries(
    registry: RegistryFile,
    project_root: Path,
    result: GovernanceResult,
) -> List[RegistryEntry]:
    """Validate uniqueness, path containment, and file existence."""
    id_set: set[str] = set()
    path_set: set[str] = set()

    for entry in registry.plans:
        if entry.id:
            if entry.id in id_set:
                result.error(f"Duplicate plan id in registry: {entry.id}")
            id_set.add(entry.id)

        if entry.path:
            norm_path = _to_posix(entry.path)
            if norm_path in path_set:
                result.error(f"Duplicate plan path in registry: {norm_path}")
            path_set.add(norm_path)

        if entry.path:
            abs_path = (project_root / entry.path).resolve()
            plans_dir = (project_root / "docs" / "plans").resolve()
            if not str(abs_path).startswith(str(plans_dir)):
                result.error(
                    f"[{entry.id}] path must stay under docs/plans: {entry.path}"
                )
            elif not abs_path.exists():
                result.error(f"[{entry.id}] missing plan file: {entry.path}")

        for cp in entry.code_paths:
            abs_cp = (project_root / cp).resolve()
            if not str(abs_cp).startswith(str(project_root.resolve())):
                result.error(
                    f"[{entry.id}] code_path escapes project root: {cp}"
                )
            elif not abs_cp.exists():
                result.error(f"[{entry.id}] missing code_path: {cp}")

    return registry.plans


def _check_manifest_registry_parity(
    registry: RegistryFile,
    project_root: Path,
    result: GovernanceResult,
) -> None:
    """Verify registry.yaml matches what active manifests would generate."""
    index = build_plans_index(scopes=("active",))
    entries = index.get("entries", {})
    for err in index.get("errors", []):
        result.error(err)
    if result.errors:
        return

    if not entries:
        result.warning("No active plan manifests discovered under docs/plans/active.")
        return

    generated = build_registry_from_entries(entries)

    def _canonicalize(reg: RegistryFile) -> List[Dict[str, Any]]:
        return sorted(
            [
                {
                    "id": p.id,
                    "path": p.path,
                    "status": p.status,
                    "stage": p.stage,
                    "owner": p.owner,
                    "last_updated": p.last_updated,
                    "code_paths": list(p.code_paths),
                    "priority": p.priority,
                    "summary": p.summary,
                }
                for p in reg.plans
            ],
            key=lambda d: d["id"],
        )

    if _canonicalize(registry) != _canonicalize(generated):
        result.error(
            "docs/plans/registry.yaml is out of sync with plan manifests. "
            "Run: pnpm docs:plans:sync"
        )


def _check_plan_doc_metadata(
    entry: RegistryEntry,
    project_root: Path,
    result: GovernanceResult,
    *,
    strict: bool = False,
) -> None:
    """Check that plan doc includes required metadata markers."""
    abs_path = project_root / entry.path
    if not abs_path.exists():
        result.error(f"[{entry.id}] plan file is missing: {entry.path}")
        return

    content = abs_path.read_text(encoding="utf-8")

    checks = {
        "Last updated/Date": bool(
            re.search(r"(^|\n)\s*\*{0,2}(Last updated|Date|Dates)\*{0,2}\s*:", content, re.IGNORECASE)
        ),
        "Owner": bool(
            re.search(r"(^|\n)\s*\*{0,2}Owner[^:\n]*\*{0,2}\s*:", content, re.IGNORECASE)
        ),
        "Status/Phase": bool(
            re.search(r"(^|\n)\s*\*{0,2}Status\*{0,2}\s*:", content, re.IGNORECASE)
            or re.search(r"(^|\n)\s*##\s*Phase\b", content, re.IGNORECASE)
            or re.search(r"(^|\n)\s*###\s*Phase\b", content, re.IGNORECASE)
        ),
        "Stage": bool(
            re.search(r"(^|\n)\s*\*{0,2}Stage\*{0,2}\s*:", content, re.IGNORECASE)
        ),
        "Update Log section": bool(
            re.search(r"(^|\n)\s*##\s*Update\s*Log\b", content, re.IGNORECASE)
            or re.search(r"(^|\n)\s*###\s*Update\s*Log\b", content, re.IGNORECASE)
        ),
    }

    missing = [label for label, found in checks.items() if not found]
    if missing:
        msg = f"[{entry.id}] missing metadata in {entry.path}: {', '.join(missing)}"
        if strict:
            result.error(msg)
        else:
            result.warning(msg)


def _check_plan_doc_path_references(
    entry: RegistryEntry,
    project_root: Path,
    result: GovernanceResult,
    ignore_regexes: Sequence[re.Pattern[str]],
    *,
    strict: bool = False,
) -> None:
    """Check that path references in plan docs resolve to existing files."""
    abs_path = project_root / entry.path
    if not abs_path.exists():
        return

    content = abs_path.read_text(encoding="utf-8")
    candidates = _extract_markdown_link_targets(content) + _extract_inline_code_segments(content)

    missing: List[str] = []
    checked: set[str] = set()

    for candidate in candidates:
        if _is_path_ref_ignored(candidate, None, ignore_regexes):
            continue
        resolved = _resolve_doc_path(candidate, entry.path, project_root)
        if not resolved:
            continue
        if _is_path_ref_ignored(candidate, resolved, ignore_regexes):
            continue
        if resolved in checked:
            continue
        checked.add(resolved)

        target_abs = project_root / resolved
        if not target_abs.exists():
            missing.append(resolved)

    if missing:
        msg = f"[{entry.id}] broken path references in {entry.path}: {', '.join(sorted(missing))}"
        if strict:
            result.error(msg)
        else:
            result.warning(msg)


def _get_changed_files(
    project_root: Path,
    base_sha: str,
    head_sha: str,
    result: GovernanceResult,
) -> List[str]:
    """Get list of changed files between two git SHAs."""
    if not base_sha or not head_sha:
        result.warning(
            "PLAN_BASE_SHA/PLAN_HEAD_SHA not provided; "
            "skipping code->plan drift check for this run."
        )
        return []

    try:
        output = subprocess.run(
            ["git", "diff", "--name-only", f"{base_sha}..{head_sha}"],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            check=True,
        )
        return [
            _to_posix(line.strip())
            for line in output.stdout.splitlines()
            if line.strip()
        ]
    except subprocess.CalledProcessError as err:
        result.warning(
            f"Could not compute changed files for {base_sha}..{head_sha}: {err}"
        )
        return []


def _is_path_impacted(changed_file: str, mapped_path: str) -> bool:
    norm_changed = _to_posix(changed_file)
    norm_mapped = _to_posix(mapped_path).rstrip("/")
    return norm_changed == norm_mapped or norm_changed.startswith(f"{norm_mapped}/")


def _check_code_to_plan_drift(
    entries: List[RegistryEntry],
    project_root: Path,
    result: GovernanceResult,
    *,
    base_sha: str = "",
    head_sha: str = "",
) -> None:
    """Check that code changes touching plan code_paths also touch plan docs."""
    changed_files = _get_changed_files(project_root, base_sha, head_sha, result)
    if not changed_files:
        return

    impacted = [
        e
        for e in entries
        if e.status == "active"
        and e.code_paths
        and any(
            _is_path_impacted(changed, mapped)
            for changed in changed_files
            for mapped in e.code_paths
        )
    ]

    if not impacted:
        return

    changed_set = set(changed_files)
    registry_changed = "docs/plans/registry.yaml" in changed_set
    any_plan_touched = any(_to_posix(e.path) in changed_set for e in impacted)

    if not registry_changed and not any_plan_touched:
        ids = ", ".join(p.id for p in impacted)
        result.error(
            "Code changes matched active plan ownership but no impacted plan doc "
            f"was updated. Impacted plan ids: {ids}"
        )


def _check_architecture_doc_metadata(
    project_root: Path,
    result: GovernanceResult,
    *,
    strict: bool = False,
) -> None:
    """Check architecture docs have Last updated and Owner metadata."""
    arch_dir = project_root / "docs" / "architecture"
    if not arch_dir.exists():
        return

    for md_file in sorted(arch_dir.iterdir()):
        if not md_file.is_file() or not md_file.name.endswith(".md"):
            continue

        content = md_file.read_text(encoding="utf-8")
        header = content[:500]

        has_date = bool(
            re.search(r"(^|\n)\s*\*{0,2}(Last updated|Date)\*{0,2}\s*:", header, re.IGNORECASE)
        )
        has_owner = bool(
            re.search(r"(^|\n)\s*\*{0,2}Owner\*{0,2}\s*:", header, re.IGNORECASE)
        )

        missing: List[str] = []
        if not has_date:
            missing.append("Last updated/Date")
        if not has_owner:
            missing.append("Owner")

        if missing:
            rel_path = _to_posix(str(md_file.relative_to(project_root)))
            msg = f"[rulebook] {rel_path} missing metadata: {', '.join(missing)}"
            if strict:
                result.error(msg)
            else:
                result.warning(msg)


def _check_companion_handoff_links(
    project_root: Path,
    result: GovernanceResult,
    *,
    strict: bool = False,
) -> None:
    """Check markdown links in companion and handoff docs."""
    index = build_plans_index(scopes=("active",))
    entries = index.get("entries", {})

    for entry in entries.values():
        all_doc_paths = list(entry.companions or []) + list(entry.handoffs or [])
        for doc_rel in all_doc_paths:
            doc_abs = project_root / doc_rel
            if not doc_abs.exists():
                result.error(f"[{entry.id}] missing companion/handoff file: {doc_rel}")
                continue

            content = doc_abs.read_text(encoding="utf-8")
            link_targets = _extract_markdown_link_targets(content)
            missing: List[str] = []
            checked: set[str] = set()

            for target in link_targets:
                resolved = _resolve_doc_path(target, doc_rel, project_root)
                if not resolved:
                    continue
                if resolved in checked:
                    continue
                checked.add(resolved)

                if not (project_root / resolved).exists():
                    missing.append(resolved)

            if missing:
                msg = f"[{entry.id}] broken links in {doc_rel}: {', '.join(sorted(missing))}"
                if strict:
                    result.error(msg)
                else:
                    result.warning(msg)


# ---------------------------------------------------------------------------
# Main check entry point
# ---------------------------------------------------------------------------


def check_registry(
    project_root: Optional[Path] = None,
    config: Optional[GovernanceConfig] = None,
) -> GovernanceResult:
    """Run all governance checks on the plan registry."""
    result = GovernanceResult()
    root = project_root or _resolve_repo_root()
    cfg = config or GovernanceConfig()

    strict_metadata = cfg.strict_plan_docs or cfg.strict_plan_metadata
    strict_path_refs = cfg.strict_plan_docs or cfg.strict_plan_path_refs
    strict_rulebook = cfg.strict_plan_docs or cfg.strict_plan_rulebook

    # Stage 1-2: Parse and validate registry schema + entry shapes
    registry = _parse_registry(root, result)
    if registry is None:
        return result

    # Stage 3: Manifest-registry parity
    _check_manifest_registry_parity(registry, root, result)

    # Stage 4: Entry uniqueness + file existence
    entries = _validate_registry_entries(registry, root, result)

    # Stage 5-6: Metadata markers + path references
    ignore_regexes = _load_path_ref_ignore_regexes(root, result, cfg)
    for entry in entries:
        _check_plan_doc_metadata(entry, root, result, strict=strict_metadata)
        _check_plan_doc_path_references(
            entry, root, result, ignore_regexes, strict=strict_path_refs
        )

    # Stage 7: Code-to-plan drift
    _check_code_to_plan_drift(
        entries,
        root,
        result,
        base_sha=cfg.plan_base_sha,
        head_sha=cfg.plan_head_sha,
    )

    # Stage 8: Architecture doc metadata (rulebook)
    _check_architecture_doc_metadata(root, result, strict=strict_rulebook)

    # Stage 9: Companion/handoff link integrity
    _check_companion_handoff_links(root, result, strict=strict_rulebook)

    return result


# ---------------------------------------------------------------------------
# Config from environment
# ---------------------------------------------------------------------------


def config_from_env() -> GovernanceConfig:
    """Build GovernanceConfig from environment variables."""
    ignore_patterns_raw = os.environ.get("PLAN_PATH_REF_IGNORE_PATTERNS", "")
    ignore_patterns = [
        p.strip() for p in ignore_patterns_raw.split(",") if p.strip()
    ]

    return GovernanceConfig(
        strict_plan_docs=os.environ.get("STRICT_PLAN_DOCS") == "1",
        strict_plan_metadata=os.environ.get("STRICT_PLAN_METADATA") == "1",
        strict_plan_path_refs=os.environ.get("STRICT_PLAN_PATH_REFS") == "1",
        strict_plan_rulebook=os.environ.get("STRICT_PLAN_RULEBOOK") == "1",
        plan_base_sha=os.environ.get("PLAN_BASE_SHA", "").strip(),
        plan_head_sha=os.environ.get("PLAN_HEAD_SHA", "").strip(),
        path_ref_ignore_file=os.environ.get("PLAN_PATH_REF_IGNORE_FILE", "").strip(),
        path_ref_ignore_patterns=ignore_patterns,
    )
