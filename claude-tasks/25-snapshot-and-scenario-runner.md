**Task: Snapshot & Scenario Runner (Headless QA Harness)**

> **For Agents (How to use this file)**
> - This task defines a **headless test harness** for worlds/sessions:
>   - Capture snapshots of world + session state.  
>   - Replay scripted sequences of ticks and interactions.  
>   - Assert invariants about ECS components, metrics, interactions, and narrative.
> - Use it to:
>   - Regression-test complex refactors (ECS, narrative, scheduler).  
>   - Validate authored arcs and scenarios without a UI.  
>   - Provide designers with “scenario tests” for sensitive content (intimacy, stealth, high-stakes arcs).
> - Read these first:
>   - `claude-tasks/19-npc-ecs-relationship-components-and-plugin-metrics.md`  
>   - `claude-tasks/20-narrative-runtime-and-action-block-unification.md`  
>   - `claude-tasks/21-world-time-and-simulation-scheduler-unification.md`  
>   - `claude-tasks/22-game-mode-and-viewstate-model.md`  
>   - `claude-tasks/23-world-gameprofile-and-simulation-modes.md`.

---

## Context

You now have:

- ECS-based NPC/session state and metric registry.  
- Behavior system for activities and routines.  
- Interaction layer with chains, suggestions, and execution.  
- Plans for narrative runtime and scheduler.

What’s missing is a **systematic way to test**:

- “If we run this world for N ticks and perform these interactions, do we end up with the expected ECS state and narrative outcomes?”  
- “Do certain combinations (intimacy + stealth + romance) ever violate content rules or arc constraints?”  
- “Did this refactor accidentally break arc X’s progression?”

**Goal:** Introduce a snapshot + scenario runner that can:

- Serialize a world + session snapshot (including ECS components).  
- Replay a scripted sequence (ticks, interactions, narrative steps) headless.  
- Evaluate assertions about resulting state, and report failures.

---

## Phase Checklist

- [ ] **Phase 25.1 – Snapshot Format & Capture/Restore APIs**
- [ ] **Phase 25.2 – Scenario Script Model**
- [ ] **Phase 25.3 – Headless Runner & Execution Engine**
- [ ] **Phase 25.4 – Assertion & Reporting Framework**
- [ ] **Phase 25.5 – Example Scenarios & CI Hook**

---

## Phase 25.1 – Snapshot Format & Capture/Restore APIs

**Goal**  
Define what a “snapshot” is and implement helpers to capture and restore it.

**Scope**

- World + session + ECS state, minimal but sufficient.

**Key Steps**

1. Define `WorldSnapshot` (TS + Pydantic) as a conceptual structure:

```ts
export interface WorldSnapshot {
  worldId: number;
  worldMeta: Record<string, unknown>;         // GameWorld.meta
  sessions: Array<{
    sessionId: number;
    flags: Record<string, unknown>;
    relationships: Record<string, unknown>;
  }>;
}
```

2. Backend helpers:
   - `capture_world_snapshot(world_id, session_ids?) -> WorldSnapshot`  
   - `restore_world_snapshot(snapshot: WorldSnapshot) -> void` (dev-only / test env).  
3. Implementation detail:
   - For now, snapshots can be:
     - JSON files in a test directory.  
     - Or ephemeral blobs in memory for CI.
4. Avoid overreach:
   - Do not attempt to snapshot full asset tables; focus on:
     - World meta.  
     - GameSession flags + relationships (which now contain ECS).

**Status:** ☐ Not started

---

## Phase 25.2 – Scenario Script Model

**Goal**  
Define a simple script DSL/model to describe “what happens” in a scenario.

**Scope**

- Just enough to express:
  - Ticks (advance world_time).  
  - Interactions.  
  - Narrative steps (if runtime is present).

**Key Steps**

1. Define a `ScenarioStep` type in TS (and mirror with Pydantic as needed):

```ts
export type ScenarioStep =
  | { kind: 'tick'; worldId: number; deltaSeconds: number }
  | { kind: 'interaction'; worldId: number; sessionId: number; npcId: number; interactionId: string }
  | { kind: 'narrativeStep'; worldId: number; sessionId: number; npcId: number; input?: any }
  | { kind: 'assert'; assertId: string }; // marker for assertion checkpoints

export interface ScenarioScript {
  id: string;
  snapshot: WorldSnapshot;
  steps: ScenarioStep[];
}
```

2. Allow scenarios to:
   - Start from an existing snapshot (captured from an editor or a known state).  
   - Or from a minimal “bootstrap” world+session config for synthetic tests.

**Status:** ☐ Not started

---

## Phase 25.3 – Headless Runner & Execution Engine

**Goal**  
Implement a headless runner that executes `ScenarioScript` against the backend.

**Scope**

- Backend only: a test harness module, e.g. `pixsim7_backend/scenarios/runner.py`.

**Key Steps**

1. Implement core runner:

```python
async def run_scenario(script: ScenarioScript) -> ScenarioResult:
    # 1. restore snapshot
    # 2. apply steps in order
    # 3. collect state at assertion checkpoints
```

2. For each `ScenarioStep`:
   - `tick`: call scheduler/behavior tick logic with deltaSeconds.  
   - `interaction`: call `/api/v1/game/interactions/execute` (or domain function) for the given NPC & session.  
   - `narrativeStep`: call narrative runtime step function (Task 20).  
   - `assert`: capture current state into `ScenarioResult` for later checks.
3. Runner should **not** rely on UI; it operates directly on domain services and DB state.

**Status:** ☐ Not started

---

## Phase 25.4 – Assertion & Reporting Framework

**Goal**  
Provide a way to define assertions and produce human-readable reports.

**Scope**

- Assertion definitions + result struct.

**Key Steps**

1. Define `ScenarioAssertion` and `ScenarioResult`:

```ts
export interface ScenarioAssertion {
  id: string;
  description: string;
  // A function or descriptor of expected state
  check: (state: WorldSnapshot) => boolean;
}

export interface ScenarioResult {
  scriptId: string;
  passed: boolean;
  failedAssertions: Array<{ id: string; description: string; details?: string }>;
}
```

2. Implement a few reusable assertion helpers:
   - `assertMetricBetween(npcId, metricId, min, max)`  
   - `assertFlagEquals(path, expected)`  
   - `assertArcStage(npcId, arcId, expectedStage)`  
   - `assertNoIntimateSceneWithoutConsent()` (for safety rails).
3. Runner wiring:
   - For each `assert` step, apply registered assertions against the current snapshot.  
   - Aggregate per-scenario results in a structured report.

**Status:** ☐ Not started

---

## Phase 25.5 – Example Scenarios & CI Hook

**Goal**  
Create a small set of high-value scenarios and (optionally) wire them into CI.

**Scope**

- 2–4 example scenarios touching different systems.

**Key Steps**

1. Example scenarios:
   - **VN slice**: rooftop romance intro → ensure affinity/romanceStage updated correctly, no invalid intimacy.  
   - **Stealth slice**: pickpocket attempts → ensure suspicion/relationship penalties behave.  
   - **Life-sim day**: one full day of behavior ticks → ensure NPC activities cover expected patterns.  
   - **Plugin integration**: plugin-defined metrics/components used and updated as expected.
2. Store scenario scripts (and snapshots) in a dedicated folder:
   - `scenarios/` or `tests/scenarios/`.
3. Add a simple CLI:

```bash
python -m pixsim7_backend.scenarios.run_all
```

4. Optional: add a CI step that runs the scenario runner and fails on assertion failures.

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task:

- You can capture a world+session snapshot and replay a scripted scenario headless.  
- Scenarios can express:
  - Ticks (time advancement).  
  - Interactions.  
  - Narrative steps (once runtime is implemented).  
- Assertions can be defined against ECS components, metrics, flags, and arc/quest stages.  
- At least a couple of scenarios exercise:
  - ECS + behavior + interactions.  
  - ECS + plugins (romance/stealth).  
  - ECS + narrative runtime (once ready).  
- The harness is suitable for:
  - Future regressions (run scenarios after refactors).  
  - Design QA (sensitive content and arc behavior).

