**Task: Simulation Playground for NPC Brain & World (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document**, not the primary specification.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/APP_MAP.md` (Simulation Playground / dev tools sections)  
>   - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` (world/life‑sim phases)  
>   - `docs/SYSTEM_OVERVIEW.md` (worlds, sessions, NPC tools).
> - Use the phase checklist below to coordinate work and record what’s done (with notes and file paths).
> - When you implement or change a phase, update the checklist and point back to the actual code/docs you touched.

**Context**
- You have:
  - Game2D for world/scene playback.
  - `NpcBrainLab` for brain introspection.
  - World tools (relationship dashboard, quest log, inventory, world info, mood debug).
  - A robust plugin system.
- Designers need a focused place to “stress test” scenarios—time progression, flags, relationships, NPC moods, etc.—without disturbing real sessions.

Below are 10 phases for building and extending the Simulation Playground.

> **For agents:** Phases 1–10 are implemented; use this file to understand the Playground’s intended capabilities and to track future refinements.

### Phase Checklist

- [x] **Phase 1 – Basic Simulation Route & World/Session Selection**
- [x] **Phase 2 – Local Simulation State & Time Controls**
- [x] **Phase 3 – Integrate World Tools & Brain Tools**
- [x] **Phase 4 – Save/Load Simulation Scenarios (Frontend‑Only)**
- [x] **Phase 5 – Recording of Simulation Runs**
- [x] **Phase 6 – Multi‑World / Multi‑Session Comparison**
- [x] **Phase 7 – Constraint‑Driven Simulation Runs**
- [x] **Phase 8 – Plugin Hooks & Simulation‑Specific Events**
- [x] **Phase 9 – Export / Import Simulation Runs & Scenarios**
- [x] **Phase 10 – Automation & Regression Harness**

---

### Phase 1 – Basic Simulation Route & World/Session Selection

… (existing phase descriptions unchanged) …

---

**Related Docs & Files**

- Docs:  
  - `docs/APP_MAP.md` – architecture index (Simulation Playground / dev tools sections)  
  - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – world/life‑sim phases  
  - `docs/SYSTEM_OVERVIEW.md` – worlds, sessions, NPC tools
- Frontend:  
  - `frontend/src/routes/SimulationPlayground.tsx`  
  - `frontend/src/components/game/WorldToolsPanel.tsx`  
  - `frontend/src/components/game/RelationshipDashboard.tsx`  
  - `frontend/src/routes/NpcBrainLab.tsx`
- Backend / Game-core:  
  - `pixsim7_backend/api/v1/game_worlds.py` / `game_sessions.py`  
  - `pixsim7_backend/services/game/*`  
  - `packages/game-core/src/session/state.ts` and `packages/game-core/src/npcs/brain.ts`

