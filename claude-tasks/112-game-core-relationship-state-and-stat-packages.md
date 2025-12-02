**Task: Game-Core Relationship State & Stat Packages (PixSim7Core Alignment)**

> **For Agents (How to use this file)**
> - This task focuses on aligning the game-core (`packages/game/engine`) relationship logic with the stat system and stat packages.
> - Goal: make game-core treat `"relationships"` as a stat package/state, not as a hard-coded JSON blob under `session.relationships`.
> - This complements Task 111 (removing `relationships` from DTO/API) and Task 109/110 (intimacy & behavior alignment).

---

## Context

Game-core currently assumes a legacy relationship shape, e.g. in:

- `packages/game/engine/src/core/PixSim7Core.ts`:
  - `getNpcRelationship()` and `updateNpcRelationship()` read/write `this.session.relationships[...]`.
  - Relationship tier/intimacy computation is mirrored from legacy backend logic.
- `packages/game/engine/src/relationships/*`:
  - Comments and helpers reference `GameSession.relationships["npc:X"]` as authoritative.

With the backend now stat-only for relationships (`GameSession.stats["relationships"]`), and the stat package system in place, game-core should:

- Read/write relationship state from `session.stats.relationships`.
- Treat relationship tiers/levels as **derived from stat definitions**, not hard-coded TypeScript thresholds.

---

## Goals

- Update game-core to:
  - Use `session.stats["relationships"]` as the primary relationship store for all logic.
  - Keep a minimal compatibility layer, if necessary, but do not rely on legacy shapes.
- Move relationship tier/intimacy computation in game-core toward a configurable/stat-informed model where possible (ideally using the same definitions as backend).
- Keep public game-core APIs (`PixSim7Core`, helpers) stable where feasible, while modernizing internals.

Out of scope:

- Fully replacing TS fallback relationship math with live backend calls (preview API) in all places—this task focuses on state shape and alignment, not network behavior.

---

## Phase Checklist

- [ ] **Phase 1 – Audit Game-Core Relationship State Usage**
- [ ] **Phase 2 – Introduce a Relationship State Adapter over `stats["relationships"]`**
- [ ] **Phase 3 – Refactor PixSim7Core to Use the Adapter**
- [ ] **Phase 4 – Align TS Relationship Computation with Stat Definitions**
- [ ] **Phase 5 – Update Docs and Examples for Game-Core Relationship State**

---

## Phase 1 – Audit Game-Core Relationship State Usage

**Goal:** Identify all the places where game-core assumes `session.relationships` and legacy relationship shapes.

**Steps:**

- Search in `packages/game/engine` for:
  - `session.relationships`
  - Comments referencing `GameSession.relationships["npc:X"]`.
- Expected files to review:
  - `src/core/PixSim7Core.ts`
  - `src/relationships/computation.ts`, `effects.ts`, `preview.ts`
  - `src/session/state.ts`
  - Any scenario/assertion helpers that inspect `session.relationships`.
- Record findings (file + function) in this task file as a checklist.

---

## Phase 2 – Introduce a Relationship State Adapter over `stats["relationships"]`

**Goal:** Provide a single place where game-core reads/writes relationship state, backed by `stats["relationships"]`.

**Steps:**

- Add a small adapter module, e.g. `packages/game/engine/src/relationships/stateAdapter.ts`:
  - Functions like:
    - `getNpcRelationshipState(session: GameSessionDTO, npcId: number) -> NpcRelationshipState`.
    - `applyRelationshipPatch(session: GameSessionDTO, npcId: number, patch: Partial<NpcRelationshipState>): GameSessionDTO`.
  - Internally:
    - Store raw values under `session.stats.relationships["npc:{id}"]`.
    - Provide a clearly defined shape for what `NpcRelationshipState` looks like (axes, flags, derived fields).
- Ensure adapter can gracefully handle missing `stats.relationships` entries (initialization defaults) without touching any legacy fields.

**Note:** This adapter becomes the only place game-core manipulates relationship state; all other modules call into it.

---

## Phase 3 – Refactor PixSim7Core to Use the Adapter

**Goal:** Ensure `PixSim7Core` uses the stat-based adapter for relationship state.

**Steps:**

- In `src/core/PixSim7Core.ts`:
  - Update `getNpcRelationship()` to call `getNpcRelationshipState(session, npcId)` from the adapter.
  - Update `updateNpcRelationship()` to use `applyRelationshipPatch` and then store the updated session back into `this.session`.
  - Remove direct indexing into `this.session.relationships[...]`.
- Update any other methods that assume `session.relationships` structure (e.g. in brain/state building) to go through the adapter.
- Ensure events emitted by `PixSim7Core` still carry the same `NpcRelationshipState` shape externally, even if the backing store changed.

---

## Phase 4 – Align TS Relationship Computation with Stat Definitions

**Goal:** Move TS-side relationship tier/intimacy computation to align with stat definitions or at least use the same IDs and semantics.

**Steps:**

- Review `src/relationships/computation.ts`:
  - Ensure the TS fallback computation uses the same tier and level IDs as the default relationship stat definition (`light_flirt`, `deep_flirt`, etc.).
  - Prefer reading `tierId`/`levelId` from `session.stats.relationships["npc:X"]` when present, only computing as a fallback.
- Optionally, add a small TypeScript view over relationship stat definitions (mirroring the Python `StatDefinition`) so tools or offline preview can use package metadata:
  - This can be as simple as a static mapping for the default relationships package in TS for now.
- Ensure that relationship preview helpers (e.g. `preview.ts`) are oriented around the generic stat preview API rather than the legacy relationship preview endpoints (which are now removed).

**Note:** Deep integration with the stat package registry (backend) can be a future task; this task just ensures TS computations don’t drift from stat semantics.

---

## Phase 5 – Update Docs and Examples for Game-Core Relationship State

**Goal:** Reflect the new stat-based relationship state model in game-core docs and examples.

**Steps:**

- Update game-core README / docs:
  - `packages/game/engine/README.md` and any relationship-related guides.
  - Replace references to `GameSession.relationships` with `GameSessionDTO.stats.relationships` and the adapter functions.
- Update examples:
  - Any example code that manually constructs `GameSessionDTO` with `relationships` should use `stats.relationships` instead.
  - Scenario assertion helpers (`src/scenarios/assertions.ts`) should read from `stats.relationships` via the adapter or directly.

---

## Validation

- After completing this task:
  - `PixSim7Core` and related game-core systems should function correctly when session data only has `stats.relationships`, with no `relationships` field.
  - Relationship tier/intimacy values used in game-core should match backend semantics (either via preview API or via stat-aligned TS computations).
  - No direct reads/writes to `session.relationships` should remain in game-core; all relationship state goes through the stat-based adapter.

