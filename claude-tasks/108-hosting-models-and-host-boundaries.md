**Task: Hosting Models & Host Boundaries (Multi-Host Friendly Architecture)**

> **For Agents (How to use this file)**
> - This task is about **architecture and constraints**, not a single feature.
> - Goal: make sure PixSim7 can support multiple hosting models in the future (shared server, self-hosted, friend-hosted) **without** major refactors.
> - The current implementation is “single backend, many users/worlds”; this task defines the rules that keep us open to:
>   - Players running their own backend/frontend instance.
>   - One player connecting to another player’s host.
>   - Later, optional federation/sync between hosts (out of scope for now).
> - Do not introduce cross-host sync or federation here. This is about **not blocking ourselves** and documenting the host boundary clearly.

---

## Context & Goals

**Today**:

- Backend and frontend are effectively designed around a **single backend instance** where:
  - Users create and join worlds on that server.
  - Sessions and game state live in that server’s database.
  - Plugins and stat packages are process-local.
- This works well for a shared server but implicitly assumes “the backend” as a singular authority.

**Future-friendly target**:

- Treat a **host** as a first-class concept:
  - A host = one running PixSim7 backend (+ DB/Redis) with some set of worlds/plugins enabled.
  - Examples:
    - Shared multi-tenant server (current model).
    - Player A’s self-hosted instance.
    - Player B’s self-hosted instance, which A’s client can connect to.
- IDs (`world_id`, `session_id`, `npc_id`, etc.) are **host-local** by design.
- Frontend treats backend URL as **pluggable** (can point to different hosts with the same client build).
- No core types assume a globally unique, cross-host identity or global singleton game state.

**Out of scope (future tasks)**:

- Actual federation/sync between hosts (e.g., moving worlds or sessions between servers).
- Cross-host presence or matchmaking.
- Multi-tenant routing gateways / proxy layers.

This task should leave us in a place where all of those are possible later, without requiring rewrites of IDs, world/session models, or plugin architecture.

---

## High-Level Principles

1. **Host-Local IDs**
   - `GameWorld.id`, `GameSession.id`, `GameNPC.id`, etc. are **only meaningful within a single host**.
   - No assumptions that an ID is globally unique across servers.
   - Any future cross-host reference must be explicitly `(host_id, world_id, ...)` or via export/import metadata.

2. **Configurable Backend Endpoint**
   - Frontend must not bake in a single backend origin.
   - API clients use a configurable base URL (env, runtime config, or user setting) so the same UI can talk to:
     - `https://shared.pixsim7.host`
     - `http://localhost:8000`
     - `https://friend-host.example.com`

3. **World-Scoped State, No Global Game Singletons**
   - All gameplay state is scoped via `world_id` and/or `session_id`.
   - No “global relationship table” or “global stats” outside world/session context.
   - Existing patterns (world-scoped schemas, session-scoped relationships/stats, plugin world-scoping) are preserved and reinforced.

4. **Process-Local Registries**
   - Plugin registry, behavior registry, stat package registry, etc. stay **process-local**.
   - Each host has its own set of loaded plugins and stat packages.
   - Worlds/projects on a host choose which packages and plugins they use.

5. **No DB Topology Leaking into Public Types**
   - DB shard/cluster/table details must not leak into user-visible IDs or API-level types.
   - IDs remain opaque ints/strings; any future migration/federation uses separate metadata, not encoded in the numeric IDs.

---

## Phase Checklist

- [x] **Phase 1 – Document Host Concept & Constraints** (documented in Audit Findings below)
- [x] **Phase 2 – Ensure Frontend Uses Configurable Backend Base URL**
- [x] **Phase 3 – Audit Backend for Global-State Assumptions**
- [x] **Phase 4 – Align Plugin & Stat Package Systems with Host Boundary**
- [ ] **Phase 5 – Optional: Host-Aware Export/Import Metadata Design**

Each phase should be small and reviewable. The goal is to adjust assumptions and docs; heavy implementation (federation, migration tools) is explicitly out of scope here.

---

## Phase 1 – Document Host Concept & Constraints

**Goal:** Make “host” and host-local IDs an explicit design contract so future work doesn’t accidentally bake in single-host assumptions.

**Steps:**

- Add a short doc, e.g. `docs/HOSTING_MODELS_AND_HOST_BOUNDARIES.md`, covering:
  - Definition of a **host** (backend instance + DB + plugins).
  - Hosting models (shared server, self-hosted, friend-hosted).
  - Explicit statement that IDs are **host-local**.
  - Constraints on frontend (configurable base URL) and backend (world-scoped state, no global singletons).
- Cross-link from:
  - `docs/SYSTEM_OVERVIEW.md` (high-level architecture).
  - `docs/BACKEND_MODERNIZATION.md` / plugin docs if relevant.
- Update or create a short summary in `claude-tasks/TASK_STATUS_UPDATE_NEEDED.md` indicating that hosting models are being formalized and should be checked before introducing new global concepts.

**Key files:**

- `docs/SYSTEM_OVERVIEW.md`
- `docs/BACKEND_MODERNIZATION.md` (if present)
- `docs/HOSTING_MODELS_AND_HOST_BOUNDARIES.md` (new)
- `claude-tasks/TASK_STATUS_UPDATE_NEEDED.md`

---

## Phase 2 – Ensure Frontend Uses Configurable Backend Base URL

**Goal:** Make sure the frontend can talk to different hosts without rebuilds, or at least with minimal configuration changes.

**Steps:**

- Audit frontend API client(s) for backend URL handling:
  - Identify where the base URL is set (env vars, hard-coded strings, or inferred from window location).
  - Ensure there is a single, well-defined way to change the backend base for the whole app (e.g. `VITE_API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, or a runtime config file).
- If needed, introduce a small configuration layer:
  - A central `getApiClient()` / `getApiBaseUrl()` helper.
  - A UI entry point (or dev panel option) where a user can override the backend URL (optional, but useful for self-host testing).
- Update docs:
  - Add a “Configuring backend URL” section to the frontend README or system overview.
  - Make it clear that changing the base URL is the supported way to connect to different hosts.

**Key files:**

- Frontend API client modules (e.g. `apps/main/src/lib/api/*`)
- Frontend config/README

---

## Phase 3 – Audit Backend for Global-State Assumptions

**Goal:** Ensure backend behavior and types don’t assume a single canonical host or global IDs.

**Steps:**

- Scan for and sanity-check:
  - Any code that builds compound IDs with assumptions like `"world:{id}"` being globally unique across hosts.
  - Any references to “global” game state not scoped by world/session (e.g. global mood tables, global relationship tables).
  - Any code that might implicitly assume one global set of plugins or stat packages for “all games” (rather than per-host/per-world).
- For each global-ish pattern found:
  - Confirm that it is truly process-local (per host instance) and not serialized in a way that would tie different hosts together.
  - If something is serialized in a cross-host friendly way, make sure it uses **world/local IDs only** and not any notion of “the server” baked into the data.
- Record findings in this task file (short notes + file paths) for future reference; only change code where it’s clearly needed to avoid host‑wide singletons.

**Key files:**

- Backend “global” registries / singletons:
  - `pixsim7/backend/main/infrastructure/plugins/*`
  - `pixsim7/backend/main/domain/stats/package_registry.py`
  - Any other global registries or caches
- World/session services:
  - `pixsim7/backend/main/services/game/*`
  - `pixsim7/backend/main/services/narrative/*`

---

## Phase 4 – Align Plugin & Stat Package Systems with Host Boundary

**Goal:** Confirm plugin and stat package systems behave as host-local registries, and document how they fit into multi-host setups.

**Steps:**

- Plugins:
  - Confirm that `PluginManager` and `plugin_hooks` are process-local and initialized per host instance (no cross-process shared state).
  - Document that plugin enablement and configuration are **host-specific** and may differ between hosts running the same codebase.
- Stat Packages:
  - Confirm `stat/package_registry.py` is process-local and does not assume a global set of packages across hosts.
  - Document that each host has its own set of registered stat packages (built-in + plugin-provided).
  - Make it explicit that worlds/projects **choose** which stat definitions to use via world meta (`stats_config`) or similar config, but packages themselves are host-local.
- Optional: add a small helper or doc snippet showing how a plugin could register stat packages via the `STAT_PACKAGES_REGISTER` hook, emphasizing that this is per-host, not global.

**Key files:**

- `pixsim7/backend/main/infrastructure/plugins/__init__.py`
- `pixsim7/backend/main/infrastructure/plugins/manager.py`
- `pixsim7/backend/main/infrastructure/plugins/types.py`
- `pixsim7/backend/main/domain/stats/package_registry.py`
- `pixsim7/backend/main/domain/stats/relationships_package.py`

---

## Phase 5 – Optional: Host-Aware Export/Import Metadata Design

**Goal:** Sketch, but not necessarily implement, how worlds/sessions could be exported/imported between hosts without breaking the host-local ID guarantees.

**Steps (design-level only; code optional):**

- Propose a light metadata format for export/import (document only, e.g. in the hosting models doc):
  - Include `host_id` or `origin` metadata in export bundles, but keep core IDs unchanged.
  - Specify that when importing on another host, IDs are treated as local and may be remapped if needed (implementation later).
- Note implications for:
  - World meta (`GameWorld.meta`).
  - Session data (`GameSession.flags`, `GameSession.stats`).
  - Plugins and stat packages (e.g. mapping stat definition IDs if package sets differ).
- Clearly mark this as **future work**; this task only captures the design constraints so implementation can be added later without surprises.

**Key files/docs:**

- `docs/HOSTING_MODELS_AND_HOST_BOUNDARIES.md` (design appendix)

---

## Audit Findings (2025-12-02)

### Phase 2 – Frontend URL Configuration ✓

**Status:** Already host-friendly.

The frontend API client (`apps/main/src/lib/api/client.ts`) supports configurable backend URLs:

1. **`VITE_BACKEND_URL`** env var - Primary configuration method
2. **Automatic inference** - Falls back to `${protocol}//${hostname}:8000` from `window.location`
3. **Localhost fallback** - `http://localhost:8000`

```typescript
// apps/main/src/lib/api/client.ts:5-17
function computeBackendUrl(): string {
  const envUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }
  return 'http://localhost:8000';
}
```

**Minor note:** Some components (`CharacterGraphBrowser`, `SceneCharacterViewer`) have their own `apiBaseUrl` prop defaulting to `/api/v1` (relative). This works fine but relies on the page being served from the same origin as the API.

---

### Phase 3 – Backend Global-State Audit ✓

**Status:** All registries are process-local by design. No cross-host assumptions found.

**Registries audited:**

| Registry | Location | Scope | Notes |
|----------|----------|-------|-------|
| `_packages` (stat packages) | `domain/stats/package_registry.py` | Module-level dict | Process-local ✓ |
| `ai_model_registry` | `services/ai_model/registry.py` | Module singleton | Process-local ✓ |
| `behavior_registry` | `infrastructure/plugins/behavior_registry.py` | Module singleton | Process-local ✓ |
| `domain_registry` | `infrastructure/domain_registry.py` | Module singleton | Process-local ✓ |
| `PluginManager` | `infrastructure/plugins/manager.py` | Instance on `app.state` | Per-app instance ✓ |

**ID structure audit:**

- `GameWorld.id`, `GameSession.id`, `GameNPC.id` etc. are simple autoincrement integers
- No embedded host identifiers in IDs
- All foreign keys reference tables within the same database
- No cross-host references in serialized data

**Data scoping:**

- Sessions have `world_id` (world-scoped)
- Stats stored in `GameSession.stats` as JSON with string keys (`stat_definition_id`)
- World config in `GameWorld.meta.stats_config`
- No global relationship tables or global stats outside world/session context

---

### Phase 4 – Plugin & Stat Package Systems ✓

**Status:** Properly host-local.

**Plugin System:**

- `PluginManager` is instantiated per FastAPI app (`main.py:96`: `app.state.plugin_manager = plugin_manager`)
- Plugins discovered and loaded from filesystem per host
- Plugin allowlist/denylist configurable via settings (host-specific)
- `STAT_PACKAGES_REGISTER` hook fires during plugin load, allowing plugins to register stat packages

**Stat Package System:**

- `package_registry._packages` is a module-level dict (process-local)
- Worlds **choose** which stat definitions to use via `GameWorld.meta.stats_config`
- Stat definition IDs are convention-based strings (e.g., `"relationships"`, `"core.relationships"`)
- No database foreign keys to global registries

**Key design insight:** The package registry is a **discovery mechanism**, not a runtime dependency. Worlds store their own complete stat definitions in `meta.stats_config`. This means:
- A world exported from Host A can be imported to Host B even if Host B has different packages loaded
- The world's stat definitions travel with the world data, not with the registry

---

## Validation & Notes

- This task deliberately avoids introducing new runtime behavior like federation or cross-host sync.
- Validation is mostly about:
  - Documentation: clear explanation of host-local IDs and hosting models.
  - Code audits: verifying that no new global assumptions are sneaking in.
  - Config checks: ensuring the frontend can point at different backends without code changes.
- When implementing other tasks (e.g. stat cutover, new plugins, new world systems), refer back to this file to avoid:
  - Adding “global” IDs that assume a single backend.
  - Tight coupling between plugins/stat packages and a specific host/DB layout.

Once this task is complete, PixSim7 should be **host-agnostic** by design: the same codebase can support “one shared server”, “each player runs their own host”, or more advanced setups in the future, without rethinking IDs, plugins, or stat systems.

