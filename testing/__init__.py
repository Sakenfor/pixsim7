"""Repo-level testing infrastructure.

Pure-Python tooling shared across the backend, scripts, and CI:

* :mod:`testing.discovery` — walks the repo for Python (and TypeScript)
  test files, infers metadata from path layout, and returns
  :class:`DiscoveredSuite` records. ``TEST_SUITE`` blocks in test files
  are optional overrides.
* :mod:`testing.catalog` — assembles the unified backend + frontend
  catalog from discovery output, validates required fields, and
  cross-checks runner-alignment (pytest / vitest).

Both modules are pure stdlib — no DB, no backend imports — so CLI
scripts, pre-commit hooks, and external tooling can use them directly.

DB-backed pieces (sync to ``TestSuiteRecord``, recording
``TestRunRecord``) live in :mod:`pixsim7.backend.main.services.testing`
because they need SQLAlchemy / backend models.
"""
