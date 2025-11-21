# Extension & Plugin Architecture

**Last Updated:** 2025-11-21  
**Status:** Draft – to be kept in sync with `ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`, and `docs/APP_MAP.md`

---

## 1. Overview

PixSim7 exposes several **extension surfaces** so that features can be added without forking core systems:

- **Backend plugins** – add API routes, domain models, behavior/NPC extensions, middleware, and event handlers.
- **Frontend plugins** – add UI overlays, HUD tools, dev panels, and workspace utilities.
- **Graph / editor plugins** – add scene/node renderers and template tooling in the graph editor.
- **Game/world JSON extensions** – extend game behavior and state via world/session JSON (no new tables).

This document:

- Describes each extension type and where it lives.
- Explains **when to use which surface**.
- Defines **where extension state belongs** (DB vs JSON vs client).

For a high‑level system view, always read `ARCHITECTURE.md` first. For app layout and routes, see `docs/APP_MAP.md`. For game systems and session structure, see `GAMEPLAY_SYSTEMS.md`.

---

## 2. Extension Types at a Glance

| Type                     | Scope          | Code / Manifests                                               | Typical Use                                     |
|--------------------------|---------------|-----------------------------------------------------------------|-------------------------------------------------|
| Backend route plugin     | Backend       | `pixsim7/backend/main/routes/<feature>/manifest.py`                 | New REST/WebSocket endpoints                    |
| Backend domain plugin    | Backend       | `pixsim7/backend/main/domain_models/<feature>_models/manifest.py`   | New SQLModel domain types                       |
| Backend behavior plugin  | Backend/game  | Behavior registries (`behavior_registry`, scoring registries)  | NPC conditions, effects, metrics, scoring       |
| Backend middleware plugin| Backend       | `pixsim7/backend/main/infrastructure/middleware/*`                  | Request/response cross‑cutting concerns         |
| Backend event plugin     | Backend       | `pixsim7/backend/main/infrastructure/events/handlers.py`            | Reacting to domain/game events                  |
| Frontend UI plugin       | Frontend      | `apps/main/src/lib/plugins/*`, `plugins/`                      | User‑installable UI overlays/tools              |
| Graph node renderer      | Editor        | `apps/main/src/lib/graph/nodeRendererRegistry.ts` + components | Custom scene/quest node visuals                 |
| Game/world JSON extension| Game systems  | `GameSession.flags`, `GameSession.relationships`, world `meta` | Game rules, quest state, relationships, config  |

Later sections go into detail for each.

---

## 3. Backend Plugins

### 3.1 Route Plugins (HTTP & WebSocket)

**Purpose:** Add API endpoints (REST and WebSocket) without modifying `main.py`.

- **Manifests:** `pixsim7/backend/main/routes/<feature>/manifest.py`
- **Manifest type:** `PluginManifest(kind="route", ...)`
- **Discovery:** Auto‑loaded by the plugin manager during startup (see `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md`).

Typical responsibilities:

- New admin or gameplay APIs (e.g. game quests, inventory, logs).
- WebSocket endpoints for real‑time streams (e.g. generations, events).

**Use this when:**  
You need a new HTTP or WebSocket surface, not just an internal behavior change.

### 3.2 Domain Model Plugins

**Purpose:** Register domain models with the central domain registry without direct changes to `main.py`.

- **Manifests:** `pixsim7/backend/main/domain_models/<feature>_models/manifest.py`
- **Manifest type:** `DomainModelManifest`
- **Discovery:** Auto‑loaded via `init_domain_registry(...)`.

Constraints:

- Follow core design: **game systems should prefer JSON on existing models** (e.g. `GameSession.flags`, `GameSession.relationships`) over new tables/columns.
- Use domain model plugins for **platform‑level concepts**, not per‑world gameplay flags.

**Use this when:**  
You’re introducing a new top‑level platform concept (e.g. prompt versioning models), not just gameplay state.

### 3.3 Behavior / ECS / Metric Extensions

**Purpose:** Extend NPC behavior, ECS components, and scoring without hard‑coding logic.

Key registries and helpers (see Tasks 13, 16, 27, 28):

- `pixsim7/backend/main/infrastructure/plugins/behavior_registry.py`
- `pixsim7/backend/main/domain/behavior/conditions.py` – condition registry
- `pixsim7/backend/main/domain/behavior/scoring.py` – pluggable scoring factors
- `pixsim7/backend/main/domain/game/ecs.py` – ECS component schemas

**Use this when:**

- You’re adding new NPC conditions/effects.
- You’re adding new scoring factors or metrics.
- You want per‑plugin or per‑world behavior components, but still going through ECS + registries.

### 3.4 Middleware & Event Plugins

**Purpose:** Cross‑cutting behavior around HTTP requests or domain events.

- **Middleware:** `pixsim7/backend/main/infrastructure/middleware/*`
- **Events & handlers:** `pixsim7/backend/main/infrastructure/events/handlers.py`

Examples:

- Logging or auth enforcement across specific route groups.
- Emitting or reacting to game lifecycle events (session start/end, quest updates).

**Use this when:**  
You need to intercept or augment behavior across many requests/events, not just a single feature endpoint.

---

## 4. Frontend UI Plugins

### 4.1 Plugin Manager & Plugin API

**Purpose:** Allow safe, user‑installable UI extensions that cannot corrupt game state.

Core pieces (see `docs/PLUGIN_SYSTEM_ARCHITECTURE.md`):

- `apps/main/src/lib/plugins/PluginManager.ts` – lifecycle, sandbox, permissions.
- `apps/main/src/lib/plugins/types.ts` – manifest & API types.
- `apps/main/src/components/PluginManager.tsx` / `PluginOverlays.tsx` – UI surfaces.

Principles:

- **UI‑only:** Plugins cannot modify core game state directly.
- **Permission‑based:** Plugin manifests declare capabilities; PluginAPI enforces them.
- **Sandboxed:** Plugins operate via a limited API, receiving read‑only snapshots of game state.

**Use this when:**  
You want user‑installable overlays/tools (relationship dashboards, reminders, custom HUD panels) that run on top of the existing game UI.

### 4.2 Plugin State

UI plugin state should live in:

- **Client storage** (namespaced per plugin) for plugin preferences.
- **Read‑only game state snapshots** provided by PluginManager (session flags, relationships, world).

Plugins must **not**:

- Call backend APIs directly with arbitrary tokens.
- Mutate `GameSession.flags` / `relationships` themselves.

Backend‑facing behavior should be implemented via backend plugins + narrow APIs, not UI plugin shortcuts.

---

## 5. Graph / Node Renderer Plugins

### 5.1 Node Renderer Registry

**Purpose:** Allow custom visualizations for scene/quest nodes without changing the base graph component.

Core pieces (see `GRAPH_RENDERER_PLUGINS.md`):

- Registry: `apps/main/src/lib/graph/nodeRendererRegistry.ts`
- Built‑ins: `apps/main/src/lib/graph/builtinRenderers.ts`
- Node components: `apps/main/src/components/graph/*NodeRenderer.tsx`

Pattern:

- Register a renderer:
  - `nodeRendererRegistry.register({ nodeType, component, defaultSize?, customHeader? })`
- `SceneNode` uses the registry to fetch a renderer for each node type.

**Use this when:**  
You introduce a new node type (e.g. intimacy gate, relationship gate, NPC response) and want rich, custom visuals in the graph editor.

### 5.2 Relationship to Game/World State

Node renderers should:

- Read from the **scene graph model** and associated metadata.
- Reflect world/game state via role bindings and conventions from `GAMEPLAY_SYSTEMS.md`.

They should **not**:

- Introduce their own storage outside the scene graph and session JSON conventions.

---

## 6. Game & World JSON Extensions

### 6.1 Session State Conventions

Gameplay systems are designed to be **data‑driven**, storing state in JSON on existing models:

- `GameSession.flags` – quest/arc progress, inventory, events, plugin state.
- `GameSession.relationships` – NPC affinity/trust/chemistry/tension.
- Namespaced keys (e.g. `npc:${id}`, `arc:${id}`, `plugin:${id}`) to avoid clashes.

Examples (see `GAMEPLAY_SYSTEMS.md`):

- `flags.quests.main_story_01.status = "active"`
- `flags.inventory.items = [{ id: "flower", qty: 1 }]`
- `relationships["npc:12"].affinity = 72`

### 6.2 World & NPC Metadata

Per‑world configuration lives in:

- `GameWorld.meta` – relationship tiers, game style, simulation config, behavior profiles.
- `GameNPC.meta` – identity, clips, preferences.

Conventions:

- Extend via `meta`, `flags`, `relationships` instead of adding new columns.
- Keep schemas frontend‑driven (TypeScript types validate/interpret JSON).

**Use this when:**  
You want to add new gameplay concepts (quests, metrics, progression flags, plugin state) that are **world/session‑specific**, not platform‑wide.

---

## 7. Choosing the Right Extension Surface

Use this decision guide before adding new architecture:

1. **Need new API endpoints?**
   - Use a **backend route plugin** (`pixsim7/backend/main/routes/<feature>/manifest.py`).
2. **Need to expose a new platform‑level domain model?**
   - Use a **domain model plugin** (`domain_models/<feature>_models/manifest.py`).
3. **Need to change NPC behavior / scoring / metrics?**
   - Use **behavior/ECS/metric registries** (backend behavior plugins), with state stored in:
     - ECS components, and
     - Session/world JSON fields per `GAMEPLAY_SYSTEMS.md`.
4. **Need UI‑only overlays, dashboards, or tools?**
   - Use **frontend UI plugins** via PluginManager and PluginAPI.
5. **Need custom visuals in the scene/quest editor?**
   - Use the **node renderer registry** and custom renderer components.
6. **Need per‑world or per‑session gameplay flags/config?**
   - Use **JSON extensions** on `GameSession` / `GameWorld` / `GameNPC` (`meta`, `flags`, `relationships`).

If a proposed change doesn’t fit cleanly into one of the categories above, it may be a sign that:

- A new extension surface is needed (add it here and in `ARCHITECTURE.md`), or
- The feature should be expressed via existing JSON conventions rather than new infrastructure.

---

## 8. Related Documentation

- `ARCHITECTURE.md` – overall system architecture and services.
- `docs/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` – backend plugin auto‑discovery and manifests.
- `docs/PLUGIN_SYSTEM_ARCHITECTURE.md` – frontend UI plugin system design.
- `GRAPH_RENDERER_PLUGINS.md` – graph node renderer plugin architecture.
- `GAMEPLAY_SYSTEMS.md` – gameplay systems and JSON conventions for session/world state.
- `docs/APP_MAP.md` – app map, routes, and subsystem entrypoints.
- `claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md` – NPC behavior system, activity selection, and routine graphs.
- `claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md` – backend plugin capabilities roadmap.
- `claude-tasks/27-registry-unification-and-builtin-dogfooding.md` – registry dogfooding and ECS behaviors.
- `claude-tasks/28-extensible-scoring-and-simulation-config.md` – pluggable scoring and simulation config.

