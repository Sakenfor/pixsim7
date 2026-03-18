"""Test suite sync — filesystem discovery → DB upsert.

Mirrors the plan sync pattern: TEST_SUITE dicts in Python files are the
authoring surface, the DB is the query surface.  This module bridges them.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.docs.models import TestSuiteRecord
from pixsim7.backend.main.services.testing.catalog import build_catalog
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0

    @property
    def total_processed(self) -> int:
        return self.created + self.updated + self.unchanged


async def sync_test_suites(db: AsyncSession) -> SyncResult:
    """Discover all test suites from filesystem + static defs and upsert to DB.

    - New suites → INSERT
    - Changed suites → UPDATE
    - DB suites not in catalog → DELETE (stale)
    """
    catalog = build_catalog()
    now = utcnow()
    result = SyncResult()

    # Load existing DB records
    existing_rows = (await db.execute(select(TestSuiteRecord))).scalars().all()
    existing_by_id: dict[str, TestSuiteRecord] = {r.id: r for r in existing_rows}

    seen_ids: set[str] = set()

    for suite in catalog:
        suite_id = suite.get("id")
        if not suite_id:
            continue
        seen_ids.add(suite_id)

        existing = existing_by_id.get(suite_id)
        if existing is None:
            # New suite — INSERT
            record = TestSuiteRecord(
                id=suite_id,
                label=suite.get("label", suite_id),
                path=suite.get("path", ""),
                layer=suite.get("layer", "backend"),
                kind=suite.get("kind"),
                category=suite.get("category"),
                subcategory=suite.get("subcategory"),
                covers=suite.get("covers"),
                order=suite.get("order"),
                source=_infer_source(suite),
                last_synced_at=now,
                created_at=now,
                updated_at=now,
            )
            db.add(record)
            result.created += 1
        elif _suite_changed(existing, suite):
            # Changed — UPDATE
            existing.label = suite.get("label", suite_id)
            existing.path = suite.get("path", "")
            existing.layer = suite.get("layer", "backend")
            existing.kind = suite.get("kind")
            existing.category = suite.get("category")
            existing.subcategory = suite.get("subcategory")
            existing.covers = suite.get("covers")
            existing.order = suite.get("order")
            existing.source = _infer_source(suite)
            existing.last_synced_at = now
            existing.updated_at = now
            result.updated += 1
        else:
            # Unchanged — just update sync timestamp
            existing.last_synced_at = now
            result.unchanged += 1

    # Remove stale DB entries not in catalog
    stale_ids = set(existing_by_id.keys()) - seen_ids
    if stale_ids:
        await db.execute(
            delete(TestSuiteRecord).where(TestSuiteRecord.id.in_(stale_ids))
        )
        result.removed = len(stale_ids)

    await db.flush()

    logger.info(
        "test_suite_sync_complete",
        suites_created=result.created,
        suites_updated=result.updated,
        suites_removed=result.removed,
        suites_unchanged=result.unchanged,
    )
    return result


def _infer_source(suite: dict[str, Any]) -> str:
    """Infer whether a suite was discovered, static, or manually added."""
    # Static suites from catalog.py don't have _discovered marker
    # Discovered suites come from AST extraction
    # For now, simple heuristic based on layer
    path = suite.get("path", "")
    if "apps/main/" in path:
        return "static"  # Frontend suites are hardcoded
    return "discovered"


def _suite_changed(existing: TestSuiteRecord, catalog_entry: dict[str, Any]) -> bool:
    """Check if a catalog entry differs from the DB record."""
    return (
        existing.label != catalog_entry.get("label", existing.id)
        or existing.path != catalog_entry.get("path", "")
        or existing.layer != catalog_entry.get("layer", "backend")
        or existing.kind != catalog_entry.get("kind")
        or existing.category != catalog_entry.get("category")
        or existing.subcategory != catalog_entry.get("subcategory")
        or existing.covers != catalog_entry.get("covers")
        or existing.order != catalog_entry.get("order")
    )
