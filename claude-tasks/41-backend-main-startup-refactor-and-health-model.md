&nbsp; Task 41 — Backend Main Startup Refactor \& Health Model



&nbsp; Goal



&nbsp; Make `pixsim7.backend.main.main` easier to evolve, test, and deploy by:

&nbsp; - Decomposing the monolithic `lifespan` startup into smaller, composable steps.

&nbsp; - Removing hard-coded filesystem paths for domain/models/plugins/middleware in favor of config.

&nbsp; - Tightening how global registries are exposed (toward per-app state).

&nbsp; - Clarifying health/readiness semantics for DB/Redis and plugins.



&nbsp; Background



&nbsp; The current FastAPI entrypoint at `pixsim7/backend/main/main.py` acts as a “god startup function”:



&nbsp; - `lifespan(app)` handles everything: secret validation, domain registry, DB init and seeding, Redis

&nbsp; checks, event handler registration, ECS component registration, plugin and route plugin initialization,

&nbsp; behavior registry locking, and middleware lifecycle hooks.

&nbsp; - Plugin, middleware, and domain registries live in module-level globals (`behavior\_registry`,

&nbsp; `domain\_registry`, `middleware\_manager`, plugin managers via `set\_plugin\_manager`).

&nbsp; - Discovery of domain models, routes, plugins, and middleware is driven by hard-coded directory paths

&nbsp; under `pixsim7/backend/main/\*`.

&nbsp; - `/health` always returns HTTP 200 with a textual `database`/`redis` status, which is not ideal for load

&nbsp; balancers and readiness checks.



&nbsp; This works today, but it makes testing, multi-app setups, and future packaging changes harder than

&nbsp; necessary.



&nbsp; Scope



&nbsp; Includes:



&nbsp; - `pixsim7/backend/main/main.py`

&nbsp; - Supporting infrastructure:

&nbsp;   - `pixsim7/backend/main/infrastructure/domain\_registry.py`

&nbsp;   - `pixsim7/backend/main/infrastructure/plugins/\*`

&nbsp;   - `pixsim7/backend/main/infrastructure/middleware/\*`

&nbsp;   - `pixsim7/backend/main/infrastructure/redis.py`

&nbsp;   - `pixsim7/backend/main/infrastructure/database/\*`

&nbsp; - Health and diagnostics:

&nbsp;   - `pixsim7/backend/main/api/v1/admin\_plugins.py`

&nbsp;   - `/`, `/health`, and any new `/ready` endpoints



&nbsp; Out of scope:



&nbsp; - Redesign of the plugin system behavior registry or capabilities.

&nbsp; - Changing overall DB schema or domain model semantics.

&nbsp; - Replacing directory-based plugin discovery with full entrypoint/package-based loading (can be a follow-

&nbsp; up task).



&nbsp; Problems \& Proposed Work



&nbsp; 1. Monolithic `lifespan` function



&nbsp; Problem:



&nbsp; - `lifespan(app)` performs many responsibilities in one coroutine:

&nbsp;   - Secret key validation.

&nbsp;   - Domain registry initialization.

&nbsp;   - DB initialization and default preset seeding.

&nbsp;   - Redis connectivity check.

&nbsp;   - Provider registration.

&nbsp;   - Event handler registration (including WebSocket).

&nbsp;   - ECS component registration.

&nbsp;   - Feature plugin and route plugin manager initialization, enabling, and behavior registry locking.

&nbsp;   - Middleware lifecycle hooks.

&nbsp; - This makes it:

&nbsp;   - Hard to test individual steps.

&nbsp;   - Hard to reuse selective pieces (e.g., for worker-only processes).

&nbsp;   - Harder to reason about startup order and error handling.



&nbsp; Proposed:



&nbsp; - Extract clearly named helper functions in `main.py` (or a `startup.py` helper module), with minimal

&nbsp; side effects:

&nbsp;   - `validate\_settings(settings) -> None`

&nbsp;   - `setup\_domain\_registry() -> DomainModelRegistry`

&nbsp;   - `setup\_database\_and\_seed() -> None`

&nbsp;   - `setup\_redis() -> RedisStatus / bool`

&nbsp;   - `setup\_event\_handlers(app: FastAPI) -> None`

&nbsp;   - `setup\_ecs\_components() -> int`

&nbsp;   - `setup\_plugins(app: FastAPI) -> tuple\[PluginManager, PluginManager]`

&nbsp;   - `setup\_behavior\_registry\_lock(plugin\_manager, routes\_manager) -> None`

&nbsp;   - `setup\_middleware\_lifecycle(app: FastAPI) -> None` (or reuse existing manager)

&nbsp; - Keep `lifespan` focused on:

&nbsp;   - Orchestrating these steps in order.

&nbsp;   - Handling failures at the appropriate granularity (fail-fast vs degraded mode).

&nbsp;   - Ensuring shutdown mirrors startup (disable middleware, routes, plugins, DB/Redis cleanup).



&nbsp; Acceptance:



&nbsp; - `lifespan` is a short, readable orchestration function using extracted helpers.

&nbsp; - Unit/integration tests can call individual helpers (e.g., `setup\_domain\_registry`) independently.

&nbsp; - Startup logs still show the same high-level milestones, but the code is easier to follow.



&nbsp; 2. Hard-coded filesystem paths for domain/models/plugins/middleware



&nbsp; Problem:



&nbsp; - Current code uses string paths like:

&nbsp;   - `init\_domain\_registry("pixsim7/backend/main/domain\_models")`

&nbsp;   - `init\_plugin\_manager(app, "pixsim7/backend/main/plugins", ...)`

&nbsp;   - `init\_plugin\_manager(app, "pixsim7/backend/main/routes", ...)`

&nbsp;   - `init\_middleware\_manager(app, "pixsim7/backend/main/middleware")`

&nbsp; - These depend directly on the repo layout and make packaging or alternate roots awkward (e.g. installing

&nbsp; the backend as a Python package, or using different plugin directories per deployment).



&nbsp; Proposed:



&nbsp; - Extend `settings` (probably via `pixsim7.backend.main.shared.config`) to include optional configurable

&nbsp; paths:

&nbsp;   - `domain\_models\_dir: str | Path = "pixsim7/backend/main/domain\_models"`

&nbsp;   - `feature\_plugins\_dir: str | Path = "pixsim7/backend/main/plugins"`

&nbsp;   - `route\_plugins\_dir: str | Path = "pixsim7/backend/main/routes"`

&nbsp;   - `middleware\_dir: str | Path = "pixsim7/backend/main/middleware"`

&nbsp; - Use these settings in `main.py` instead of literals.

&nbsp; - Normalize to `Path` objects early and log the effective paths at startup.

&nbsp; - Keep defaults identical to current behavior so existing deployments don’t break.



&nbsp; Acceptance:



&nbsp; - All calls to `init\_domain\_registry`, `init\_plugin\_manager`, and `init\_middleware\_manager` in `main.py`

&nbsp; use paths from `settings`.

&nbsp; - Defaults yield the same behavior as today when environment does not override anything.

&nbsp; - It becomes possible (and documented) to point plugins/middleware/routes at a different directory in dev

&nbsp; or production.



&nbsp; 3. Global singleton registries vs per-app state



&nbsp; Problem:



&nbsp; - Several core registries are module-level globals:

&nbsp;   - `domain\_registry` in `domain\_registry.py`

&nbsp;   - `middleware\_manager` in `middleware/manager.py`

&nbsp;   - Plugin manager via `set\_plugin\_manager` / `get\_plugin\_context`

&nbsp;   - Behavior registry lock is called globally.

&nbsp; - This:

&nbsp;   - Makes tests vulnerable to state leakage between runs (once a module is imported, its global is

&nbsp; mutated).

&nbsp;   - Makes multi-app in one process scenarios tricky (e.g., admin API app vs main app, or multiple FastAPI

&nbsp; instances for tests).



&nbsp; Proposed:



&nbsp; - Move toward an “app-bound” model while keeping the public surface area familiar:

&nbsp;   - Attach key instances to `app.state`, for example:

&nbsp;     - `app.state.domain\_registry`

&nbsp;     - `app.state.plugin\_manager`

&nbsp;     - `app.state.routes\_manager`

&nbsp;     - `app.state.middleware\_manager`

&nbsp;   - Adapt DI helpers (`get\_plugin\_context`, admin plugin APIs, etc.) to read from `request.app.state`

&nbsp; where possible.

&nbsp; - Keep backwards-compatible module-level access where necessary, but funnel writes through a shared helper

&nbsp; that can also update `app.state`:

&nbsp;   - E.g., in `plugins.dependencies.set\_plugin\_manager`, also set an attribute on the active app if

&nbsp; available.

&nbsp; - Keep the first version light: we don’t need full multi-tenant support, just a clear pattern to avoid

&nbsp; doubling down on globals.



&nbsp; Acceptance:



&nbsp; - After startup, `app.state` contains references to the key managers/registries used by routes and admin

&nbsp; APIs.

&nbsp; - Existing imports continue to function, but new code is encouraged (and documented) to use `app.state` as

&nbsp; the source of truth.

&nbsp; - Tests can construct a FastAPI app, call the setup helpers, and inspect `app.state` without relying on

&nbsp; global module state.



&nbsp; 4. Health and readiness endpoints semantics



&nbsp; Problem:



&nbsp; - The `/` and `/health` endpoints behave as follows:

&nbsp;   - `/` returns app name/version/status; good as a liveness check.

&nbsp;   - `/health` checks Redis and DB, but:

&nbsp;     - Always returns HTTP 200 with `"status": "healthy"`, even if DB connection fails (it only changes the

&nbsp; `database` string to something like `"error: OperationalError"`).

&nbsp; - In most orchestrated environments (k8s, ECS, etc.), operators expect:

&nbsp;   - A liveness endpoint: “is the process up?” — usually always 200 unless the app is truly wedged.

&nbsp;   - A readiness endpoint: “can this instance handle real traffic?” — should fail (non-200) when DB or

&nbsp; other critical dependencies are down.



&nbsp; Proposed:



&nbsp; - Keep `/` as a lightweight liveness probe; do not add heavy checks there.

&nbsp; - Evolve `/health` or add a new `/ready` endpoint with clearer semantics:

&nbsp;   - Option A: `/health` becomes readiness, returns 503 when:

&nbsp;     - DB connectivity check fails.

&nbsp;     - Required plugin/route sets failed to load (if that’s detectable).

&nbsp;     - Optional: Redis is required and unavailable.

&nbsp;   - Option B: Add `/ready` as readiness with the semantics above, and keep `/health` “soft” but clearly

&nbsp; documented.

&nbsp; - Make the health/ready response body explicit about:

&nbsp;   - `status`: `"ready"` / `"degraded"` / `"unavailable"` (or similar).

&nbsp;   - `database`: `"connected"` / `"error:<class>"`.

&nbsp;   - `redis`: `"connected"` / `"disconnected"`.

&nbsp;   - `plugins\_loaded`: boolean or counts.



&nbsp; Acceptance:



&nbsp; - There is at least one endpoint that returns a non-200 status when DB is unavailable (readiness).

&nbsp; - Logs and response payload clearly indicate which subsystem failed.

&nbsp; - The change is documented in `GETTING\_STARTED.md` or a backend README so ops know which endpoint to use

&nbsp; for liveness vs readiness.



&nbsp; 5. Startup error-handling strategy for plugins and optional subsystems



&nbsp; Problem:



&nbsp; - Some subsystems are wrapped in `try/except` (default preset seeding, Redis), while others are not

&nbsp; (plugin loading, ECS registration, event handler registration).

&nbsp; - This creates a mixed implicit policy:

&nbsp;   - Redis and seed failures log warnings but allow startup.

&nbsp;   - Plugin errors can crash startup depending on `fail\_fast=settings.debug`.

&nbsp; - There is currently no single place that defines which subsystems are “required” for the app to be

&nbsp; considered ready.



&nbsp; Proposed:



&nbsp; - Make the policy explicit:

&nbsp;   - Document in code and a small section of `GETTING\_STARTED.md`:

&nbsp;     - DB and core domain registry: required → startup should fail if they fail.

&nbsp;     - Feature plugins and route plugins: fail-fast in dev/CI, but possibly more tolerant in production

&nbsp; only for optional plugins.

&nbsp;     - Redis: optional but recommended; its absence puts the app in a “degraded” mode (background jobs

&nbsp; disabled).

&nbsp; - Reflect this policy in:

&nbsp;   - Helper functions (e.g., `setup\_redis()` returns a status flag and logs; `setup\_plugins()` raises if a

&nbsp; required plugin fails).

&nbsp;   - The readiness endpoint status.

&nbsp; - Consider per-plugin “required vs optional” semantics in manifest (if not already there) to avoid

&nbsp; `fail\_fast` being global.



&nbsp; Acceptance:



&nbsp; - Startup behavior for each subsystem (DB, Redis, plugins, ECS, events) is documented and reflected in

&nbsp; code.

&nbsp; - A single plugin failure in a non-critical area does not unexpectedly crash production startup unless

&nbsp; marked as required.

&nbsp; - Readiness output aligns with what actually failed.



&nbsp; Summary / Outcomes



&nbsp; When this task is complete:



&nbsp; - `main.py` has a decomposed startup lifecycle with testable helpers, instead of a single large

&nbsp; `lifespan`.

&nbsp; - Plugin, route, middleware, and domain discovery locations are driven through configuration, with

&nbsp; sensible defaults matching the current layout.

&nbsp; - Key managers and registries are attached to `app.state`, reducing reliance on module-level globals and

&nbsp; improving testability.

&nbsp; - Health and readiness semantics are explicit: operators can tell from HTTP status and payload when the

&nbsp; app is actually ready vs degraded.

&nbsp; - The startup error-handling strategy for DB, Redis, plugins, and ECS is documented and consistent with

&nbsp; behavior.

