"""Test suite discovery.

Backend/scripts: Scans Python test files for module-level ``TEST_SUITE`` dict
literals via AST — no imports executed, purely static analysis.

Frontend: Globs for ``*.test.ts`` / ``*.test.tsx`` files under ``apps/`` and
``packages/``, infers metadata from path structure.  If a file contains an
``export const TEST_SUITE = { ... }`` object literal the parsed fields override
the inferred defaults.
"""
from __future__ import annotations

import ast
import json
import logging
import re
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


# ---------------------------------------------------------------------------
# Frontend (TypeScript) suite discovery
# ---------------------------------------------------------------------------

# Matches: export const TEST_SUITE = { ... } (possibly multi-line)
_TS_SUITE_RE = re.compile(
    r"export\s+const\s+TEST_SUITE\s*(?::\s*\w+\s*)?=\s*(\{.*?\})\s*(?:;|as\s)",
    re.DOTALL,
)

# Strip TS type annotations like `as const`, trailing commas before }, and
# single-line // comments so the JSON parser can handle the object literal.
_TS_TRAILING_COMMA_RE = re.compile(r",\s*}")
_TS_LINE_COMMENT_RE = re.compile(r"//[^\n]*")


def _extract_ts_test_suite(file_path: Path) -> dict[str, Any] | None:
    """Extract ``export const TEST_SUITE = { ... }`` from a TS file via regex.

    Returns the parsed dict or *None* when absent / unparseable.
    """
    try:
        source = file_path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError):
        return None

    m = _TS_SUITE_RE.search(source)
    if m is None:
        return None

    raw = m.group(1)
    # Normalise to valid JSON: strip comments, trailing commas, single-quote → double
    raw = _TS_LINE_COMMENT_RE.sub("", raw)
    raw = _TS_TRAILING_COMMA_RE.sub("}", raw)
    raw = raw.replace("'", '"')

    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.debug("Failed to parse TEST_SUITE in %s", file_path)
        return None

    return value if isinstance(value, dict) else None


def _kebab(text: str) -> str:
    """Convert camelCase / PascalCase to kebab-case."""
    result = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", text)
    return result.lower().replace("_", "-")


def _infer_frontend_category(rel_path: str) -> str:
    """Derive a category string from the repo-relative path."""
    parts = rel_path.replace("\\", "/").split("/")

    # apps/main/src/features/{feat}/...
    if "features" in parts:
        idx = parts.index("features")
        if idx + 1 < len(parts):
            return f"frontend/{parts[idx + 1]}"

    # apps/main/src/lib/{area}/...
    if "lib" in parts:
        idx = parts.index("lib")
        if idx + 1 < len(parts):
            return f"frontend/lib-{parts[idx + 1]}"

    # apps/main/src/components/{area}/...
    if "components" in parts:
        idx = parts.index("components")
        if idx + 1 < len(parts):
            return f"frontend/components-{parts[idx + 1]}"

    # packages/{scope}/{pkg}/...
    if parts[0] == "packages" and len(parts) >= 3:
        return f"frontend/pkg-{parts[2]}"

    return "frontend/other"


def _infer_frontend_subcategory(rel_path: str) -> str:
    """Derive a subcategory from the immediate parent of the test file."""
    parts = rel_path.replace("\\", "/").split("/")
    # Walk backwards past __tests__ to find the meaningful parent
    for i in range(len(parts) - 2, -1, -1):
        if parts[i] != "__tests__":
            return _kebab(parts[i])
    return "general"


def _infer_frontend_covers(rel_path: str) -> tuple[str, ...]:
    """Best-effort: the parent directory of __tests__/ (the code being tested)."""
    path = Path(rel_path.replace("\\", "/"))
    for parent in path.parents:
        if parent.name == "__tests__":
            return (parent.parent.as_posix(),)
    # No __tests__ dir — use the directory containing the test file
    return (path.parent.as_posix(),)


def _infer_frontend_suite_id(rel_path: str) -> str:
    """Build a kebab-case suite id from the path."""
    path = Path(rel_path.replace("\\", "/"))
    stem = path.stem  # e.g. "quickGenerateLogic.test" → need to strip .test
    if stem.endswith(".test"):
        stem = stem[: -len(".test")]

    category = _infer_frontend_category(rel_path)
    # category is e.g. "frontend/generation" — take the part after /
    domain = category.split("/", 1)[1] if "/" in category else category
    return f"{domain}-{_kebab(stem)}-ui"


def _humanize_label(suite_id: str) -> str:
    """Convert kebab-case id to a human-readable label."""
    return suite_id.replace("-", " ").title() + " Tests"


_SKIP_DIRS = {"node_modules", ".git", "dist", "build", "__pycache__"}


def _glob_ts_tests(root: Path) -> list[Path]:
    """Recursively find *.test.ts / *.test.tsx, skipping node_modules etc."""
    results: list[Path] = []
    for entry in root.iterdir():
        if entry.is_dir():
            if entry.name in _SKIP_DIRS:
                continue
            results.extend(_glob_ts_tests(entry))
        elif entry.is_file() and (
            entry.name.endswith(".test.ts") or entry.name.endswith(".test.tsx")
        ):
            results.append(entry)
    return results


def discover_frontend_suites(
    root: Path,
    scan_roots: Sequence[Path] | None = None,
) -> list[DiscoveredSuite]:
    """Glob for ``*.test.ts`` / ``*.test.tsx`` under frontend directories.

    Infers metadata from path structure.  If a file contains an
    ``export const TEST_SUITE = { ... }`` the parsed fields override defaults.
    """
    if scan_roots is None:
        scan_roots = [
            root / "apps",
            root / "packages",
        ]

    suites: list[DiscoveredSuite] = []

    for scan_root in scan_roots:
        if not scan_root.is_dir():
            continue
        for ts_file in sorted(_glob_ts_tests(scan_root)):
                rel_path = ts_file.relative_to(root).as_posix()

                # Inferred defaults
                suite_id = _infer_frontend_suite_id(rel_path)
                label = _humanize_label(suite_id)
                category = _infer_frontend_category(rel_path)
                subcategory = _infer_frontend_subcategory(rel_path)
                covers = _infer_frontend_covers(rel_path)
                kind: str | None = "unit"
                order: float | None = None

                # Optional enrichment from export const TEST_SUITE = { ... }
                overrides = _extract_ts_test_suite(ts_file)
                if overrides:
                    suite_id = overrides.get("id", suite_id)
                    label = overrides.get("label", label)
                    category = overrides.get("category", category)
                    subcategory = overrides.get("subcategory", subcategory)
                    kind = overrides.get("kind", kind)
                    order_raw = overrides.get("order")
                    if isinstance(order_raw, (int, float)):
                        order = float(order_raw)
                    covers_raw = overrides.get("covers")
                    if isinstance(covers_raw, list):
                        covers = tuple(covers_raw)

                suites.append(DiscoveredSuite(
                    id=suite_id,
                    label=label,
                    path=rel_path,
                    layer="frontend",
                    kind=kind,
                    category=category,
                    subcategory=subcategory,
                    covers=covers,
                    order=order,
                ))

    return suites
