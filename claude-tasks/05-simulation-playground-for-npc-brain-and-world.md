**Task: Simulation Playground for NPC Brain & World (Multi‑Phase)**

**Context**
- You have:
  - Game2D for world/scene playback.
  - `NpcBrainLab` for brain introspection.
  - World tools (relationship dashboard, quest log, inventory, world info, mood debug).
  - A robust plugin system.
- Designers need a focused place to “stress test” scenarios—time progression, flags, relationships, NPC moods, etc.—without disturbing real sessions.

Below are 10 phases for building and extending the Simulation Playground.

> **For agents:** Phases 1–5 are largely implemented. Use the checklist to mark refinements and work in phases 6–10.

### Phase Checklist

- [x] **Phase 1 – Basic Simulation Route & World/Session Selection**
- [x] **Phase 2 – Local Simulation State & Time Controls**
- [x] **Phase 3 – Integrate World Tools & Brain Tools**
- [x] **Phase 4 – Save/Load Simulation Scenarios (Frontend‑Only)**
- [x] **Phase 5 – Recording of Simulation Runs**
- [x] **Phase 6 – Multi‑World / Multi‑Session Comparison**
- [ ] **Phase 7 – Constraint‑Driven Simulation Runs**
- [ ] **Phase 8 – Plugin Hooks & Simulation‑Specific Events**
- [ ] **Phase 9 – Export / Import Simulation Runs & Scenarios**
- [ ] **Phase 10 – Automation & Regression Harness**

---

### Phase 1 – Basic Simulation Route & World/Session Selection

**Goal**  
Create a route that lets designers pick a world and session, without requiring complex simulation logic.

**Scope**
- New route: `/simulation`.
- Simple UI to select:
  - World from `listGameWorlds()`.
  - Existing session from `listGameSessions()` (or start blank).

**Key Steps**
1. Add `frontend/src/routes/SimulationPlayground.tsx`:
   - Layout:
     - World dropdown.
     - Session dropdown (or “Start new local simulation”).
     - Simulation view area.
2. Register route in `App.tsx` (behind `ProtectedRoute`).
3. Display selected world + session details and basic info.

---

### Phase 2 – Local Simulation State & Time Controls

**Goal**  
Introduce a local simulation state object and basic time advancement controls, separate from live backend state.

**Scope**
- Use a cloned representation of world time, flags, and relationships.
- Do not mutate live backend data unintentionally.

**Key Steps**
1. Define simulation state & helpers in `frontend/src/lib/simulation/*`:
   - World id/time.
   - Session snapshot (flags, relationships).
   - Selected NPCs, etc.
2. When user selects a world/session:
   - Initialize simulation state from:
     - `GameWorldDetail.world_time`.
     - `GameSessionDTO.flags` / `relationships`, or defaults.
3. Add controls:
   - Buttons: “+1 hour”, “+6 hours”, “+1 day”, etc. (using game‑core world time helpers).
4. Display current simulated time using `parseWorldTime`, `composeWorldTime`, `formatWorldTime`.

---

### Phase 3 – Integrate World Tools & Brain Tools into the Playground

**Goal**  
Use existing tools (world tools & brain tools) to visualize simulation state.

**Scope**
- Reuse `WorldToolsPanel` and `BrainToolsPanel`.
- Feed them a context derived from simulation state instead of live Game2D state.

**Key Steps**
1. Build simulation‑aware contexts (`WorldToolContext`, `BrainToolContext`) in `SimulationPlayground`:
   - Map simulation’s world/time/session + selected NPCs into those shapes.
2. Render:
   - `WorldToolsPanel` with simulation context.
   - `BrainToolsPanel` for a selected NPC.
3. Ensure rendering does not depend on a live backend session (can use simulated data).

---

### Phase 4 – Save/Load Simulation Scenarios (Frontend‑Only)

**Goal**  
Allow designers to save named scenarios and reload them later.

**Scope**
- Scenarios live purely on the frontend (localStorage).

**Key Steps**
1. Define `SimulationScenario` in `frontend/src/lib/simulation/scenarios.ts` with:
   - `id`, `name`, `worldId`, `initialWorldTime`, `initialSessionFlags`, `initialRelationships`, `npcIds`.
2. Implement scenario store:
   - `loadScenarios()`, `saveScenarios()`, `createScenario()`, `deleteScenario()`.
   - Persist to localStorage under a namespaced key.
3. In the playground UI:
   - Add “Save Scenario” (captures current simulation state + selected NPCs).
   - List saved scenarios and allow loading one to re‑initialize simulation state.

---

### Phase 5 – Recording of Simulation Runs

**Goal**  
Let designers record a sequence of state snapshots over time and inspect them.

**Scope**
- Recording is local and optional; no backend required.

**Key Steps**
1. Define history types in `frontend/src/lib/simulation/history.ts`:
   - `SimulationSnapshot` (time, flags, relationships, events).
   - `SimulationHistory` (sequence of snapshots).
2. Add controls:
   - Start/stop recording, or record on every tick.
3. Each time time advances, append a snapshot to history (when recording is active).
4. Add UI:
   - Timeline/slider (`TimelineScrubber`).
   - Scenario comparison (`ScenarioComparison`) for two runs or snapshots.

---

### Phase 6 – Multi‑World / Multi‑Session Comparison

**Goal**  
Allow designers to compare simulations across multiple worlds or sessions side‑by‑side.

**Scope**
- Extend the playground to load multiple scenarios/runs concurrently for comparison.

**Key Steps**
1. Enable selection of two (or more) scenarios/runs in the UI.
2. Extend comparison views to:
   - Align snapshots by world time or tick index.
   - Show relationship/flag deltas between runs.
3. Provide a layout that shows world summaries, NPC presence, and key metrics side‑by‑side.

---

### Phase 7 – Constraint‑Driven Simulation Runs

**Goal**  
Allow designers to run the simulation forward automatically until a condition is met (e.g. “advance until NPC X arrives”, “until quest stage Y”).

**Scope**
- Add simple “run until” constraints and a loop over ticks.

**Key Steps**
1. Define a small constraint description (e.g. “flag path reaches value”, “world time >= X”, “NPC present at location Y”).
2. Implement a loop that:
   - Advances time in steps.
   - Evaluates the constraint after each step.
   - Stops when condition is met or bounds are exceeded.
3. Add UI to configure constraints and start a constraint‑driven run.

---

### Phase 8 – Plugin Hooks & Simulation‑Specific Events

**Goal**  
Expose simulation events to plugins so they can react (logging, synthetic events, etc.) without affecting live sessions.

**Scope**
- Extend simulation hooks/registry; do not change game‑runtime semantics.

**Key Steps**
1. Extend `simulationHooksRegistry` with well‑typed events (before tick, after tick, scenario loaded, etc.).
2. Allow world plugins or dev plugins to register simulation hooks (separate from runtime hooks).
3. Expose simulation events in the App Map / dev panels for debugging.

---

### Phase 9 – Export / Import Simulation Runs & Scenarios

**Goal**  
Let designers export scenarios and runs to JSON for sharing, and import them on other machines.

**Scope**
- Use simple JSON structures; no backend changes required for v1.

**Key Steps**
1. Add export/import helpers for:
   - Scenarios (`SimulationScenario`).
   - Histories (`SimulationHistory`).
2. Add UI:
   - “Export Scenario/Run” buttons (download JSON).
   - “Import Scenario/Run” inputs with validation.
3. Handle collisions (e.g. id conflicts) by renaming or generating new IDs.

---

### Phase 10 – Automation & Regression Harness

**Goal**  
Integrate the Simulation Playground with automated tests/regression checks (e.g. CLI or headless mode).

**Scope**
- Provide a programmatic way to run simulations and assert on outcomes.

**Key Steps**
1. Expose a small programmatic API (or CLI) that can:
   - Load a scenario.
   - Run N ticks or until a constraint.
   - Return a summary (flags, relationships, world time).
2. Add example regression scripts that run key scenarios and assert expected changes.
3. Optionally integrate with CI, using snapshots of simulation runs as fixtures.

