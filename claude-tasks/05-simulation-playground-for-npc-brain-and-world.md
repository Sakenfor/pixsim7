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

