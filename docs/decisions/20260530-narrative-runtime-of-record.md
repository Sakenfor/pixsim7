# ADR: Narrative Runtime-of-Record (Backend `NarrativeRuntimeEngine`)

- **Date:** 2026-05-30
- **Status:** Accepted — `delete-loser` executed 2026-06-22 (see Resolution)
- **Authors:** sakenfor (via Claude)

---

## Context

The narrative runtime — which executes authored `NarrativeProgram` graphs
(dialogue / choice / action / branch / scene nodes with conditions and effects) —
exists as **two parallel implementations of the same conceptual contract**:

- **Backend (Python)** — `pixsim7/backend/main/services/narrative/runtime.py`:
  `NarrativeRuntimeEngine`, with `domain/narrative/{ecs_helpers,integration_helpers,
  legacy_shims,schema}.py`.
- **Frontend (TypeScript)** — `packages/game/engine/src/narrative/`:
  `NarrativeExecutor` + `nodeHandlers` + `conditionEvaluator` + `effectApplicator`,
  wrapped by `NarrativeController` (a `GameRuntimePlugin`).

Maintaining two executors of one contract is pure duplication — every node type,
condition operator, and effect must be implemented and kept in sync twice. This
ADR picks the single runtime-of-record. A caller audit (plan checkpoint
`audit-callers`, 2026-05-30) established the facts:

**The backend engine is live-wired.** It is reachable from a production route:

```
POST /api/v1/interactions/execute
  → execute_interaction_logic (interaction_execution.py:625)
      if outcome.narrative_program_id:
  → NpcInteractionTargetAdapter.launch_narrative_program (adapters/npc.py)
  → launch_narrative_program_from_interaction (integration_helpers.py)
  → NarrativeRuntimeEngine.start()  (services/narrative/runtime.py)
```

`narrative_program_id` is a real outcome field (`interactions.py:375`,
`narrativeProgramId` alias). The chain is unbroken; it is dormant only in that no
authored interaction content sets the field *yet*.

**The frontend engine is fully dormant.** Zero `apps/` usage: no screen
instantiates `NarrativeController`, it is never attached to a production
`GameRuntime` via `GameRuntimeConfig.plugins` (the app constructs the runtime with
no `plugins` array), and there is no production source of `NarrativeProgram`
data — `createProgramProvider` is in-memory and used only by tests. It is
exercised solely by three test files under
`packages/game/engine/src/narrative/__tests__/`.

**Both engines already persist on the canonical `GameObject` store.** Backend
`ecs_helpers.py` writes narrative state to
`session.flags.gameObjects.objects["npc:<id>"].components` via
`services.game.game_object_store` (and the TS side does the same after the
`npc-ecs-canonical` checkpoint). So "shares the canonical substrate" is **not** a
differentiator — both do.

Constraints / prior decisions:

- ADR `20251121` (extension architecture) and the `gameobject-runtime-refactor-v1`
  umbrella established the canonical `GameObject` store as the single state edge.
- There is **no dedicated narrative DB table** on either side; runtime state is
  ephemeral JSON on the session. So neither choice carries a data-migration
  burden.

Alternatives considered:

1. **Backend `NarrativeRuntimeEngine`** (chosen).
2. **Frontend `NarrativeExecutor`** — promote the dormant TS engine.
3. **Keep both** — defer the decision.

---

## Decision

The **backend Python `NarrativeRuntimeEngine`** is the single narrative
runtime-of-record. The dormant frontend TypeScript narrative engine
(`packages/game/engine/src/narrative/`) is the retired side.

What we are doing:

- Treating the backend engine + its `domain/narrative/` support modules as the
  canonical, supported narrative runtime, invoked through the existing
  `interactions/execute` → `launch_narrative_program` seam.
- Retiring the frontend `packages/game/engine/src/narrative/` tree
  (`executor`, `nodeHandlers`, `conditionEvaluator`, `effectApplicator`,
  `runtimeIntegration`, `participantResolver`, `sceneIntegration`, the generation
  bridge, and their tests). **Note:** this deletion is gated behind explicit
  owner sign-off and is *not* performed as part of accepting this ADR — see
  Consequences.

What we are explicitly **not** doing:

- Not building a frontend program-data source or wiring `NarrativeController` into
  any app — that would be the cost of the rejected alternative.
- Not introducing a dedicated narrative DB table; runtime state stays on the
  canonical `GameObject` store as today.

Invariant established: **narrative execution is server-authoritative.** Clients
render narrative output and submit input (choice/text) through the interaction
API; they do not run the program graph.

---

## Consequences

**Positive:**

- One implementation of the narrative contract. No dual node-handler /
  condition-grammar / effect-applicator maintenance.
- Runtime-of-record is the side already wired into the live play loop and already
  on the canonical substrate — the lowest-risk choice. "Going live" reduces to
  *authoring content that sets `narrativeProgramId`*, not building engine wiring.
- Server-authoritative narrative progression (anti-tamper; consistent with a
  future headless-simulation tick — `scenarios/runner.py` is currently a stub at
  lines 221/233 and can call the same engine when built out).

**Negative / Trade-offs:**

- No offline / no-DB-roundtrip narrative stepping. Each step is a server call.
  Acceptable for the current product surface; revisit if an offline creator/preview
  mode is needed.
- The retired TS tree includes recent canonical-alignment work
  (`npc-ecs-canonical`, `narrative-npc-gating-dispatch`). That work was correct
  given the pre-decision state; its deletion is the cost of resolving the
  duplication. The **general** runtime pieces it added —
  `gameObjectStore` npc-component accessors and `GameObjectEntity.getComponentData`
  — are *not* narrative-specific and **stay**.

**Risks:**

- Deleting a complete, tested subsystem is a one-way door. **Mitigation:** the
  deletion (`delete-loser` checkpoint) is held for explicit owner approval and
  executed as its own reviewed commit, separate from this decision; git history
  preserves the engine if it is ever revived.
- If a client-side narrative runtime is later required, **revive via a new ADR
  superseding this one** — do not silently re-fork.

**Migration strategy:**

- `migrate-consumers`: no live consumers to migrate — the live consumer
  (`interactions/execute`) already uses the backend engine. This checkpoint is a
  confirmation, not a code change.
- `delete-loser`: remove the frontend narrative tree + tests + the narrative
  re-exports from `packages/game/engine/src/narrative/index.ts`; confirm via grep
  that nothing in `apps/` or the engine's non-narrative code imports them. Gated on
  owner sign-off.

---

## Resolution (2026-06-22)

`delete-loser` executed, but **only after closing the two capability gaps** the
closer engine comparison flagged — so the deletion shelved no real capability:

1. **Capability port first** (commit `3c82bc73f`). The backend was made the
   capability superset before anything was removed:
   - Condition evaluator: `domain/narrative/programs.py` `ConditionExpression`
     rewritten from a left-to-right `&&`/`||` string-splitter into a
     recursive-descent parser — parentheses, `!`/NOT, AND-binds-tighter-than-OR
     precedence, BETWEEN, and nested dot-path resolution (`flags.hasMet`). Backs
     both prompt-program selectors and narrative branch/choice/edge conditions.
   - Effects: `services/narrative/runtime.py` `_apply_effects` now routes
     `StateEffects.arcs/quests/events` through the canonical `apply_flag_changes`
     fields and `components` through `set_npc_component`. Previously only
     relationship/flags/inventory were applied.

2. **Deletion.** Removed `packages/game/engine/src/narrative/`: `executor`,
   `runtimeIntegration`, `sceneIntegration`, `nodeHandlers`, `conditionEvaluator`,
   `effectApplicator`, `logging`, `participantResolver`, the `generation/` bridge
   subtree, the barrel `index.ts`, and the three narrative `__tests__/` files.

3. **Deliberately kept: `ecsHelpers.ts`.** The original audit deletion set listed
   it, but verification showed it is **not** part of the executor — it is the
   shared narrative-ECS *state accessor* (`get/set/clearNarrativeState`,
   `startProgram`, …), is re-exported from the engine root
   (`packages/game/engine/src/index.ts`), depends only on `shared.types` +
   `runtime/gameObjectStore`, and is exercised by the canonical-store regression
   suite. It mirrors the backend canonical narrative component and stays as the
   shared session-state contract. The retired `effectApplicator` block was trimmed
   from `runtime/__tests__/npcComponentsCanonical.test.ts`.

Verification: full engine vitest suite green (16 files / 177 tests); engine
typecheck clean of narrative references (one pre-existing unrelated `NpcSummary`
error in `shared/types` only).

---

## Related Code / Docs

- Code (runtime-of-record):
  - `pixsim7/backend/main/services/narrative/runtime.py`
  - `pixsim7/backend/main/domain/narrative/ecs_helpers.py`
  - `pixsim7/backend/main/domain/narrative/integration_helpers.py`
  - `pixsim7/backend/main/domain/game/interactions/interaction_execution.py` (L623-635)
  - `pixsim7/backend/main/domain/game/interactions/adapters/npc.py`
- Code (retired side):
  - `packages/game/engine/src/narrative/` (executor, nodeHandlers, conditionEvaluator,
    effectApplicator, runtimeIntegration, participantResolver, sceneIntegration)
- Docs:
  - `docs/narrative/RUNTIME.md`
  - `docs/backend/narrative.md`
  - `docs/decisions/20251121-extension-architecture.md`
  - Plan `narrative-runtime-of-record-decision` (sub-plan of `gameobject-runtime-refactor-v1`)
