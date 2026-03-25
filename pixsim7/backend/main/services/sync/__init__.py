"""
Sync services — centralized overview of all filesystem/DB sync subsystems.

Three sync families exist in the codebase:

1. **File-watch** (real-time, event-driven)
   - ``services/content/watcher.py`` + ``ContentLoaderRegistry``
   - Watches YAML dirs for content packs, primitives, vocabularies
   - Triggered by ``watchfiles.awatch()`` with 1.5s debounce
   - Started/stopped via app lifespan hooks in ``main.py``

2. **TTL-gated** (periodic re-discovery on demand)
   - Uses ``TtlSync`` from ``services/sync/ttl.py``
   - Consumers call ``ensure_fresh(db)``; re-syncs if stale
   - **Test suites**: ``services/testing/sync.py`` (5 min TTL)
     Discovers Python ``TEST_SUITE`` dicts + TS test files → DB

3. **Manual / on-demand**
   - ``services/docs/plan_sync.py`` — filesystem manifests → DB
     Triggered via admin API, uses advisory locks
   - ``POST /dev/testing/sync`` — explicit test suite sync

Shared base class:
   ``TtlSync`` — monotonic-clock TTL gating for any async sync function.
   See ``services/sync/ttl.py``.
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def run_startup_syncs(db: AsyncSession) -> None:
    """Run all TTL-gated syncs at startup so the DB is immediately fresh.

    Called once from the app lifespan after the database is ready.
    Add new TTL sync consumers here as they are created.
    """
    from pixsim7.backend.main.services.testing.sync import ensure_synced

    result = await ensure_synced(db)
    if result and result.ran:
        logger.info(
            "startup_sync_complete",
            sync_name="test_suites",
            created=result.created,
            updated=result.updated,
        )
