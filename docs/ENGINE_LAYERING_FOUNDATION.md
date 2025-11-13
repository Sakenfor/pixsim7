# Engine Layering Foundation

Status: Draft foundation for Claude continuation
Audience: Simulation & Scene authoring team
Objective: Provide a clear, minimal, deterministic, evolvable base for the node/graph driven gameplay engine, separating concerns while keeping single-source schema.

---
## 1. High-Level Goals
1. Deterministic execution of world, NPC, and scene decision graphs (same results for same seed + commands).
2. Separation of Concerns:
   - Scene & Asset Authoring (content backend)
   - Simulation & Gameplay (game service)
   - Shared Graph Kernel (language-neutral via JSON Schema)
3. Incremental Migration Path (single process → worker → dedicated service) without rewrites.
4. Minimal duplication: one canonical schema, generated validators/types.
5. Clear Handoff: concrete tasks Claude can continue.

---
## 2. Layer Model
```
┌────────────────────────────┐
│        Clients (UI)        │  React/TS (editor + player)
└─────────────┬──────────────┘
              │ WS/HTTP events
┌─────────────▼──────────────┐
│     Integration Layer      │  (Python game service)
│  Tick driver / sessions    │
│  Scene outcome ingestion   │
│  Snapshot + replay control │
└─────────────┬──────────────┘
              │ calls kernel
┌─────────────▼──────────────┐
│        Domain Layer         │  (Python)
│  Needs, economy, locations  │
│  Relationship & flags       │
│  Effect application         │
└─────────────┬──────────────┘
              │ pure eval
┌─────────────▼──────────────┐
│        Graph Kernel         │  (TS canonical schema; Python generated models)
│  IR, registry, executor     │
│  Condition & RNG abstraction│
└─────────────┬──────────────┘
              │ JSON bundles
┌─────────────▼──────────────┐
│    Content / Scene Service  │  (Existing backend: scenes/assets)
│ Authoring, validate, publish│
└─────────────────────────────┘
```

---
## 3. Canonical Schema Strategy
Source of Truth: `graph.schema.json` (single canonical schema for all node/graph usage in PixSim7; scene graphs and simulation graphs are different _uses_ of the same system, not separate systems.)
Generated Artifacts:
- TypeScript: Zod validators + types for editor + potential Node runtime.
- Python: Pydantic (or msgspec) models for validation in game service.
- Schema Version: `schemaVersion` string embedded; semantic versioning (major for breaking fields).

Version Policy:
- Minor: additive fields, new node types (backwards compatible).
- Patch: documentation/enum description changes only.
- Major: removed/renamed fields (require migration script before publish).

---
## 4. Node & Edge Core (Initial Set)
Node types (enum):
- Decision (choose next from candidate edges; weight or priority)
- Condition (single boolean gate → next)
- Action (declarative effects: needs, flags, move, money)
- Choice (multiple user-facing options; engine filters; client picks)
- Video (segment selection logic; engine chooses segment)
- Random (weighted branching using seeded RNG)
- Timer (duration hold; schedules next node at end)
- SceneCall (invoke published scene; await outcome)
- Subgraph (invoke another graph; returns control)

Edge metadata:
- id: string
- from / to: node ids
- weight | priority (number)
- conditions[] (list of predicates referencing state/flags)
- cooldownTicks (int, optional)
- tags[] (for analytics/editing hints)
- isDefault (boolean for default path semantics)

Effects (structured object examples):
```json
{ "needs": {"hunger": +15}, "money": "-mealPrice", "flagsAdd": ["met_cafe_owner"], "moveTo": "cafe" }
```

Conditions (examples DSL keys):
```json
{ "weekday": true, "timeBetween": [540, 1020], "hungerLt": 40, "hasFlag": "job_offer" }
```

---
## 5. Determinism & RNG
RNG Streams:
- WorldRNG(seed)
- NPC RNG via split(WorldRNG, npcId)
- Scene RNG via split(WorldRNG, sceneInstanceId)
All stochastic choices must consume a provided RNG object; never use global randomness.

Replay Contract:
Store: initial seed + ordered list of commands `{tickAdvance, choiceSelection, sceneOutcome}` → re-run → identical event list + final state hash.

State Hash:
Deterministic serialization of key state (world tick, npc states, flags, relationships) hashed (e.g. SHA256). Compare at end of replay.

---
## 6. Execution Lifecycle (Per Tick)
1. Integration Layer calls `engine.step(tickCount=1)`.
2. Kernel evaluates each active NPC behavior graph (pure) → returns effect descriptors + instructions.
3. Domain Layer validates and batches effects, resolves conflicts (location capacity), computes final changes.
4. Apply changes to in-memory world state.
5. Handle SceneCall instructions: emit PlayScene event; if pending outcome, node remains blocked.
6. Persist event log (batched) and optionally snapshot (every N ticks).
7. Emit WS payload with `{ tick, changedEntities, events, sceneSteps }`.

---
## 7. Data & Persistence
In-Memory Objects:
- WorldState (clock, global modifiers)
- NPCState dict
- LocationState dict
- ActiveSceneInstances (awaiting outcomes)

Persistent Tables (later):
- world_snapshots
- npc_state_log (optional summarization)
- events_log
- scene_sessions

Snapshots contain RNG state + world tick + compressed NPC state.

---
## 8. Validation Layers
1. Schema Validation (JSON Schema): structural compliance.
2. Semantic Validation:
   - Reachability (all nodes reachable from entry) except flagged optional.
   - No cycles in non-permitted node types (allow intentional loops via Timer/Random with safety limit).
   - Edge target existence, unique ids.
   - Node-specific required fields (Video must have segment selection strategy).
3. Runtime Guards:
   - Effects cannot push needs outside 0..100.
   - Money cannot fall below zero unless debt feature enabled.
   - Cooldown constraints enforced.

---
## 9. Initial Directory Layout (Proposed)
```
packages/
  types/
    graph/
      schema/graph.schema.json
      src/index.ts            # generated types + zod
      README.md               # usage + generation
pixsim7_game_service/
  domain/graph/
    models.py                 # generated from schema
    executor.py               # kernel step logic (pure)
    registry.py               # node handler registration
    rng.py                    # deterministic RNG wrappers
    conditions.py             # condition evaluation helpers
    effects.py                # effect merging/apply utilities
  services/sim/
    engine.py                 # Integration: tick driver
    world_state.py            # Domain object wrappers
    scene_bridge.py           # SceneCall adapter
  api/
    routes_sim.py             # /sim/tick, /sim/auto
    routes_scene_session.py   # scene outcome endpoints
  tests/
    test_replay.py
    test_validation.py
    test_basic_tick.py
docs/
  ENGINE_LAYERING_FOUNDATION.md
  NODE_ENGINE_DESIGN.md
```

---
## 10. Minimal Interfaces (Draft)
Python (Integration & Domain):
```python
class Engine:
    def __init__(self, world_state: WorldState, registry: NodeRegistry, rng: WorldRNG): ...
    def step(self, ticks: int = 1) -> list[Event]: ...

class NodeHandler(Protocol):
    def evaluate(self, node: GraphNode, ctx: EvalContext) -> EvalResult: ...  # no side effects

class EvalResult(BaseModel):
    effects: list[EffectDescriptor] = []
    instructions: list[Instruction] = []  # e.g. PlaySegment, AwaitChoice
    next_nodes: list[str] = []            # candidate node ids
```

TypeScript (Kernel):
```ts
export interface Graph {
  schemaVersion: string;
  name: string;
  entry: string;
  nodes: Record<string, GraphNode>;
}
export type GraphNode = DecisionNode | ActionNode | ChoiceNode | VideoNode | RandomNode | TimerNode | SceneCallNode | ConditionNode | SubgraphNode;
```

---
## 11. Initial Milestones
M0 (Foundation)
- Add `graph.schema.json` (minimum node set) + generation script stubs.
- Implement TS Zod definitions.
- Generate Python models (placeholder generator).
- Draft kernel executor (Decision + Action + Choice + Random) with pure logic.

M1 (Behavior Integration)
- NPC behavior graphs examples (worker, student).
- Python domain effects (needs, money, moveTo).
- Tick endpoint with dry-run mode.
- Basic replay test (24 ticks, 2 NPCs).

M2 (Scene Bridge)
- SceneCall node handler.
- WS events for PlayScene / AwaitChoice.
- Outcome endpoint to unblock node.
- 24h simulation scenario with a scene invocation.

M3 (Validation & Tooling)
- Semantic validator (reachability, cycles, required fields).
- CLI `graph-validate`.
- Property tests for invariants.

M4 (Snapshots & Replay)
- Snapshot/export world + RNG state.
- Replay harness verifying hash match.
- Analytics counters (activity distribution).

M5 (Performance & Optional Separation)
- Profiling instrumentation.
- Consider Node or Rust kernel spike if needed.

---
## 12. Handoff Checklist (For Claude)
1. Confirm or refine node type enumeration; extend schema with detailed properties.
2. Flesh out `graph.schema.json` (add effect/condition schemas formally).
3. Write TS generation script to produce validators & types.
4. Implement Python codegen (schema → Pydantic models).
5. Implement basic kernel executor + simple Decision logic + RNG wrapper.
6. Add tests: schema roundtrip, simple graph tick producing deterministic effects.
7. Extend documentation with examples and edge cases.

---
## 13. Open Design Questions
- How to represent complex chained effects? Proposed: ordered list of atomic operations.
- Cooldown & temporal constraints: stored on edges vs node instance state? (Edge + runtime tracking map).
- Handling large graphs: need pagination or lazy loading? (Future optimization).
- Subgraph return semantics: explicit terminal node vs returning first Action result? (Define in schema early.)

---
## 14. Non-Goals (For Foundation)
- Full economy balancing.
- Advanced planner (GOAP) integration.
- Multi-world sharding logic.
- Binary serialization optimizations.

---
## 15. Acceptance Criteria (Foundation Completion)
- `graph.schema.json` exists with minimal nodes + edges definitions.
- TS & Python model generation demonstrably working (example graph passes validation in both).
- Kernel executor processes a trivial graph deterministically (Decision → Action → Timer loop).
- Docs updated (`ENGINE_LAYERING_FOUNDATION.md` + `NODE_ENGINE_DESIGN.md`).
- Replay test passes with stable hash.

---
## 16. Next Immediate Action (Post-Handoff)
Claude should start with expanding the schema and writing generation scripts before any complex domain logic to lock the contract.

---
End of foundation document.
