**Task: NPC Brain Derivations & Toolkits (Post–BrainState Cutover)**

> **For Agents (How to use this file)**
> - This task assumes the **data-driven `BrainState`** model is already wired through:
>   - Backend: `BrainEngine.compute_brain_state` → `pixsim7/backend/main/domain/brain/*`
>   - Shared types: `packages/shared/types/src/brain.ts` (`BrainState`, `DerivedMood`, helpers)
>   - Frontend: `PixSim7Core.getNpcBrainState`, `NpcBrainLab`, `SimulationPlayground`, brain tools.
> - The goal here is to **finish the migration away from legacy `NpcBrainState`**, and to expose
>   richer, coherent derived signals (logic, instincts, memories) through the same `BrainState` API.
> - Keep the derivations **data-driven and package-based** (via the stat/derivation engine),
>   not hardcoded per world or per UI.

---

## Context

Recent work has:

- Cut over most UI surfaces (NpcBrainLab, SimulationPlayground, BrainShape, brain tools) to the
  generic `BrainState` model (`stats` + `derived`).
- Updated the mock core and example components to **emit/consume `BrainState`**, not the legacy
  `NpcBrainState` shape.
- Left some “high-level” concepts as **derived placeholders** only:
  - `logic_strategies` (decision tendencies)
  - `instincts` (base drives/archetypes)
  - `memories` (recent episodic history)

The next step is to:

1. Express these concepts as **first-class derivations** in the backend stat system where it makes sense.
2. Solidify the **BrainState helper surface** so tools never need to know the raw `derived` keys.
3. Cleanly **retire legacy `NpcBrainState`** usages in engine/dev harness/tests, while keeping docs aligned.

This task focuses on *derivations and cleanup*, not new UI—Brain Lab already has the primary surfaces.

---

## Phase Checklist

- [ ] Phase 1 – Inventory & finalize BrainState API for tools
- [ ] Phase 2 – Backend derivations for logic strategies & instincts
- [ ] Phase 3 – Backend/engine integration for memories as a brain projection
- [ ] Phase 4 – Shared helpers & TS surface for new derived values
- [ ] Phase 5 – Legacy `NpcBrainState` retirement in game engine & dev harness
- [ ] Phase 6 – Docs/tasks reconciliation (incl. Task 14 and brain docs)

---

### Phase 1 – Inventory & finalize BrainState API for tools

**Goal**  
Define exactly what UIs/tools are allowed to assume about `BrainState` so future work doesn’t reach into ad-hoc `derived` keys.

**Scope**
- Read-only; no behavior changes yet.

**Key Steps**

1. **Audit current `BrainState` usage** in frontend:
   - `apps/main/src/routes/NpcBrainLab.tsx`
   - `apps/main/src/routes/SimulationPlayground.tsx`
   - `apps/main/src/components/shapes/BrainShape.tsx`
   - Brain tools under `apps/main/src/plugins/brainTools/*`
   - World tools that build or inspect brain-like structures, e.g. `npcBrainDebug`.
2. From that audit, define a **minimal, stable helper surface** in `packages/shared/types/src/brain.ts`:
   - Existing: `getMood`, `getConversationStyle`, `getAxisValue`, `hasStat`, `getDerived`, etc.
   - Proposed additions (naming TBD):
     - `getLogicStrategies(brain): string[]`
     - `getInstincts(brain): string[]`
     - `getMemories(brain): BrainMemory[]` (if we standardize a memory type)
3. Update brain tools to **prefer helpers** over direct `brain.derived[...]` access wherever possible.
4. Document the “BrainState contract for tools” in a short section in:
   - `docs/architecture/subsystems/npc-architecture.md` or a new `docs/BRAIN_STATE.md`.

Deliverable: A clear list of supported helpers + which derived keys they map to under the hood.

---

### Phase 2 – Backend derivations for logic strategies & instincts

**Goal**  
Move `logic_strategies` and `instincts` from “mock-only heuristics” into **data-driven derivations** that can run for real worlds.

**Scope**
- Backend stat/derivation layer and Python domain code.

**Key Steps**

1. **Design derivation inputs**:
   - Likely depend on:
     - `personality` stat axes (e.g., big-five or world-specific traits).
     - Possibly relationship/mood axes for more nuanced logic in the future.
2. **Add derivation definitions** to appropriate stat packages:
   - Example: in a `core.personality` stat package:
     - Derivation `logic_strategies_from_personality` → emits a small set of strategy tags.
     - Derivation `instincts_from_personality` → emits instinctive drives.
   - Implementation should be declarative via your existing derivation engine, not hand-coded if avoidable.
3. **Map derivation results into BrainState**:
   - In `BrainEngine`, ensure these derivation results populate `brain.derived['logic_strategies']` and `brain.derived['instincts']`.
4. **Keep world-specific tuning flexible**:
   - Make sure derivations can be enabled/disabled or overridden via `world.meta.brain_config` if needed.

Deliverable: Worlds with a personality package automatically get logic/instinct derived values visible to tools.

---

### Phase 3 – Memories as a brain projection

**Goal**  
Standardize how “recent NPC memories” appear in `BrainState` so the memories brain tool and BrainShape have a stable, world-agnostic source.

**Scope**
- Backend brain domain + game engine/session adapters.

**Key Steps**

1. **Define a canonical memory shape** (Python + TS):
   - Likely in `pixsim7/backend/main/domain/brain/types.py` and `packages/shared/types/src/brain.ts`:
     ```ts
     export interface BrainMemory {
       id: string;
       timestamp: string;
       summary: string;
       tags: string[];
       source?: 'scene' | 'event' | 'flag' | string;
     }
     ```
2. **Decide the source of memories**:
   - Probably from `GameSession.flags.npcs["npc:ID"].memories` in the short term (matching the old `NpcMemory` logic).
   - Future extension: merge in `NPCEmotionalState` or scene logs when available.
3. **Extend BrainEngine / a helper** to populate memories:
   - Either:
     - As a dedicated `brain.derived['memories'] = BrainMemory[]`, or
     - As a `stats['memories']` snapshot with aggregate axes plus `derived['memories']` for the list.
   - Make sure memory population is **optional** per world (config flag).
4. Update frontend tools to use helpers:
   - Implement `getMemories(brain)` helper in TS and switch `memoriesTool` and `BrainShapeExample` to it.

Deliverable: NPC Brain Lab memories panel and BrainShape’s memory face read a consistent `BrainMemory[]` from BrainState.

---

### Phase 4 – Shared helpers & TS surface for new derived values

**Goal**  
Expose the new derived signals (logic strategies, instincts, memories) via first-class helpers so UI code doesn’t depend on raw keys.

**Scope**
- TS shared types only.

**Key Steps**

1. In `packages/shared/types/src/brain.ts`, add:
   - `export interface BrainMemory { ... }` (if not already defined from Phase 3).
   - Helper functions:
     - `getLogicStrategies(brain: BrainState): string[]`
     - `getInstincts(brain: BrainState): string[]`
     - `getMemories(brain: BrainState): BrainMemory[]`
2. Update all callers in `apps/main` to use these helpers instead of `getDerived` directly where possible.
3. Keep `getDerived`/`hasDerived` for truly custom/experimental tools.

Deliverable: A stable helper API for common derived brain concepts, documented in-code and in a brief doc snippet.

---

### Phase 5 – Legacy NpcBrainState retirement in game engine & dev harness

**Goal**  
Remove or freeze remaining `NpcBrainState` usages now that BrainState is flowing everywhere else.

**Scope**
- `packages/game/engine` + dev harness/tests.

**Key Steps**

1. Identify remaining usages (as of this task):
   - `packages/game/engine/src/npcs/brain.ts` (`NpcBrainState`, `buildNpcBrainState`)
   - Tests and dev harness references under `packages/game/engine/src/__tests__` and `dev/harness.ts`.
   - Any lingering references in docs (`SOCIAL_METRICS.md`, `APP_MAP.md`, etc.).
2. Decide strategy:
   - Either **fully remove** `NpcBrainState` and `buildNpcBrainState`, replacing usages with BrainState,
   - Or move them into a clearly marked **legacy/preview module** that is no longer used by core flows.
3. Update tests/dev harness:
   - Rewrite tests to use `PixSim7Core.getNpcBrainState` and/or `BrainEngine.compute_brain_state`.
   - For any “quick preview” scenarios, use the same preview helper that Simulation Playground / tools use.
4. Update docs to point to BrainState:
   - Replace `buildNpcBrainState` references in `docs/APP_MAP.md`, `docs/SOCIAL_METRICS.md`, and the NPC architecture doc with BrainState equivalents.

Deliverable: No production or active test code depends on `NpcBrainState`; it is either removed or quarantined for reference only.

---

### Phase 6 – Docs/tasks reconciliation

**Goal**  
Make sure the new derivation work is visible and consistent across the existing brain/mood tasks and docs.

**Scope**
- Docs + task files only.

**Key Steps**

1. Revisit `claude-tasks/14-unified-mood-and-brain-integration.md`:
   - Add a short note that BrainState now also carries logic/instinct/memory projections via derivations.
   - Link to this task for the derivation details.
2. Update or add a section in:
   - `docs/architecture/subsystems/npc-architecture.md` for “BrainState derived signals”.
   - Any relevant design docs for Simulation Playground / Brain Lab.
3. If any intermediate design notes are superseded (e.g., suggesting client-only brain building), either:
   - Mark them as **deprecated**, or
   - Clarify when to use BrainEngine vs. preview helpers.

Deliverable: A consistent story in docs and task files about how NPC brain projections are computed and consumed post-BrainState migration.

---

## Appendix: Behavior Urgency Layer

### Overview

The behavior urgency system provides a derived summary of "what the NPC feels like doing" on top of BrainState. It's intentionally **descriptive** (what the NPC is inclined to do) rather than a hard behavior planner.

### API Surface

Tools should use the following helpers from `@pixsim7/shared.types`:

```typescript
// Get all behavior urgency scores (0-100 per behavior)
getBehaviorUrgency(brain: BrainState): DerivedBehaviorUrgency

// Get top N urges sorted by value (highest first)
getTopBehaviorUrges(brain: BrainState, n?: number): BehaviorUrge[]

// Check if brain has any behavior urgency data
hasBehaviorUrgency(brain: BrainState): boolean
```

**Never access `brain.derived['behavior_urgency']` directly** - always use the helpers.

### Available Behavior Keys

| Key | Description |
|-----|-------------|
| `rest` | Urgency to rest/sleep (0=rested, 100=exhausted) |
| `eat` | Urgency to eat (0=full, 100=starving) |
| `relax` | Urgency to de-stress (0=calm, 100=overwhelmed) |
| `socialize` | Urgency to socialize (0=connected, 100=lonely) |
| `explore` | Urgency to explore/seek novelty (0=stimulated, 100=bored) |
| `achieve` | Urgency to accomplish (0=fulfilled, 100=stagnating) |
| `mood_boost` | Urgency for emotional uplift (0=happy, 100=needs boost) |

### Backend Derivation

The backend derivation is defined in `pixsim7/backend/main/domain/stats/behavior_urgency_package.py`:

- **From Resources**: `rest_urgency = 100 - energy`, `eat_urgency = 100 - satiation`, `relax_urgency = stress`
- **From Drives**: Direct mapping of social, novelty, achievement drives to urgency scores

### Frontend Tools

- **Behavior Brain Tool** (`apps/main/src/plugins/brainTools/behavior.tsx`): Shows ranked behavior urges with bar charts and plain-language summary
- **SimulationPlayground**: Shows "Current Behavior" indicator near Brain Inspector when behavior data is available
- **Mock Core**: Generates plausible behavior_urgency based on mood/relationships/personality for demo purposes

