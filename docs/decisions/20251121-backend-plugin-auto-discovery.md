# ADR: Backend Plugin Auto-Discovery for Routes and Domain Models

- **Date:** 2025-11-21
- **Status:** Accepted
- **Authors:** Core PixSim7 team

---

## Context

Originally, the backend API and domain models were wired up via **manual imports and router registration** in `main.py`:

- Domain models imported directly into a central SQLModel metadata.
- FastAPI routers included one-by-one in `main.py` with explicit `include_router()` calls.

This led to several problems:

- Adding a new feature required editing `main.py`, increasing coupling and merge conflicts.
- It was easy to forget to register a router or model, leading to **404s on implemented endpoints**.
- There was no structured way to **enable/disable features** or model dependencies between them.
- PixSim6 heritage code had its own plugin patterns, increasing conceptual drift.

At the same time, PixSim7 needed:

- A clean way to **modularize features** (prompts, game systems, logging, WebSockets, etc.).
- Support for **route plugins** and **domain model plugins** that can be enabled/disabled.
- A path to align backend plugin behavior with frontend/graph extensions (see `docs/EXTENSION_ARCHITECTURE.md`).

---

## Decision

We introduced a **backend plugin auto-discovery system** that:

- Uses **manifest files** to declare route and domain model plugins.
- Discovers and registers plugins at startup without manual edits to `main.py`.
- Encodes dependencies and requirements (DB, Redis) in manifest metadata.

Key elements:

1. **Domain model plugins**
   - Folder: `pixsim7/backend/main/domain_models/<feature>_models/`
   - Manifest: `manifest.py` exporting a `DomainModelManifest` with:
     - `id`, `name`, `description`
     - `models`: list of model names as strings
     - `dependencies`: e.g. `["core_models"]`
     - `enabled: bool`
   - Discovery: `init_domain_registry("pixsim7/backend/main/domain_models")` scans and registers models with SQLModel.

2. **Route plugins**
   - Folder: `pixsim7/backend/main/routes/<feature>/`
   - Manifest: `manifest.py` exporting a `PluginManifest` with:
     - `id`, `name`, `version`, `description`
     - `kind="route"`, `prefix` (e.g. `/api/v1`)
     - `tags`, `dependencies`, `requires_db`, `requires_redis`, `enabled`
   - Discovery: a plugin manager scans `pixsim7/backend/main/routes` and `include_router()` calls are driven by manifests.

3. **Main application startup**
   - `main.py` no longer imports individual domain models or routers.
   - Instead, it:
     - Initializes the domain registry with the domain model plugin directory.
     - Initializes the plugin manager with the routes plugin directory.
     - Enables all plugins (or a filtered set based on configuration).

4. **Error handling and dependencies**
   - Plugin manifests can declare dependencies (e.g. `auth`, `assets`).
   - The plugin manager uses this to determine load order and to surface configuration errors early.

We treat this plugin system as the **canonical way** to add backend routes and domain models for PixSim7.

---

## Consequences

**Positive**

- **Modularity & extensibility**
  - Features are self-contained in `domain_models/<feature>_models` and `routes/<feature>`.
  - New route/domain plugins can be added without editing `main.py`.
- **Clear dependencies**
  - `dependencies` field in manifests makes feature relationships explicit.
  - Easier to reason about load order and avoid circular imports.
- **Enable/disable features**
  - Entire feature sets can be turned on/off via manifest flags or configuration.
- **Alignment with extension architecture**
  - Backend plugins line up with other extension surfaces described in `docs/EXTENSION_ARCHITECTURE.md`.

**Negative / trade-offs**

- **More indirection**
  - Understanding which routes are loaded now requires reading manifests and logs, not just `main.py`.
- **Runtime discovery complexity**
  - Plugin discovery and dependency resolution add some startup complexity.
- **Errors can be deferred**
  - Without proper guardrails, a broken plugin manifest can still result in missing routes (404s) instead of clear startup failures, which is why we introduced additional checks via Task 31.

**Risks**

- Misconfigured manifests (wrong `prefix`, missing imports) can lead to partially loaded APIs.
- Overuse of optional plugins could fragment the API surface if not documented and tested consistently.

Mitigations:

- Plugin health checks and fail-fast behavior for “required” plugins (see `claude-tasks/31-critical-surface-guardrails-and-ci-checks.md`).
- Central documentation in `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` and `docs/EXTENSION_ARCHITECTURE.md`.

---

## Related Code / Docs

- Code:
  - `pixsim7/backend/main/infrastructure/domain_registry.py`
  - `pixsim7/backend/main/infrastructure/plugins/types.py`
  - `pixsim7/backend/main/infrastructure/plugins/manager.py`
  - `pixsim7/backend/main/domain_models/*/manifest.py`
  - `pixsim7/backend/main/routes/*/manifest.py`
  - `pixsim7/backend/main/main.py`
- Docs:
  - `ARCHITECTURE.md`
  - `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md`
  - `docs/EXTENSION_ARCHITECTURE.md`
  - `docs/APP_MAP.md`
  - `claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md`

