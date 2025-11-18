**Task: Simulation Playground for NPC Brain & World**

**Context**
- You have Game2D (world/scene playback), `NpcBrainLab` (brain introspection), world tools, and a strong plugin system.
- Designers currently lack a dedicated space to **simulate** world/brain evolutions over time with quick iteration.

**Goal**
Create a **Simulation Playground** mode where designers can:
- Define initial scenarios (world time, session flags, relationships, NPC presence).
- Advance time / run “ticks” of the simulation.
- Observe changes via brain/world tools and Game2D-like views.

**High-Level Concept**
- A separate route, e.g. `/simulation`, that:
  - Lets designers pick or define:
    - World + initial time.
    - A base session (or start from blank).
    - A set of NPCs present and their initial relationships.
  - Provides controls:
    - Advance time N minutes/hours/days.
    - Run “one step” or “N steps” of whatever simulation logic exists (or stubbed for now).
  - Renders:
    - A compact world view (like a mini Game2D).
    - World tools (relationships, quest log, mood debug, world info).
    - Brain tools for selected NPCs.

**Implementation Outline**
1. **Simulation Route & Scaffold**
   - New route: `frontend/src/routes/SimulationPlayground.tsx`.
   - Start with:
     - Select world (GameWorld list).
     - Select or create a session (or local-only simulated session object).
     - Select NPCs to include.

2. **Scenario Model (Frontend-only)**
   - Define a simple `SimulationScenario` type in a new module:
     ```ts
     interface SimulationScenario {
       id: string;
       name: string;
       worldId: number;
       initialWorldTime: number;
       initialSessionFlags: Record<string, unknown>;
       initialRelationships: Record<string, any>;
       npcIds: number[];
     }
     ```
   - Support basic persistence to `localStorage` for now.

3. **Controls & Time Advancement**
   - In the playground UI:
     - Show current world time (using existing helpers `parseWorldTime`, etc.).
     - Buttons:
       - “+1 hour”, “+1 day”, “Run 10 ticks” (you can define a “tick” as a world time step).
     - For now, you can:
       - Advance `world_time` via `advanceGameWorldTime` API for real sessions, or
       - Mutate a local simulation state object if you don’t want to use backend here.

4. **Visualization Integration**
   - Embed:
     - `WorldToolsPanel` with context built from the simulated session/world state.
     - A brain panel area using `BrainToolsPanel` for selected NPC.
   - You do not need full Game2D playback; a stripped-down view is enough.

5. **Optional: Simulation Hooks**
   - If there is existing or planned simulation logic (e.g., daily NPC routines, relationship drift), call into it from the “tick” controls.
   - If not, stub out the hook (e.g., log that this is where simulation would run).

**Constraints**
- No backend schema changes; scenarios can be frontend-only (localStorage).
- Keep the first version as a “visualizer + time controls”; heavy simulation logic can come later.

**Success Criteria**
- Designers can define a simple scenario, advance time, and see changes in world/brain state via existing tools from a dedicated Simulation Playground route.
- The playground does not interfere with normal Game2D behavior or sessions.

---

## Phase 2: Scenario Libraries, Recording & Deeper Simulation Hooks

Once the Simulation Playground exists as a basic visualizer + time controls, the next step is to turn it into a more robust tool for design and balancing.

**Phase 2 Goals**
- Introduce **named scenario libraries** (global and per-world) with tags and notes.
- Allow **recording** of simulation runs (sequence of state snapshots) for later review or regression testing.
- Provide hooks into deeper simulation logic (relationship drift, scheduled events, etc.) when available.

**Key Ideas**
- Extend `SimulationScenario` with metadata:
  ```ts
  interface SimulationScenario {
    id: string;
    name: string;
    worldId: number;
    initialWorldTime: number;
    initialSessionFlags: Record<string, unknown>;
    initialRelationships: Record<string, any>;
    npcIds: number[];
    tags?: string[];
    notes?: string;
  }
  ```
- Store scenarios in a simple library, with filtering by world and tags.
- Add a concept of a **simulation run**:
  ```ts
  interface SimulationRunSnapshot {
    tick: number;
    worldTime: number;
    sessionFlags: Record<string, unknown>;
    relationships: Record<string, any>;
  }

  interface SimulationRun {
    id: string;
    scenarioId: string;
    startedAt: number;
    snapshots: SimulationRunSnapshot[];
  }
  ```
- Optionally, wire the “tick” into future simulation functions (e.g. `runSimulationStep(state)` from a game-core module).

**Phase 2 Implementation Outline**
1. **Scenario Library Enhancements**
   - Replace the one-off list in localStorage with a library module that supports:
     - `getScenarios()`, `addScenario()`, `updateScenario()`, `removeScenario()`.
     - Filtering by `worldId` and tags.
   - Enhance the playground UI:
     - Show a sidebar of scenarios with search by name/tag.
     - Allow duplicating a scenario to tweak variations (A/B scenarios).

2. **Simulation Run Recording**
   - Add a recording toggle in the playground UI:
     - When enabled, each tick appends a `SimulationRunSnapshot` to the current run (capturing worldTime, session flags, relationships).
   - Persist runs in localStorage with references to the scenario they came from.
   - Provide a simple “Run Viewer” section:
     - List recent runs for the selected scenario.
     - Allow stepping through snapshots to see how state evolved.

3. **Hook into Deeper Simulation Logic (Optional)**
   - Define a thin interface in a new module, e.g. `frontend/src/lib/simulation/engine.ts`:
     ```ts
     export interface SimulationState {
       worldTime: number;
       sessionFlags: Record<string, unknown>;
       relationships: Record<string, any>;
       // add more as needed
     }

     export type SimulationStepFn = (state: SimulationState) => SimulationState;
     ```
   - Allow plugging in a `SimulationStepFn` (even a stub) that runs on each tick before snapshots are taken.
   - For now, this can log or perform very simple relationship drift; later it can call into game-core/back-end logic.

4. **Non-Intrusive Design**
   - Ensure the playground’s simulation state is isolated from “real” Game2D sessions:
     - Use cloned state objects for simulation.
     - Only call backend APIs when explicitly desired (e.g. when simulating real GameSession updates; otherwise keep it local).

---

## Phase 3: Advanced Simulation Mechanics & AI Behaviors

Add sophisticated simulation logic and emergent behaviors.

**Phase 3 Goals**
- Implement **NPC routine simulation** with daily schedules.
- Add **relationship dynamics** that evolve over time.
- Create **economic simulation** for resources and trade.
- Build **faction politics** simulation.

**Key Features**
- NPC behaviors:
  - Need-based actions (hunger, sleep, social).
  - Goal-oriented planning.
  - Emergent interactions.
- Social dynamics:
  - Relationship decay/growth.
  - Gossip propagation.
  - Group formation.
- Economic systems:
  - Supply and demand.
  - Trade routes.
  - Market fluctuations.

---

## Phase 4: Simulation Analysis & Optimization Tools

Build tools to understand and optimize simulation outcomes.

**Phase 4 Goals**
- Create **simulation profiler** for performance analysis.
- Add **butterfly effect tracker** for causality chains.
- Implement **equilibrium finder** for stable states.
- Build **scenario comparison** tools.

**Key Features**
- Performance tools:
  - Bottleneck identification.
  - Memory profiling.
  - Optimization suggestions.
- Causality analysis:
  - Event chain visualization.
  - Impact assessment.
  - Critical path finding.
- Comparison engine:
  - Side-by-side scenarios.
  - Differential analysis.
  - Statistical testing.

---

## Phase 5: Cloud Simulation & Distributed Processing

Scale simulation to handle massive worlds and scenarios.

**Phase 5 Goals**
- Implement **cloud-based simulation** for heavy processing.
- Add **distributed simulation** across multiple servers.
- Create **simulation-as-a-service** API.
- Build **machine learning** integration for behavior prediction.

**Key Features**
- Cloud infrastructure:
  - Auto-scaling compute.
  - Result caching.
  - Cost optimization.
- Distributed system:
  - World partitioning.
  - Synchronized updates.
  - Fault tolerance.
- ML integration:
  - Behavior prediction models.
  - Anomaly detection.
  - Pattern learning.
