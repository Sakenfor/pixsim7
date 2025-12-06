**Task: Extension & Plugin Architecture Doc Unification**

> **Status Note (2025-12-02)**  
> Game session extensions now use `GameSession.flags` and `GameSession.stats` (including `stats["relationships"]`) as the canonical JSON surfaces. Earlier references in this task or related docs to `GameSession.relationships` reflect the pre-stats model and should be interpreted accordingly. See Tasks 107, 111, and 112 for details.

> **For Agents (How to use this file)**
> - This is a **cross-cutting architecture task** to unify how all extension systems are documented (backend plugins, frontend plugins, graph/node plugins, game/world JSON conventions).
> - It does **not** replace the detailed system docs; instead it:
>   - Creates a single **extension overview doc** that links to them.
>   - Aligns terminology and “where to put what” guidance.
> - Read these first for canonical behavior and data shapes:
>   - `ARCHITECTURE.md` – overall system architecture and services
>   - `docs/APP_MAP.md` – app map and frontend/backend boundaries
>   - `GAMEPLAY_SYSTEMS.md` – game session flags/relationships, world/NPC conventions
>   - `docs/archive/architecture/docs/archive/architecture/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md` – backend route/domain plugin system
>   - `docs/PLUGIN_SYSTEM_ARCHITECTURE.md` – frontend UI plugin system
>   - `GRAPH_RENDERER_PLUGINS.md` – graph node renderer plugin architecture

---

## Context

PixSim7 now has multiple, mature extension mechanisms:

- **Backend plugins**
  - Route plugins: `pixsim7/backend/main/routes/*` + `PluginManifest(kind="route", ...)`
  - Domain model plugins: `pixsim7/backend/main/domain_models/*` + `DomainModelManifest`
  - Behavior / ECS / metric extensions via behavior registries (see Tasks 13, 16, 27, 28)
- **Frontend plugins**
  - UI plugins: `apps/main/src/lib/plugins/*` + `PluginManager`, `PluginAPI`, overlays
  - Plugin management UI: `PluginManager.tsx`, `PluginOverlays.tsx`
- **Graph / scene editor plugins**
  - Node renderer registry: `apps/main/src/lib/graph/nodeRendererRegistry.ts`
  - Custom node renderers and template systems (scene/quest graphs)
- **Game/world JSON extensions**
  - `GameSession.flags`, `GameSession.relationships` as canonical extension surfaces
  - World/NPC `meta`, `flags`, `relationships` conventions (per `GAMEPLAY_SYSTEMS.md`)

Each subsystem has good local docs, but there is **no single map** that:

- Explains which extension mechanism to use for which problem.
- Shows how backend, frontend, and game/session extensions fit together.
- Clarifies where plugin / extension state should live (DB vs JSON vs local storage).

This task creates a **unified extension & plugin architecture doc** and wires all other docs to it.

---

## Phase Checklist

- [ ] **Phase 29.1 – Inventory Extension Points & Docs**
- [ ] **Phase 29.2 – Draft Unified Extension Map & Terminology**
- [ ] **Phase 29.3 – Implement `EXTENSION_ARCHITECTURE.md`**
- [ ] **Phase 29.4 – Cross-link Tasks & System Docs to the Extension Overview**

---

## Phase 29.1 – Inventory Extension Points & Docs

**Goal**  
Gather a complete list of extension mechanisms (code + docs) and their intended scope.

**Scope**

- Backend:
  - `pixsim7/backend/main/infrastructure/plugins/*`
  - `pixsim7/backend/main/domain_models/*`
  - `pixsim7/backend/main/routes/*`
  - Behavior/metric registries and plugin hooks from Tasks 13, 16, 27, 28
- Frontend:
  - `apps/main/src/lib/plugins/*` and related UI components
  - `apps/main/src/lib/graph/*` node renderer registry and built-in renderers
- Game/world:
  - `pixsim7/backend/main/domain/narrative/*`, `pixsim7/backend/main/domain/game/*` (session/world)
  - `GAMEPLAY_SYSTEMS.md`, `docs/RELATIONSHIPS_AND_ARCS.md`

**Key Steps**

1. Build a table with columns:
   - Extension type (e.g. backend route plugin, UI plugin, node renderer, behavior extension).
   - Scope (backend, frontend, game/world, editor).
   - Entrypoint (module / manifest / registry).
   - Intended responsibilities.
   - Where state is stored (DB model vs JSON vs client).
2. Append the table to this file (for agent reference) and use it as the backbone for Phase 29.2.

**Status:** `[ ]` Not started

---

## Phase 29.2 – Draft Unified Extension Map & Terminology

**Goal**  
Define a single, clear vocabulary and decision tree for choosing extension mechanisms.

**Key Steps**

1. Introduce a small set of canonical terms:
   - “Backend plugin” (route/domain/behavior/middleware), “UI plugin”, “editor/node plugin”, “game/world extension”.
2. Write a short **decision tree**:
   - “If you need new API surface → backend route plugin …”
   - “If you need UI overlays or HUD widgets → frontend UI plugin …”
   - “If you need custom graph node visuals or behaviors → node renderer / scene plugin …”
   - “If you need to store per-world or per-session state → JSON in `GameSession.flags` / `relationships` with conventions …”
3. Outline the structure of `docs/EXTENSION_ARCHITECTURE.md`:
   - Overview + diagram.
   - Extension types.
   - Data/state guidelines.
   - Security/sandboxing considerations.

**Status:** `[ ]` Not started

---

## Phase 29.3 – Implement `EXTENSION_ARCHITECTURE.md`

**Goal**  
Create the canonical extension & plugin architecture doc and link it into the main docs tree.

**Key Steps**

1. Add `docs/EXTENSION_ARCHITECTURE.md` with:
   - High-level overview and architecture diagram for extension flows.
   - One subsection per extension type (backend, frontend, graph/editor, game/world JSON).
   - A consolidated “Extension Points Table” (from Phase 29.1).
2. Add brief “Extension & Plugins” section to:
   - `ARCHITECTURE.md` (with a link to the new doc).
   - `GAMEPLAY_SYSTEMS.md` (for how game systems extend via JSON + plugins).
3. Ensure examples in `docs/archive/architecture/docs/archive/architecture/MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md`, `docs/PLUGIN_SYSTEM_ARCHITECTURE.md`, and `GRAPH_RENDERER_PLUGINS.md` are referenced and consistent with the new terminology.

**Status:** `[ ]` Not started

---

## Phase 29.4 – Cross-link Tasks & System Docs to the Extension Overview

**Goal**  
Make sure agents and contributors hit the unified extension doc before diving into subsystem-specific tasks.

**Key Steps**

1. Update “For Agents” sections of:
   - `16-backend-plugin-capabilities-and-sandboxing.md`
   - `27-registry-unification-and-builtin-dogfooding.md`
   - `28-extensible-scoring-and-simulation-config.md`
   - `13-safeguards-and-extensibility.md`
   to include: “See `docs/EXTENSION_ARCHITECTURE.md` for the overarching extension/plugin map.”
2. Add a small “Extensions & Plugins” entry to `docs/APP_MAP.md` that points to `EXTENSION_ARCHITECTURE.md`.
3. Optionally add a note in `claude-tasks/README.md` describing Task 29 as the coordination hub for extension/plugin docs.

**Status:** `[ ]` Not started
