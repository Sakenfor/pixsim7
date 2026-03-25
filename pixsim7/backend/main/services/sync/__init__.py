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
