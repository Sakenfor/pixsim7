**Task: NPC ECS Relationship Components & Plugin Metrics (Big Refactor)**

> **For Agents (How to use this file)**
> - This is a **large, multi-phase refactor** to move NPC relationship/session state to a component-based (ECS-like) model.
> - Only start this once Tasks 07–09 (metrics), 13 (behavior), 14 (unified mood), 16 (plugin capabilities), and 17 (interaction layer) are in a stable state.
> - Read these first for context and constraints:  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` – current relationship/session conventions  
>   - `docs/SOCIAL_METRICS.md` – social metrics & preview APIs  
>   - `docs/behavior_system/README.md` – NPC behavior system  
>   - `docs/INTERACTION_AUTHORING_GUIDE.md` – interaction & chains authoring  
>   - `claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md`  
>   - `claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md`  
>   - `claude-tasks/17-npc-interaction-layer-and-conversation-surfaces.md`.
> - **Key constraint:** do **not** add new DB tables or core columns; everything stays JSON-backed (`GameSession.flags`, `GameSession.stats["relationships"]`, `GameWorld.meta`, `GameNPC.meta`). ECS is a *data layout and access pattern*, not a schema migration.
> - **Status Note (2025-12-02)**: `GameSession.relationships` has been superseded by `GameSession.stats["relationships"]`. References in this task to `GameSession.relationships` reflect the earlier design and should be interpreted in terms of the stat-based relationship system (see Tasks 107, 111, 112).

---

## Context & Goals

Current model:

- `GameSession.relationships["npc:<id>"]` is a flat JSON object with fields like `affinity`, `trust`, `chemistry`, `tension`, `tierId`, etc.
- Plugins and game systems may add extra keys (e.g. `arousal`, `score`, plugin-specific `flags`), but there is no standard structure for:
  - Where plugin metrics live.
  - How to discover all metrics for an NPC.
  - How to type/validate new metrics.
- `GameSession.flags` carries a mix of:
  - Core state (`arcs`, `quests`, `events`, `npcs`).
  - Plugin state (stored either under `plugin:<id>:*` keys or ad-hoc nests).

Recent work (Tasks 13, 16, 17) adds:

- Behavior system (activities, routines, simulation tiers).
- NPC interaction layer (definitions, availability, execution).
- Plugin capability API (`PluginContext`, `SessionMutationsAPI`, `BehaviorExtensionAPI`).

All of this would benefit from a more structured, **component-based** view of NPC state:

- **Core components**: relationship core, romance state, stealth state, mood state, quest/arc participation.
- **Plugin components**: game-specific systems (e.g. `game-romance`, `game-stealth`) own their own component(s) per NPC.
- Systems refer to **components & metrics**, not arbitrary JSON keys.

**Goal:** Introduce an ECS-like **component model** for NPC relationship/session state that:

- Keeps DB schemas unchanged (purely JSON layout + accessor changes).
- Gives each “concern” (core, romance, stealth, plugins) a clear component namespace.
- Provides a typed registry of **metrics** across components.
- Preserves backward compatibility for existing code (via projections/adapters).

---

## High-Level Design

### Entities & Components

- **Entity**: NPC-in-session, identified by `(session_id, npc_id)` (and optionally world_id).
  - Primary JSON anchors:
    - `GameSession.relationships["npc:<id>"]`
    - `GameSession.flags.npcs["npc:<id>"]`
- **Components** (conceptual; all stored in JSON):
  - `RelationshipCore` – affinity, trust, chemistry, tension, tier, intimacy level.
  - `RomanceState` – romance stages, arousal, consent state, intimate flags.
  - `StealthState` – suspicion, last caught, reputation with guards, etc.
  - `MoodState` – unified mood projection (or ref to mood metrics).
  - `QuestParticipation` – quest progress flags relevant to this NPC.
  - `BehaviorState` – current activity, behavior tags, simulation tier.
  - `InteractionState` – interaction cooldowns, chain/step progress per NPC.
  - `PluginComponent:<id>` – arbitrary plugin-owned component(s).

### Storage Layout (JSON-only)

Two main options; we’ll adopt **Option B** for maximum future flexibility.

**Option A – Components inside `relationships`**  
```json
"relationships": {
  "npc:123": {
    "components": {
      "core": { "affinity": 72, "trust": 60, "tierId": "friend" },
      "romance": { "arousal": 0.4, "stage": "dating" },
      "stealth": { "suspicion": 0.2 }
    },
    "meta": { "lastInteractionAt": "..." }
  }
}
```

**Option B – Entities in `flags.npcs`, relationships as projection**  
```json
"flags": {
  "npcs": {
    "npc:123": {
      "components": {
        "core": { "affinity": 72, "trust": 60, "tierId": "friend" },
        "romance": { "arousal": 0.4, "consentLevel": 0.8, "stage": "dating" },
        "stealth": { "suspicion": 0.2 },
        "behavior": { "currentActivity": "work_shop", "simulationTier": "active" },
        "interactions": { "lastUsedAt": { "interaction:talk_basic": 1732000000 } },
        "plugin:game-romance": { "customStats": { "kissCount": 3 } }
      },
      "tags": ["shopkeeper", "romanceTarget"],
      "metadata": { "lastSeenAt": "game_world:market_square" }
    }
  }
},
"relationships": {
  "npc:123": {
    "affinity": 72,
    "trust": 60,
    "chemistry": 40,
    "tension": 10,
    "tierId": "friend",
    "intimacyLevelId": "light_flirt",
    "meta": {
      "last_modified_by": "relationship_core_projection"
    }
  }
}
```

**Chosen model:** Option B.

- **Authoritative per-NPC state** lives under `flags.npcs["npc:<id>"].components`.
- `relationships["npc:<id>"]` becomes a **projection** of core metrics for backward compatibility and metrics/preview APIs.

### Metric Registry (Cross-Component Metrics)

- World-level `meta.metrics` registry defines all known NPC relationship metrics, including plugin-owned ones:

```json
"meta": {
  "metrics": {
    "npcRelationship": {
      "affinity":  { "type": "float", "min": 0, "max": 100, "component": "core" },
      "trust":     { "type": "float", "min": 0, "max": 100, "component": "core" },
      "chemistry": { "type": "float", "min": 0, "max": 100, "component": "core" },
      "tension":   { "type": "float", "min": 0, "max": 100, "component": "core" },
      "arousal":   { "type": "float", "min": 0, "max": 1, "component": "romance", "source": "plugin:game-romance" },
      "suspicion": { "type": "float", "min": 0, "max": 1, "component": "stealth", "source": "plugin:game-stealth" },
      "friendshipLevel": {
        "type": "enum",
        "values": ["stranger", "acquaintance", "friend", "close_friend"],
        "component": "core",
        "source": "plugin:game-romance"
      }
    }
  }
}
```

- Backend helpers and metrics evaluators:
  - Resolve metrics by `(entity, metricId)` → `(componentName, path, type)` via registry.
  - Read/write values in `components[componentName]` (not arbitrary JSON).

### Plugin Components

- Plugins can register new component types via a capability (Phase 16.x extension), e.g.:

```python
ctx.behavior.register_component_schema(
    name="plugin:game-romance:romanceComponent",
    schema={ ... },  # JSON schema or Pydantic-like definition
    metrics={
        "npcRelationship.arousal": { "type": "float", "min": 0, "max": 1 },
        "npcRelationship.friendshipLevel": { "type": "enum", ... }
    }
)
```

- The component shows up under `components["plugin:game-romance"]` (or a more specific key), and the metric registry links metric IDs to that component.

---

## Phase Checklist

- [ ] **Phase 19.1 – ECS Data Model & JSON Layout Design**
- [ ] **Phase 19.2 – Backend ECS Access Layer (Entity/Component APIs)**
- [ ] **Phase 19.3 – Metric Registry Integration (Core + Plugin Metrics)**
- [ ] **Phase 19.4 – Migrate Core Systems to Components (Relationships, Mood, Behavior, Interactions)**
- [ ] **Phase 19.5 – Plugin Component API & Migration (game-romance, game-stealth, etc.)**
- [ ] **Phase 19.6 – Backward Compatibility & Projections**
- [ ] **Phase 19.7 – Tooling & Documentation**

---

## Phase 19.1 – ECS Data Model & JSON Layout Design

**Goal**  
Agree on the JSON layout for ECS-style NPC state (entities + components) and formalize it in TS/Pydantic types.

**Scope**

- No behavior changes yet; just data model and type definitions.

**Key Steps**

1. Define TS interfaces in `packages/types/src/game.ts` (or a new `ecs.ts`):
   - `NpcEntityState` with `components: Record<string, unknown>`, `tags`, `metadata`.
   - Component type aliases (e.g. `RelationshipCoreComponent`, `RomanceComponent`, `StealthComponent`).
2. Define Pydantic models in `pixsim7/backend/main/domain/game/schemas.py`:
   - `NpcEntityStateSchema`, `EcsComponentBase`, and core component schemas.
3. Decide on **component naming conventions**:
   - Core: `"core"`, `"romance"`, `"stealth"`, `"behavior"`, `"interactions"`.
   - Plugins: `"plugin:<plugin_id>"` or `"plugin:<plugin_id>:<componentName>"`.
4. Decide where entity state lives:
   - Adopt `flags.npcs["npc:<id>"].components` as canonical entity state.
5. Document this in a short “ECS Layout” section in `docs/RELATIONSHIPS_AND_ARCS.md` and/or a new ECS doc.

**Status:** ☐ Not started

---

## Phase 19.2 – Backend ECS Access Layer (Entity/Component APIs)

**Goal**  
Provide backend helpers to read/write NPC components instead of manual JSON fiddling.

**Scope**

- New helper module, e.g. `pixsim7/backend/main/domain/game/ecs.py`.

**Key Steps**

1. Implement `get_npc_entity(session: GameSession, npc_id: int) -> NpcEntityStateSchema`:
   - Reads from `session.flags.get("npcs", {}).get(f"npc:{npc_id}", {})`.
2. Implement `set_npc_component(session, npc_id, component_name, value)` and `update_npc_component`:
   - Merges component values.
   - Ensures `flags.npcs["npc:<id>"].components[component_name]` exists.
3. Implement `get_npc_component(session, npc_id, component_name, default=None)`.
4. Add lightweight logging and validation (optionally using Pydantic schemas for core components).
5. Introduce a thin service or static helpers used by:
   - Behavior system (Task 13).
   - Interaction availability/execution (Task 17).
   - Plugins (via PluginContext adapter in Phase 19.5).

**Status:** ☐ Not started

---

## Phase 19.3 – Metric Registry Integration (Core + Plugin Metrics)

**Goal**  
Introduce a **metric registry** that maps metric IDs to components and paths, and wire it into metrics/preview and ECS helpers.

**Scope**

- Extends `docs/SOCIAL_METRICS.md` and `pixsim7/backend/main/domain/metrics/*`.

**Key Steps**

1. Define a `MetricDefinition` model (TS + Pydantic):
   - `id`, `type`, `min`, `max`, `component`, `path?`, `source?`.
2. Add `GameWorld.meta.metrics` schema:
   - Validate at world save/update using Pydantic.
3. Implement metric helpers:
   - `get_npc_metric(session, npc_id, metric_id)` → use registry to:
     - Resolve `component` and optional `path`.
     - Read value from `components[componentName]`.
   - `set_npc_metric(session, npc_id, metric_id, value)` → same, with validation/clamping.
4. Update metric evaluators (e.g. mood/intimacy/relationship preview) to use `get_npc_metric` instead of direct field access where feasible.
5. Allow plugins to register metrics:
   - Either via a world-editing API or via a `MetricExtensionAPI` capability (Phase 19.5).

**Status:** ☐ Not started

---

## Phase 19.4 – Migrate Core Systems to Components

**Goal**  
Adapt the **core systems** to use the ECS component model and metric registry, while preserving current behavior.

**Scope**

- Relationship/mood metrics, behavior system, and interaction layer.

**Key Steps**

1. **Relationships & metrics**:
   - Move relationship metric logic to read/write `components["core"]` via ECS helpers.
   - Keep `GameSession.relationships` updated via a projection step (see Phase 19.6).
2. **Unified mood system (Task 14)**:
   - Option: project unified mood into a `MoodState` component:
     - `components["mood"] = { general: ..., intimacy: ..., activeEmotion: ... }`.
   - Mood evaluators use ECS helpers.
3. **Behavior system (Task 13)**:
   - Replace direct JSON digs into `session.flags.npcs["npc"].state` with ECS calls:
     - Behavior gating uses `components["behavior"]`.
     - Simulation tier checks read from `behavior` component.
4. **Interaction layer (Task 17)**:
   - Availability context builder uses ECS helpers for:
     - Relationship snapshot from `core` + metrics.
     - Behavior/mood state from appropriate components.
     - Cooldowns from `interactions` component.
   - Execution pipeline writes to components where appropriate (e.g., interaction chains to `components["interactions"]`).

**Status:** ☐ Not started

---

## Phase 19.5 – Plugin Component API & Migration

**Goal**  
Allow plugins to define and manage their own components and metrics in a structured way, using `PluginContext`.

**Scope**

- Extend plugin capabilities and/or add `ComponentAPI` to `PluginContext`.

**Key Steps**

1. Add a `ComponentAPI` to `PluginContext`:
   - `get_component(session_id, npc_id, component_name)`
   - `set_component(session_id, npc_id, component_name, value)`
   - Under the hood, use ECS helpers and enforce:
     - Component names for plugins must be namespaced (e.g. `plugin:game-romance`).
2. Add a plugin capability to register component schemas + metrics:
   - E.g. `ctx.behavior.register_component_schema(...)` or a dedicated `MetricsAPI`.
3. Migrate `game-romance` and `game-stealth`:
   - Move ad-hoc fields (`arousal`, `suspicion`, romance flags) into their own components:
     - `components["plugin:game-romance"]`
     - `components["plugin:game-stealth"]`
   - Register metrics (`npcRelationship.arousal`, `npcRelationship.suspicion`) in world meta or via API.
4. Update any behavior/interaction logic that wants those metrics to use:
   - `get_npc_metric` (registry-driven) rather than direct JSON.

**Status:** ☐ Not started

---

## Phase 19.6 – Backward Compatibility & Projections

**Goal**  
Keep existing code that reads `GameSession.relationships` and some legacy flags working during and after migration.

**Scope**

- Transitional adapters/projection functions.

**Key Steps**

1. Implement projection helpers:
   - `project_components_to_relationships(session)`:
     - For each `npc:<id>`, compute `relationships[npcKey]` from `components["core"]` + any other canonical metrics.
   - Optionally, `hydrate_components_from_relationships` for old data.
2. Decide when projection runs:
   - On load from DB? (eager).  
   - On write/commit? (when components change).  
   - Or via on-demand helper for views that still expect `relationships`.
3. Identify legacy call sites:
   - Metric preview endpoints that read `session.relationships` directly.
   - Any code that mutates `session.relationships` instead of components.
4. Refactor those call sites to:
   - Use ECS helpers and metric registry where possible.
   - Use projection helpers as a stopgap where refactor would be too invasive.
5. Add tests to ensure:
   - Old and new paths agree on relationship values for a set of representative sessions.

**Status:** ☐ Not started

---

## Phase 19.7 – Tooling & Documentation

**Goal**  
Make the ECS model understandable and operable for designers, engineers, and plugins.

**Scope**

- Docs, debugging tools, and maybe simple visualizations.

**Key Steps**

1. Documentation:
   - Add an “ECS model” section to:
     - `docs/RELATIONSHIPS_AND_ARCS.md` (how components relate to arcs).  
     - `docs/behavior_system/README.md` (how behavior uses components).  
     - `docs/INTERACTION_AUTHORING_GUIDE.md` (how interactions tie into components/metrics).
   - Document component naming conventions and plugin namespaces.
2. Admin / debug views:
   - Provide a simple admin endpoint (or reuse `admin_plugins` UI) that:
     - Shows components for a given `(session_id, npc_id)`.
     - Shows all metrics/definitions for the world.
3. Editor support:
   - Long term: introspect metrics registry to offer metric pickers in behavior/interaction editors (e.g. gating based on `npcRelationship.arousal`).
4. Migration notes:
   - Add clear notes on how to:
     - Move custom systems from flat fields to components.
     - Register plugin metrics/components via the plugin APIs.

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task, you should have:

- **ECS-style NPC state**:
  - NPC-related state consistently stored in `flags.npcs["npc:<id>"].components`.
  - `GameSession.relationships` acting as a projection over components (for backward compatibility and metrics).
- **Metric registry**:
  - A world-level definition of all NPC relationship metrics (core + plugin).
  - Helpers to read/write metrics via ECS components instead of ad-hoc JSON paths.
- **Plugin-friendly components**:
  - Plugins can define and manage their own components and metrics in a structured, namespaced way.
  - Core systems can safely consume those metrics when desired.
- **Core systems migrated**:
  - Behavior, mood, interactions, and relationship metrics use ECS/metrics helpers rather than raw JSON.
- **Minimal schema impact**:
  - No new DB tables or core columns; all changes are within JSON fields and access patterns.
