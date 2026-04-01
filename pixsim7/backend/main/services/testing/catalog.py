"""Test catalog assembly and validation.

Builds the unified catalog from discovered backend/scripts suites and
static frontend suite definitions.
"""
from __future__ import annotations

import configparser
import fnmatch
import json
import logging
import re
from pathlib import Path
from typing import Any

from .discovery import DiscoveredSuite, discover_frontend_suites, discover_suites

logger = logging.getLogger(__name__)

# Legacy _STATIC_SUITES removed — frontend suites are now auto-discovered
# by discover_frontend_suites() which globs *.test.ts/*.test.tsx files.


def _get_root() -> Path:
    """Resolve project root from this file's location."""
    # services/testing/catalog.py -> backend/main/services/testing/
    return Path(__file__).resolve().parents[5]


def build_catalog(
    root: Path | None = None,
) -> list[dict[str, Any]]:
    """Build the full suite catalog: backend + frontend discovered, deduplicated, sorted."""
    if root is None:
        root = _get_root()

    backend = discover_suites(root)
    frontend = discover_frontend_suites(root)

    seen_ids: set[str] = set()
    all_suites: list[dict[str, Any]] = []

    # Backend-discovered suites first (have explicit TEST_SUITE metadata).
    for suite in backend:
        if suite.id in seen_ids:
            continue
        seen_ids.add(suite.id)
        all_suites.append(suite.to_dict())

    # Frontend-discovered suites (glob + optional TEST_SUITE override).
    for suite in frontend:
        if suite.id in seen_ids:
            continue
        seen_ids.add(suite.id)
        all_suites.append(suite.to_dict())

    # Stable sort by order then label.
    def _sort_key(s: dict[str, Any]) -> tuple[float, str]:
        order = s.get("order")
        return (
            float(order) if isinstance(order, (int, float)) else float("inf"),
            s.get("label", ""),
        )

    all_suites.sort(key=_sort_key)
    return all_suites


def validate_catalog(
    suites: list[dict[str, Any]],
    root: Path | None = None,
) -> list[str]:
    """Validate suite metadata. Returns a list of error strings (empty = OK)."""
    if root is None:
        root = _get_root()

    allowed_kinds = {"unit", "contract", "integration", "e2e", "smoke"}
    allowed_layers = {"backend", "frontend", "scripts"}
    required_fields = ("id", "label", "path", "layer", "kind", "category", "subcategory")

    errors: list[str] = []
    seen_ids: set[str] = set()

    for suite in suites:
        suite_id = suite.get("id") or "<missing-id>"

        if not suite.get("id"):
            errors.append(f"suite missing required field: id")
            continue

        if suite_id in seen_ids:
            errors.append(f"duplicate suite id: {suite_id}")
            continue
        seen_ids.add(suite_id)

        for field in required_fields:
            if not suite.get(field):
                errors.append(f"suite '{suite_id}' missing required field: {field}")

        layer = suite.get("layer")
        if layer and layer not in allowed_layers:
            errors.append(f"suite '{suite_id}' has invalid layer '{layer}'")

        kind = suite.get("kind")
        if kind and kind not in allowed_kinds:
            errors.append(f"suite '{suite_id}' has invalid kind '{kind}'")

        suite_path = suite.get("path")
        if suite_path and not (root / suite_path).exists():
            errors.append(f"suite '{suite_id}' path does not exist: {suite_path}")

        covers = suite.get("covers", [])
        if not covers:
            errors.append(f"suite '{suite_id}' missing required field: covers")
        else:
            for cover in covers:
                if not (root / cover).exists():
                    errors.append(f"suite '{suite_id}' cover path does not exist: {cover}")

    return errors


# ---------------------------------------------------------------------------
# Runner-alignment validation
# ---------------------------------------------------------------------------

# Matches vitest include arrays: include: ['pattern', "pattern"]
_VITEST_INCLUDE_RE = re.compile(
    r"""include\s*:\s*\[([^\]]+)\]""",
    re.DOTALL,
)
# Matches individual quoted strings within the array
_QUOTED_STRING_RE = re.compile(r"""['"]([^'"]+)['"]""")
# Expands simple brace groups like {ts,tsx} → ['ts', 'tsx']
_BRACE_RE = re.compile(r"\{([^}]+)\}")


_VITEST_SKIP_DIRS = {"node_modules", ".git", "dist", "build", "__pycache__"}


def _expand_braces(pattern: str) -> list[str]:
    """Expand a single ``{a,b}`` brace group into multiple patterns."""
    m = _BRACE_RE.search(pattern)
    if not m:
        return [pattern]
    prefix = pattern[: m.start()]
    suffix = pattern[m.end() :]
    return [prefix + alt + suffix for alt in m.group(1).split(",")]


def _parse_vitest_include(config_path: Path) -> list[str]:
    """Extract ``test.include`` glob patterns from a vite/vitest config file."""
    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError:
        return []

    m = _VITEST_INCLUDE_RE.search(text)
    if not m:
        return []

    raw_patterns: list[str] = []
    for qm in _QUOTED_STRING_RE.finditer(m.group(1)):
        raw_patterns.extend(_expand_braces(qm.group(1)))
    return raw_patterns


def _parse_pytest_file_patterns(ini_path: Path) -> list[str]:
    """Extract ``python_files`` patterns from pytest.ini."""
    try:
        cp = configparser.ConfigParser()
        cp.read(str(ini_path), encoding="utf-8")
        raw = cp.get("pytest", "python_files", fallback="test_*.py")
        return [p.strip() for p in raw.split() if p.strip()]
    except (configparser.Error, OSError):
        return ["test_*.py"]


def _glob_matches_filename(pattern: str, filename: str) -> bool:
    """Check if a vitest/pytest glob pattern matches a filename.

    Handles ``**`` as "any path segment" and delegates leaf matching to
    ``fnmatch``.  Only the filename portion is checked against the last
    segment of the pattern.
    """
    # For vitest patterns like 'src/**/*.test.ts', extract the leaf glob
    leaf = pattern.rsplit("/", 1)[-1] if "/" in pattern else pattern
    return fnmatch.fnmatch(filename, leaf)


def validate_runner_alignment(
    suites: list[dict[str, Any]],
    root: Path | None = None,
) -> list[str]:
    """Check that every discovered suite would be picked up by its test runner.

    Parses ``pytest.ini`` (backend) and ``vite.config.ts`` (frontend) to
    extract the runner's file-matching patterns, then flags any cataloged
    suite whose file name wouldn't match.

    Returns a list of warning strings (empty = fully aligned).
    """
    if root is None:
        root = _get_root()

    # --- Parse runner configs ------------------------------------------------
    pytest_patterns = _parse_pytest_file_patterns(root / "pytest.ini")
    # Also accept conftest.py — pytest always collects it, and discovery does too
    pytest_patterns.append("conftest.py")

    # Search only top-level app directories (not node_modules/dist/etc.)
    vitest_configs: list[Path] = []
    apps_dir = root / "apps"
    if apps_dir.is_dir():
        for app_dir in apps_dir.iterdir():
            if not app_dir.is_dir() or app_dir.name in _VITEST_SKIP_DIRS:
                continue
            for name in ("vite.config.ts", "vite.config.js", "vitest.config.ts", "vitest.config.js"):
                candidate = app_dir / name
                if candidate.is_file():
                    vitest_configs.append(candidate)
    vitest_patterns: list[str] = []
    for cfg in vitest_configs:
        vitest_patterns.extend(_parse_vitest_include(cfg))

    # --- Check alignment -----------------------------------------------------
    warnings: list[str] = []

    for suite in suites:
        layer = suite.get("layer", "")
        suite_path = suite.get("path", "")
        suite_id = suite.get("id", "<unknown>")
        filename = Path(suite_path).name if suite_path else ""
        if not filename:
            continue

        if layer in ("backend", "scripts"):
            # Directory-level suites (from conftest.py) store the dir path,
            # not conftest.py — check if the directory contains a conftest.
            suite_full = root / suite_path if suite_path else None
            if suite_full and suite_full.is_dir():
                # conftest.py is always collected by pytest
                if not (suite_full / "conftest.py").exists():
                    warnings.append(
                        f"runner-alignment: suite '{suite_id}' directory '{suite_path}' "
                        f"has no conftest.py (expected for directory-level suites)"
                    )
            elif not any(fnmatch.fnmatch(filename, pat) for pat in pytest_patterns):
                warnings.append(
                    f"runner-alignment: suite '{suite_id}' file '{filename}' "
                    f"does not match any pytest python_files pattern {pytest_patterns}"
                )
        elif layer == "frontend":
            if not vitest_patterns:
                warnings.append(
                    f"runner-alignment: no vitest include patterns found — "
                    f"cannot verify frontend suite '{suite_id}'"
                )
            elif not any(
                _glob_matches_filename(pat, filename)
                for pat in vitest_patterns
            ):
                warnings.append(
                    f"runner-alignment: suite '{suite_id}' file '{filename}' "
                    f"does not match any vitest include pattern {vitest_patterns}"
                )

    return warnings
