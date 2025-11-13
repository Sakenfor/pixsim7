# Node Engine Design (World + NPCs)

Purpose: introduce a node-based runtime to drive world simulation and NPC behavior that is shareable, deterministic, and optionally turn-based or realtime. This builds on `pixsim7_game_service` and complements the existing scene graph/editor work.

Important constraint: there is a **single node/graph system** for PixSim7. Scene graphs and simulation/behavior graphs both use the same canonical schema and graph kernel; they differ only in which node types are actually used and which handlers interpret their effects. There is no separate, duplicated “second” node system.

---
## Fit With Current Backend

- Service boundary: Lives entirely in `pixsim7_game_service` alongside the existing tick-based sim (see `docs/GAME_BACKEND_SIM_SPEC.md`).
- Data reuse: Uses existing concepts (World, Locations, NPCs, Events). Nodes encapsulate decisions, conditions, and effects instead of hard-coded planners only.
- Editor synergy: Leverages the ongoing node editor work (React Flow) to author graphs. Authoring outputs JSON that the backend executes.
- Determinism: Uses seeded RNG as already specified; node decisions consume RNG through the same context to keep runs reproducible.

---
## Graph Model

Graphs are JSON-defined, versioned, and validated structures that the runtime executes per tick. Multiple graph types exist and can compose:

- World Graph: global orchestration (daily/weekly cycles, festivals, economy modifiers).
- Location Graph(s): open hours, capacity rules, pricing modifiers, local events.
- NPC Behavior Graph(s): per role/persona (worker, student, shopkeeper) with parameterization.
- Event Graph(s): trigger-driven chains with conditions/effects.
- Scene Graph: narrative/video flow (already in progress) – can be invoked by nodes.

### Node Types (initial set)

- Decision: choose one outgoing edge by evaluating child conditions/weights (utility-friendly).
- Condition: boolean evaluation over state (time, needs, flags, relationships).
- Action: apply effects to world/NPC state (needs deltas, move to location, transact money).
- Timer/Wait: delay or hold activity for N ticks; schedule follow-ups.
- Random/Weighted: stochastic branching with deterministic RNG.
- Event: materialize an EventInstance (loggable, subscribable via WS).
- Subgraph/Call: invoke another graph with arguments; returns control to caller.

Edges can carry metadata: priority, guard conditions, cool-downs. Nodes and edges support tags for filtering and editor UX.

### Execution Model

- Pull-per-tick: At each tick, the engine advances world time and invokes relevant graph entry points:
  - World graph root
  - Active NPC graphs (one step or continue current activity until duration ends)
  - Location graphs for open/close transitions
- Deterministic RNG: `WorldRNG(seed)` with `split(seed, npc_id)` for per-NPC streams.
- Conflict resolution: capacity checks at locations; queue or reroute via Decision nodes.

---
## Runtime Modes

- Turn-Based: `POST /sim/tick?count=N` advances N ticks atomically; returns changes and events.
- Realtime: background loop (scalable via factor) with pause/resume; emits WS events for UI.
- Unification: both modes use the same `SimEngine + NodeRuntime` under the hood.

---
## Data Model & Storage

Represented as compact, shareable JSON with strict schemas (pydantic models). Suggested layout:

```
worlds/
  <world_id>/
    manifest.json           # name, version, engineVersion, dependencies
    graphs/
      world.graph.json
      behaviors.worker.graph.json
      behaviors.student.graph.json
      locations.cafe.graph.json
      events.festival.graph.json
    presets/
      traits.json
      activities.json
      prices.json
    assets.map.json         # references into Content Service by asset_id
```

Versioning and sharing:
- `engineVersion` for runtime compatibility; `schemaVersion` per file.
- Content-addressed optional: compute SHA of graph JSON for caching.
- Import/export endpoints to share worlds as a zip bundle.

---
## API Surface (MVP)

- Worlds
  - `POST /worlds/import` (zip) → `{ worldId }`
  - `GET /worlds/{id}` → manifest + status
  - `GET /worlds/{id}/export` → zip
- Graphs
  - `GET /worlds/{id}/graphs` → list
  - `PUT /worlds/{id}/graphs/{name}` → upsert JSON (validation + version bump)
  - `POST /worlds/{id}/validate` → issues, unreachable nodes, schema errors
- Simulation
  - `POST /worlds/{id}/sim/tick?count=N` → `{ tick, changes, events }`
  - `POST /worlds/{id}/sim/auto/start|stop|status`
  - `GET  /worlds/{id}/events/recent?sinceTick`
- Sessions/Players (optional)
  - `POST /sessions` with `{ worldId, mode: 'turn'|'realtime' }`
  - `GET  /sessions/{id}` current snapshot
  - WS `/sessions/{id}/ws` stream changes

---
## Authoring & Editor Integration

- Reuse the React Flow editor foundations documented in `docs/NODE_EDITOR_DEVELOPMENT.md`.
- Add a palette for World/NPC/Location/Event node types; expose JSON schema to the editor for form generation.
- Implement import/export in the editor to round-trip with backend bundles.
- Validation in-editor mirrors backend validation rules (shared types package if possible).

---
## Determinism & Testing

- Deterministic graph evaluation order (stable sort for equal priorities).
- All randomness from injected RNG streams.
- Snapshot/restore world including RNG state for reproducible bug reports.
- Tests:
  - Schema validation fixtures for graphs
  - Simulation property tests (needs bounds, location capacity)
  - Deterministic replay tests: same seed + same commands → same events

---
## Migration Plan (Phases)

1) Foundations
- Define JSON schemas for graphs and nodes; pydantic models.
- Implement `NodeRuntime` with core node types (Decision, Condition, Action, Timer, Random, Event, Subgraph).
- Wire into `SimEngine.step()`; add import/validation endpoints.

2) Behavior Graphs
- Author 2–3 persona graphs (worker, student, idle).
- Location graphs for Home/Work/Cafe (open hours, capacity).
- Move/eat/work/socialize via Action nodes; utility-like scoring via Decision nodes.

3) World Graph & Events
- Global cycles (weekday/weekend), festival event chain, economy modifiers.
- Event logs and WS streaming.

4) Authoring & Sharing
- Editor palettes + inspectors for node types.
- Bundle import/export end-to-end; versioning docs.

5) Modes & Scale
- Realtime loop controls; turn-based smoke tests.
- Performance pass (batch updates, cache condition evaluations).

---
## Minimal Node JSON Example

```json
{
  "schemaVersion": "1",
  "name": "behaviors.worker",
  "entry": "decide_next",
  "nodes": {
    "decide_next": { "type": "Decision", "strategy": "maxWeight", "edges": ["go_work","eat","sleep"] },
    "go_work":     { "type": "Condition", "when": {"weekday": true, "timeBetween": [540, 1020], "energyGt": 30}, "next": "do_work" },
    "eat":         { "type": "Condition", "when": {"hungerLt": 40}, "next": "do_eat" },
    "sleep":       { "type": "Action",    "effect": {"activity": "sleep", "duration": 420} },
    "do_work":     { "type": "Action",    "effect": {"moveTo": "workplace", "activity": "work", "duration": 480, "moneyDelta": "+wage"} },
    "do_eat":      { "type": "Action",    "effect": {"activity": "eat", "duration": 30, "moneyDelta": "-meal", "needs": {"hunger": +25}} }
  }
}
```

---
## Open Questions

- Pathfinding: still logical movement; physical pathfinding remains out-of-scope per spec.
- Graph hot-reload: development-only or guarded in production with version locks?
- Multi-world hosting: one engine per world vs. partitioned single engine.
