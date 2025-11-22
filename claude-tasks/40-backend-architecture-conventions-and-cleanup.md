"""
Task 40 – Backend Architecture Conventions & Cleanup

Goal

Codify and clean up a handful of recurring backend patterns so that future work is less fragile and less likely to reintroduce subtle integration issues (FastAPI + Pydantic + SQLModel + plugins).

This task does NOT change major behavior; it focuses on conventions, small refactors, and documentation.

Background

Recent work to unify `pixsim7.backend.main` and fix plugin startup surfaced several recurring themes:

- Legacy paths from the old `pixsim7_backend` tree.
- Mixed styles for dependency injection and Pydantic annotations.
- A few ORM naming collisions (`metadata` vs SQLAlchemy’s reserved attributes).
- Raw SQL in API modules overlapping with service responsibilities.
- Plugins and event handlers being sensitive to small changes in shared helpers.

With the legacy backend now moved outside the repo, it’s a good moment to tighten up the remaining pieces and write down conventions.

Scope

Includes:

- Backend package: `pixsim7/backend/main/*`
- API modules: `pixsim7/backend/main/api/*`
- Domain models: `pixsim7/backend/main/domain/*`
- Shared services: `pixsim7/backend/main/services/*`
- Event handler plugins: `pixsim7/backend/main/event_handlers/*`

Out of scope:

- Major redesign of plugin manager or route manifest system.
- Changing overall DB schema or core game/world/session model design.

Problems & Proposed Work

1. Domain package boundaries and exports

Problem:

- `pixsim7.backend.main.domain.__init__` exports a curated set of “core” models (User, Asset, Generation, ProviderAccount, etc.), but newer subsystems (game models, npc memory, metrics, behavior) are only accessible via submodules.
- It’s not obvious to new contributors which imports should go through `domain` vs `domain.*`, and attempts like `from pixsim7.backend.main.domain import npc_memory` are easy to write but incorrect.

Proposed:

- Add a short comment block at the top of `domain/__init__.py` clarifying intent:
  - `__init__` is for cross-cutting “core” models only (user, assets, generation, provider accounts, logging, prompt_versioning).
  - Game/npc/memory/metrics/behavior must be imported from their respective submodules (e.g., `from .game.models import GameWorld`).
- Optionally export a small set of game “surface” types (e.g., `GameWorld`, `GameSession`) if that improves ergonomics—but do this explicitly rather than ad-hoc.
- Add a brief “Domain Imports” section to an existing architecture doc (e.g., `ARCHITECTURE.md` or `ARCHITECTURE_SIMPLIFICATION_PLAN.md`) stating the rules.

Acceptance:

- `domain/__init__.py` clearly documents what it exports and what it doesn’t.
- No remaining imports in the codebase that try to pull non-core modules directly from `pixsim7.backend.main.domain`.

2. FastAPI dependency patterns for `Current*User`

Problem:

- Dependency aliases in `api/dependencies.py` use `Annotated[..., Depends(...)]` patterns:
  - `CurrentUser = Annotated[User, Depends(get_current_user)]`
  - `CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]`
- Some API functions still mistakenly use them as `admin: CurrentAdminUser = Depends()`, which causes FastAPI assertions like:
  - `Cannot specify Depends in Annotated and default value together for 'admin'`

Proposed:

- Add a short note to `api/dependencies.py` and/or `DEVELOPMENT_GUIDE.md`:
  - **Rule:** If you use `CurrentUser` / `CurrentAdminUser` / `CurrentActiveUser`, don’t also use `= Depends()`; just type the parameter as `admin: CurrentAdminUser` and let FastAPI handle it.
  - For optional auth, use `get_current_user_optional` (already present) and a plain `Depends` call.
- Run a small grep over `api/` to confirm:
  - No remaining `Current*User = Depends(...)` patterns.
  - Optional-user endpoints use explicit optional dependencies instead of abusing `CurrentUser`.

Acceptance:

- Conventions are documented in one place (dependencies or dev guide).
- All `Current*User` usages in `api/v1` follow the documented pattern.

3. Pydantic v2 and `from __future__ import annotations`

Problem:

- Some modules (e.g. game_dialogue plugin) use `from __future__ import annotations` with Pydantic v2, which triggers forward-ref resolution under Pydantic’s `TypeAdapter`.
- Combined with imports, this can cause errors like `PydanticUndefinedAnnotation: name 'Optional' is not defined` if type hints are not evaluated the way Pydantic expects.
- Other API modules do not use `__future__`, so behavior is mixed.

Proposed:

- Pick a consistent convention for backend API modules and plugins:
  - Either:
    - Prefer **no** `from __future__ import annotations` in Pydantic-heavy FastAPI modules (let type hints be evaluated eagerly), or
  - Explicitly support `__future__` by ensuring:
    - All annotations are valid in the module namespace (`Optional`, `Dict`, etc. imported), and
    - We follow Pydantic v2 recommendations for forward refs where needed.
- Document the chosen approach in the dev guide.
- Audit plugins (`plugins/*/manifest.py`) and key API modules (`api/v1/*`) for accidental mismatches.

Acceptance:

- `game_dialogue` and any other plugin using Pydantic models can import cleanly under Pydantic v2 with no undefined-annotation errors.
- The convention (with or without `__future__`) is written down and followed for new modules.

4. ORM naming collisions (`metadata`, `model_*`, etc.)

Problem:

- SQLModel/SQLAlchemy reserve certain attribute names (`metadata` is the big one; Pydantic also reserves `model_*` namespaces).
- In `npc_memory.py`, several models used `metadata` as a field name, causing SQLAlchemy errors like:
  - `Attribute name 'metadata' is reserved when using the Declarative API.`
- This was fixed by renaming to `meta` with `sa_column(name="metadata")`, but it’s easy to reintroduce similar issues.

Proposed:

- Codify and document a hard rule for ORM models:
  - Never define attributes named `metadata`, `model_*`, or other known SQLAlchemy/Pydantic reserved names.
  - Use `meta`, `extra`, `data`, etc. and explicitly set `sa_column(name="metadata")` where legacy DB columns require that name.
- Add a short “gotchas” note in `ARCHITECTURE.md` or a backend README, referencing the `npc_memory` fix as an example.
- Optionally add a lightweight static check (even a one-off script) that greps for `metadata:` definitions in `domain/` to catch regressions.

Acceptance:

- All domain models with a `metadata` column now use safe attribute names (`meta`, etc.) with explicit `sa_column` mappings.
- The rule is captured in docs so new models won’t repeat the mistake.

5. Raw SQL vs service responsibilities (logs API)

Problem:

- `api/v1/logs.py` does two things:
  - Uses `LogService` for ingestion and standard queries.
  - Runs direct `text()` SQL to implement `/fields` and `/distinct`, which know about column names and JSON structure.
- This splits log schema knowledge between the service and the API module; changes to the log table risk going out of sync across both.

Proposed:

- Move the field discovery and distinct-value logic into `LogService`:
  - e.g., `get_fields(service: Optional[str], sample_limit: int)`
  - e.g., `get_distinct(field: str, filters: ...)`
- Make the API endpoints in `logs.py` thin forwarders:
  - They should only handle request/response modeling (Pydantic types, HTTP errors), not SQL.
- Ensure any new columns added to the log table are reflected in one place (the service), and the API uses that.

Acceptance:

- `/fields` and `/distinct` endpoints call `LogService` methods instead of embedding SQL text directly.
- Log schema knowledge is centralized in the service layer.

6. Plugin manager vs `api/v1/__init__` coupling

Problem:

- `api/v1/__init__.py` imports a broad set of v1 modules, and plugin manifests often import `router` from there.
- A single missing import or error in one v1 module (e.g., `dev_architecture`) can cascade and prevent many plugins from loading (accounts, logs, game_*).

Proposed:

- Either:
  - Narrow the imports in `api/v1/__init__.py` to only what’s truly necessary (or deprecate importing from `api.v1` as a package for plugins), or
  - Update plugin manifests to import only the specific route modules they need (many already do this: e.g., `from pixsim7.backend.main.api.v1.logs import router`).
- Add a lightweight “route import self-check” (script or test) that imports each `api/v1/*.py` module in isolation and surfaces any import errors early in development.

Acceptance:

- A broken `dev_architecture` or similar module no longer silently prevents unrelated plugins from loading without a clear, early signal.
- Plugin manifests rely on explicit per-module imports instead of heavy dependency on `api/v1/__init__`.

7. Event/logging ergonomics for plugins and handlers

Problem:

- Event handler plugins (e.g., `event_handlers/auto_retry`) depend directly on `pixsim_logging` helpers, which changed from a “named logger” style to `configure_logging(service_name)` and `get_logger()`.
- Small signature changes in shared logging helpers caused runtime errors like `TypeError: get_logger() takes 0 positional arguments but 1 was given`.

Proposed:

- Introduce a tiny “logging facade” in the backend (or use a pattern via `pixsim7.backend.main.shared`):
  - e.g., `from pixsim7.backend.main.shared.logging import get_event_logger`
  - Implementation can wrap `configure_logging` / `get_logger` and hide underlying changes from plugins.
- Replace direct `from pixsim_logging import get_logger` usages in backend event handlers with the facade.
- Update docs (e.g., `LOGGING_STRUCTURE.md` or `DEVELOPMENT_GUIDE.md`) to specify the recommended way for backend code to obtain loggers.

Acceptance:

- Event handler plugins import logging via a stable backend-local helper instead of directly from `pixsim_logging` internals.
- A future change to logging configuration won’t break event handlers; only the facade needs to be updated.

Summary / Outcomes

When Task 40 is complete, the backend will have:

- Clear domain import rules for core vs extended models.
- Consistent FastAPI dependency patterns for auth (no double-Depends on `Current*User`).
- A chosen, documented convention for Pydantic v2 + `from __future__ import annotations` in API modules and plugins.
- A hard rule and documentation for avoiding ORM naming collisions like `metadata`.
- Logs API endpoints that delegate schema-aware queries to `LogService` instead of embedding raw SQL.
- Less fragile plugin imports with better early failure signals.
- A stable logging facade for event handlers and plugins.

This work should reduce the friction of future refactors and make the backend more resilient to small changes in shared helpers.
"""
