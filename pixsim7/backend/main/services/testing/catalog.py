"""Test catalog assembly and validation.

Builds the unified catalog from discovered backend/scripts suites and
static frontend suite definitions.
"""
from __future__ import annotations

import json
import logging
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
