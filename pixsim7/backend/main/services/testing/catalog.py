"""Test catalog assembly and validation.

Builds the unified catalog from discovered backend/scripts suites and
static frontend suite definitions.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .discovery import DiscoveredSuite, discover_suites

logger = logging.getLogger(__name__)

# Frontend / non-Python suites that cannot self-register.
# These are the only entries that stay hardcoded.
_STATIC_SUITES: list[dict[str, Any]] = [
    {
        "id": "project-bundle-ui",
        "label": "Project Bundle UI",
        "path": "apps/main/src/lib/game/projectBundle/__tests__",
        "layer": "frontend",
        "kind": "integration",
        "category": "frontend/project-bundle",
        "subcategory": "all",
        "covers": ["apps/main/src/lib/game/projectBundle"],
        "order": 10,
    },
    {
        "id": "project-bundle-lifecycle-ui",
        "label": "Project Bundle Lifecycle UI",
        "path": "apps/main/src/lib/game/projectBundle/__tests__/lifecycleRuntime.test.ts",
        "layer": "frontend",
        "kind": "integration",
        "category": "frontend/project-bundle",
        "subcategory": "lifecycle",
        "covers": [
            "apps/main/src/lib/game/projectBundle/lifecycle.ts",
            "apps/main/src/lib/game/projectBundle/service.ts",
        ],
        "order": 15,
    },
    {
        "id": "project-bundle-runtime-meta-ui",
        "label": "Project Bundle Runtime Meta UI",
        "path": "apps/main/src/lib/game/projectBundle/__tests__/runtimeMeta.test.ts",
        "layer": "frontend",
        "kind": "unit",
        "category": "frontend/project-bundle",
        "subcategory": "runtime-meta",
        "covers": ["apps/main/src/lib/game/projectBundle/runtimeMeta.ts"],
        "order": 16,
    },
    {
        "id": "project-bundle-version-migration-ui",
        "label": "Project Bundle Version Migration UI",
        "path": "apps/main/src/lib/game/projectBundle/__tests__/versionMigration.test.ts",
        "layer": "frontend",
        "kind": "integration",
        "category": "frontend/project-bundle",
        "subcategory": "version-migration",
        "covers": [
            "apps/main/src/lib/game/projectBundle/index.ts",
            "apps/main/src/lib/game/projectBundle/service.ts",
        ],
        "order": 17,
    },
    {
        "id": "project-bundle-contributor-ui",
        "label": "Project Bundle Contributor UI",
        "path": "apps/main/src/lib/game/projectBundle/__tests__/contributorClass.test.ts",
        "layer": "frontend",
        "kind": "unit",
        "category": "frontend/project-bundle",
        "subcategory": "contributors",
        "covers": ["apps/main/src/lib/game/projectBundle/registry.ts"],
        "order": 18,
    },
]


def _get_root() -> Path:
    """Resolve project root from this file's location."""
    # services/testing/catalog.py -> backend/main/services/testing/
    return Path(__file__).resolve().parents[5]


def build_catalog(
    root: Path | None = None,
) -> list[dict[str, Any]]:
    """Build the full suite catalog: discovered + static, deduplicated, sorted."""
    if root is None:
        root = _get_root()

    discovered = discover_suites(root)
    seen_ids: set[str] = set()
    all_suites: list[dict[str, Any]] = []

    # Discovered suites take priority.
    for suite in discovered:
        if suite.id in seen_ids:
            continue
        seen_ids.add(suite.id)
        all_suites.append(suite.to_dict())

    # Static suites fill in the rest.
    for entry in _STATIC_SUITES:
        suite_id = entry.get("id")
        if suite_id in seen_ids:
            continue
        seen_ids.add(suite_id)
        all_suites.append(entry)

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
