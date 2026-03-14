"""AST-based test suite discovery.

Scans Python test files and conftest.py for module-level ``TEST_SUITE`` dict
literals.  No imports are executed — purely static analysis.
"""
from __future__ import annotations

import ast
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DiscoveredSuite:
    id: str
    label: str
    path: str
    layer: str
    kind: str | None = None
    category: str | None = None
    subcategory: str | None = None
    covers: tuple[str, ...] = ()
    order: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "path": self.path,
            "layer": self.layer,
            "kind": self.kind,
            "category": self.category,
            "subcategory": self.subcategory,
            "covers": list(self.covers),
            "order": self.order,
        }


def _extract_test_suite(file_path: Path) -> dict[str, Any] | None:
    """Parse a Python file's AST and extract a top-level TEST_SUITE dict literal."""
    try:
        source = file_path.read_text(encoding="utf-8-sig")
        tree = ast.parse(source, filename=str(file_path))
    except (SyntaxError, UnicodeDecodeError):
        return None

    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name) or target.id != "TEST_SUITE":
            continue
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            continue
        if isinstance(value, dict):
            return value
    return None


def _infer_layer(rel_path: str) -> str:
    if rel_path.startswith("pixsim7/backend/"):
        return "backend"
    if rel_path.startswith("scripts/"):
        return "scripts"
    return "backend"


def _infer_suite_path(file_path: Path, rel_path: str) -> str:
    """For conftest.py, the suite path is the directory; otherwise the file."""
    if file_path.name == "conftest.py":
        return str(Path(rel_path).parent).replace("\\", "/")
    return rel_path


def discover_suites(
    root: Path,
    scan_roots: Sequence[Path] | None = None,
) -> list[DiscoveredSuite]:
    """Walk scan roots and collect all TEST_SUITE declarations.

    Args:
        root: Project root for computing relative paths.
        scan_roots: Directories to scan.  Defaults to backend tests + scripts.
    """
    if scan_roots is None:
        scan_roots = [
            root / "pixsim7" / "backend" / "tests",
            root / "scripts",
        ]

    suites: list[DiscoveredSuite] = []

    for scan_root in scan_roots:
        if not scan_root.is_dir():
            continue
        for py_file in sorted(scan_root.rglob("*.py")):
            if not (py_file.name.startswith("test_") or py_file.name == "conftest.py"):
                continue
            raw = _extract_test_suite(py_file)
            if raw is None:
                continue

            rel_path = py_file.relative_to(root).as_posix()
            suite_path = _infer_suite_path(py_file, rel_path)
            layer = _infer_layer(rel_path)

            suite_id = raw.get("id")
            suite_label = raw.get("label")
            if not isinstance(suite_id, str) or not isinstance(suite_label, str):
                logger.warning("Skipping %s: TEST_SUITE missing id or label", rel_path)
                continue

            covers_raw = raw.get("covers", [])
            covers = tuple(covers_raw) if isinstance(covers_raw, list) else ()

            order_raw = raw.get("order")
            order = float(order_raw) if isinstance(order_raw, (int, float)) else None

            suites.append(DiscoveredSuite(
                id=suite_id,
                label=suite_label,
                path=suite_path,
                layer=layer,
                kind=raw.get("kind") if isinstance(raw.get("kind"), str) else None,
                category=raw.get("category") if isinstance(raw.get("category"), str) else None,
                subcategory=raw.get("subcategory") if isinstance(raw.get("subcategory"), str) else None,
                covers=covers,
                order=order,
            ))

    return suites
