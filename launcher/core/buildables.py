"""
Buildables discovery for workspace packages.

Loads workspace package.json files (via pnpm-workspace.yaml) and
returns packages that define a build script.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple, Dict
import fnmatch
import glob
import json


DEFAULT_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class BuildableDefinition:
    id: str
    title: str
    package: str
    directory: str
    description: Optional[str] = None
    command: str = "pnpm"
    args: List[str] = field(default_factory=list)
    category: Optional[str] = None
    tags: List[str] = field(default_factory=list)


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] in ("'", '"') and value[-1] == value[0]:
        return value[1:-1]
    return value


def _parse_pnpm_workspace(root_dir: Path) -> Tuple[List[str], List[str]]:
    config_path = root_dir / "pnpm-workspace.yaml"
    if not config_path.exists():
        return [], []

    includes: List[str] = []
    excludes: List[str] = []

    for raw_line in config_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line.startswith("-"):
            continue
        item = _strip_quotes(line[1:].strip())
        if not item:
            continue
        if item.startswith("!"):
            excludes.append(item[1:])
        else:
            includes.append(item)

    return includes, excludes


def _parse_root_workspaces(root_dir: Path) -> List[str]:
    package_json = root_dir / "package.json"
    if not package_json.exists():
        return []
    data = _load_json(package_json)
    if not data:
        return []
    workspaces = data.get("workspaces")
    if isinstance(workspaces, list):
        return [str(item) for item in workspaces if isinstance(item, str)]
    return []


def _load_json(path: Path) -> Optional[Dict]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


def _is_excluded(rel_path: Path, excludes: List[str]) -> bool:
    if not excludes:
        return False
    rel_str = rel_path.as_posix()
    for pattern in excludes:
        if fnmatch.fnmatch(rel_str, pattern):
            return True
    return False


def _resolve_package_json_paths(
    root_dir: Path,
    include_globs: List[str],
    exclude_globs: List[str],
) -> List[Path]:
    paths: Dict[str, Path] = {}
    for pattern in include_globs:
        glob_pattern = str(root_dir / pattern / "package.json")
        for match in glob.glob(glob_pattern, recursive=True):
            path = Path(match)
            try:
                rel_dir = path.parent.relative_to(root_dir)
            except ValueError:
                rel_dir = path.parent
            if _is_excluded(rel_dir, exclude_globs):
                continue
            paths[str(path)] = path
    return sorted(paths.values())


def _derive_title(package_name: str) -> str:
    if package_name.startswith("@pixsim7/"):
        return package_name.replace("@pixsim7/", "")
    return package_name


def _derive_category(directory: str) -> Optional[str]:
    if not directory:
        return None
    parts = directory.replace("\\", "/").split("/")
    return parts[0] if parts else None


def _derive_tags(directory: str) -> List[str]:
    category = _derive_category(directory)
    if not category:
        return []
    return [category]


def load_buildables(root_dir: Optional[Path] = None) -> List[BuildableDefinition]:
    root = root_dir or DEFAULT_ROOT

    include_globs, exclude_globs = _parse_pnpm_workspace(root)
    if not include_globs:
        include_globs = _parse_root_workspaces(root)

    if not include_globs:
        return []

    package_paths = _resolve_package_json_paths(root, include_globs, exclude_globs)
    buildables: List[BuildableDefinition] = []

    for path in package_paths:
        data = _load_json(path)
        if not data:
            continue
        scripts = data.get("scripts") or {}
        if not isinstance(scripts, dict):
            continue
        build_script = scripts.get("build")
        if not build_script:
            continue

        package_name = data.get("name")
        if not isinstance(package_name, str) or not package_name:
            continue

        try:
            rel_dir = path.parent.relative_to(root)
            directory = rel_dir.as_posix()
        except ValueError:
            directory = str(path.parent)

        buildables.append(
            BuildableDefinition(
                id=package_name,
                title=_derive_title(package_name),
                package=package_name,
                directory=directory,
                description=data.get("description"),
                command="pnpm",
                args=["--filter", package_name, "build"],
                category=_derive_category(directory),
                tags=_derive_tags(directory),
            )
        )

    buildables.sort(key=lambda item: item.title.lower())
    return buildables
