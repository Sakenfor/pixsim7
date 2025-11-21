# ADR: Game Session JSON Conventions as Primary Extension Surface

- **Date:** 2025-11-21
- **Status:** Accepted
- **Authors:** Core PixSim7 team

---

## Context

PixSim7 implements a variety of gameplay systems:

- Relationships and social metrics (affinity, trust, chemistry, tension).
- Quests and objectives.
- Inventory and item metadata.
- NPC- and world-specific flags.

Early iterations were tempted to add dedicated tables/columns for each new system. This had drawbacks:

- Schema changes are **expensive** (migrations, versioning, compatibility).
- Hard to support many experimental or per-world features.
- Tight coupling between game design and the core database schema.

The design intent for game systems is:

- Keep **core models generic** (`GameWorld`, `GameLocation`, `GameHotspot`, `GameScene`, `GameSession`, `GameNPC`).
- Extend behavior via JSON fields:
  - `meta`
  - `flags`
  - `relationships`
- Let the frontend and shared types define and validate **schemas over JSON**, not add DB columns for each feature.

Docs like `GAMEPLAY_SYSTEMS.md` and the AGENTS guidelines already describe this, but we formalize it here as a core architectural decision.

---

## Decision

We standardize **JSON state on existing game models** as the primary extension surface for gameplay systems:

1. **Session-level state**
   - `GameSession.flags` – opaque JSON, used for:
     - Quest/arc progress (`flags.quests.*`)
     - Inventory (`flags.inventory.*`)
     - Session-wide plugin or system state (namespaced by `plugin:` or feature ID)
   - `GameSession.relationships` – JSON keyed by NPC (e.g. `relationships["npc:1"]`), storing:
     - Affinity, trust, chemistry, tension.
     - Relationship-specific flags.

2. **World and NPC metadata**
   - `GameWorld.meta` – world-level configuration, including:
     - Relationship tiers/scales.
     - Game style & simulation config.
     - Behavior profiles and scoring configuration.
   - `GameNPC.meta` – NPC identity, clips, preferences, and other per-NPC configuration.

3. **Conventions**
   - **No new core DB columns** for gameplay systems when it can be expressed via JSON:
     - Use `GameSession.flags` / `relationships` and `GameWorld.meta` instead.
   - Use **namespaced keys** to avoid collisions:
     - `npc:${id}`, `arc:${id}`, `quest:${id}`, `plugin:${id}`, etc.
   - Frontend/shared TypeScript types (`@pixsim7/shared.types`, game packages) define and validate the JSON shape.
   - Backend services and plugins operate over these JSON structures using helper APIs, not raw ad-hoc dict hacking where possible.

We treat these JSON conventions as the **canonical extension surface** for game systems. Platform-level concerns that truly cannot be expressed this way may still warrant new tables/columns, but that is the exception, not the norm.

---

## Consequences

**Positive**

- **Flexibility**
  - Worlds and plugins can introduce new gameplay concepts (quests, metrics, flags) without schema changes.
  - Easier experimentation across different game modes or simulation profiles.
- **Stability**
  - Core database schema changes are minimized.
  - Session/world data remains compatible across many iterations of gameplay features.
- **Alignment with extension architecture**
  - JSON extensions fit naturally alongside backend plugins, frontend plugins, and graph/editor extensions (see `docs/EXTENSION_ARCHITECTURE.md`).

**Negative / trade-offs**

- **Weaker static guarantees at DB level**
  - The database cannot enforce schemas for `flags`/`relationships`; validation must live in application code/types.
- **More responsibility on helpers and types**
  - Without consistent helpers, ad-hoc JSON mutations can creep in and become hard to maintain.
- **Migration semantics live at the JSON layer**
  - Evolving the shape of `flags`/`relationships` requires careful versioning and migration logic in services, not in SQL alone.

**Risks**

- Inconsistent key naming or shapes across features/worlds.
- Plugins or systems bypassing helpers and directly mutating JSON structures.

Mitigations:

- Shared helpers and registries (ECS components, metric registries, behavior helpers) that operate over these JSON fields in a structured way.
- Documented conventions in `GAMEPLAY_SYSTEMS.md` and AGENTS instructions.
- Tests and guardrails (e.g., tasks 27 and 28 for registry unification and extensible scoring).

---

## Related Code / Docs

- Code:
  - `pixsim7_backend/domain/narrative/relationships.py`
  - `pixsim7_backend/services/game/quest_service.py`
  - `pixsim7_backend/services/game/inventory_service.py`
  - `pixsim7_backend/domain/game/ecs.py`
  - Any helpers that read/write `GameSession.flags`/`relationships` and `GameWorld.meta`
- Docs:
  - `GAMEPLAY_SYSTEMS.md`
  - `docs/RELATIONSHIPS_AND_ARCS.md`
  - `ARCHITECTURE.md`
  - `docs/EXTENSION_ARCHITECTURE.md`
  - AGENTS guidelines for PixSim7 (game/world/scene editor work)
  - `claude-tasks/27-registry-unification-and-builtin-dogfooding.md`
  - `claude-tasks/28-extensible-scoring-and-simulation-config.md`

