**Task: Simulation Playground for NPC Brain & World (Multi‑Phase)**

**Context**
- You have:
  - Game2D for world/scene playback.
  - `NpcBrainLab` for brain introspection.
  - World tools (relationship dashboard, quest log, inventory, world info, mood debug).
  - A robust plugin system.
- Designers need a focused place to “stress test” scenarios: time progression, flags, relationships, NPC moods, etc., without disturbing real sessions.

Below are 5 incremental phases for building a Simulation Playground.

---

### Phase 1 – Basic Simulation Route & World/Session Selection

**Goal**
Create a new route that lets designers pick a world and session, without any simulation logic yet.

**Scope**
- New route: `/simulation`.
- Simple UI to select:
  - World from `listGameWorlds()`.
  - An existing session from `listGameSessions()` (or start blank).

**Key Steps**
1. Add `frontend/src/routes/SimulationPlayground.tsx`:
   - Layout:
     - World dropdown.
     - Session dropdown (or “Start new local simulation”).
     - Placeholder area for future simulation view.
2. Register the route in `App.tsx` (behind `ProtectedRoute`).
3. For now, just display the selected world + session details and a stub message.

---

### Phase 2 – Local Simulation State & Time Controls

**Goal**
Introduce a local simulation state object (separate from real backend state) and basic time advancement controls.

**Scope**
- Use a cloned representation of world time, flags, and relationships; do not mutate live backend data.

**Key Steps**
1. Define a lightweight `SimulationState` type in a new module, e.g. `frontend/src/lib/simulation/state.ts`:
   ```ts
   interface SimulationState {
     worldId: number;
     worldTimeSeconds: number;
     sessionFlags: Record<string, unknown>;
     relationships: Record<string, any>;
   }
   ```
2. When user selects a world/session:
   - Initialize `SimulationState` from:
     - `GameWorldDetail.world_time` (for time).
     - `GameSessionDTO.flags` and `relationships` if a session is chosen, otherwise sensible defaults.
3. Add controls:
   - Buttons: “+1 hour”, “+6 hours”, “+1 day”.
   - These adjust `worldTimeSeconds` in the local `SimulationState`.
4. Display current simulated time using existing helpers (`parseWorldTime`, etc.).

---

### Phase 3 – Integrate World Tools & Brain Tools into the Playground

**Goal**
Use existing tools (world tools & brain tools) to visualize the simulation state.

**Scope**
- Reuse `WorldToolsPanel` and (once implemented) `BrainToolsPanel`.
- Feed them a context derived from `SimulationState` instead of real Game2D state.

**Key Steps**
1. Build a `SimulationWorldToolContext` adapter that:
   - Maps `SimulationState` + selected location/NPC to a `WorldToolContext` shape.
   - For now, you can reuse some of the logic from Game2D or stub parts out.
2. Render:
   - `WorldToolsPanel` using the adapted `WorldToolContext`.
   - A brain visualization area using `BrainToolsPanel` (if present) for a user‑selectable NPC ID.
3. Ensure this rendering does not depend on having a real `GameSessionDTO` from backend; it can use the simulated flags/relationships.

---

### Phase 4 – Save/Load Simulation Scenarios (Frontend‑Only)

**Goal**
Allow designers to save named scenarios and reload them later.

**Scope**
- Scenarios live purely in frontend storage (e.g. localStorage).

**Key Steps**
1. Define a `SimulationScenario` type:
   ```ts
   interface SimulationScenario {
     id: string;
     name: string;
     worldId: number;
     initialWorldTimeSeconds: number;
     initialFlags: Record<string, unknown>;
     initialRelationships: Record<string, any>;
     npcIds: number[];
   }
   ```
2. Implement a small scenario store:
   - `getScenarios()`, `saveScenario(scenario)`, `deleteScenario(id)`.
   - Persist to localStorage under a namespaced key.
3. In the playground UI:
   - Add a “Save Scenario” button that captures the current `SimulationState` + selected NPCs into a `SimulationScenario`.
   - Add a sidebar or dropdown listing scenarios.
   - Allow loading a scenario to re‑initialize `SimulationState`.

---

### Phase 5 – Optional Recording of Simulation Runs

**Goal**
Let designers record a sequence of state snapshots over time (e.g. when advancing time) and inspect them.

**Scope**
- Recording is local and optional; no backend integration.

**Key Steps**
1. Define types:
   ```ts
   interface SimulationRunSnapshot {
     tick: number;
     worldTimeSeconds: number;
     flags: Record<string, unknown>;
     relationships: Record<string, any>;
   }

   interface SimulationRun {
     id: string;
     scenarioId?: string;
     startedAt: number;
     snapshots: SimulationRunSnapshot[];
   }
   ```
2. Add a “Record” toggle + “Reset Recording” button in the playground:
   - When recording is on, each time the user advances time, append a snapshot to the current run.
3. Add a small “Run Viewer” panel:
   - List snapshots with tick/time.
   - Allow stepping through snapshots, updating the UI to show what the world/brain state looked like at that point (without actually changing the underlying `SimulationState`, unless explicitly requested).
4. Keep this feature dev‑only and simple; you can persist runs or keep them in memory only, depending on complexity budget.

