**Task: Game Mode & ViewState Model (Frontends + Session State)**

> **For Agents (How to use this file)**
> - This task defines a **unified game mode / view-state model** for both the editor/playtest UIs and runtime gameplay.
> - It does **not** change core simulation or narrative logic; instead it:
>   - Provides a clear, centralized answer to “what mode is the player in right now?”  
>   - Standardizes how the frontend and backend represent high-level game state (map vs room vs scene vs conversation).
> - Read these first:
>   - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – how editor and life-sim phases fit together  
>   - `docs/INTERACTION_AUTHORING_GUIDE.md` – interaction & conversation flows  
>   - `docs/INTIMACY_SCENE_COMPOSER.md` – intimacy scene flows  
>   - `claude-tasks/19-npc-ecs-relationship-components-and-plugin-metrics.md` – ECS components  
>   - `claude-tasks/20-narrative-runtime-and-action-block-unification.md` – narrative runtime plan  
>   - `claude-tasks/21-world-time-and-simulation-scheduler-unification.md` – scheduler plan.
> - Constraint: keep backend “mode” state **coarse** and JSON-only (`GameSession.flags.gameState`), with UI-specific details on the frontend.

---

## Context

Currently, “where are we in the game?” is spread across:

- Frontend routing:
  - `Game2D`, `GameWorld`, scene graph editor, interaction demos, intimacy composer, etc.
  - Local component state for “conversation open”, “scene playing”, “interaction menu visible”.
- Backend session state:
  - `GameSession.world_time`, `flags`, `relationships`, ECS components (`behavior`, `interactions`, etc.).
  - Narrative/interaction systems know if there is pending dialogue or an active chain, but not as a unified “mode”.

Missing:

- A shared concept of **GameMode** (map / room / scene / conversation / menu) and **GameViewState**:
  - So that all systems agree when we are:
    - Browsing a map or world view.  
    - In a specific room/location.  
    - In a scene (graph-based cinematic or cutscene).  
    - In an ongoing conversation (narrative program).  
    - In an “out-of-band” menu.

This is especially important as:

- Narrative runtime (Task 20) starts owning conversations and cutscenes.  
- ECS components (Task 19) encode NPC state, but not global “player view/mode”.  
- Scheduler (Task 21) wants to simulate NPCs differently based on whether the player is in map/room/scene/conversation.

**Goal:** Introduce a small, explicit **GameMode / GameContext model** shared between frontend and backend, to:

- Drive UI transitions: map ↔ room ↔ scene ↔ conversation.  
- Provide coarse mode info to behavior, interactions, and narrative systems.  
- Keep per-frame UI concerns (camera, widget arrangement) strictly on the frontend.

---

## Phase Checklist

- [ ] **Phase 22.1 – Define GameMode & GameContext Types (TS)**
- [ ] **Phase 22.2 – Frontend GameState Store & Route Integration**
- [ ] **Phase 22.3 – Session-Level GameState (Backend)**
- [ ] **Phase 22.4 – Integration with Narrative Runtime & Interactions**
- [ ] **Phase 22.5 – Behavior/Scheduler Awareness (Optional, Coarse)**

---

## Phase 22.1 – Define GameMode & GameContext Types (TS)

**Goal**  
Define a minimal set of modes and a shared `GameContext` type that frontend and game-core can rely on.

**Scope**

- TypeScript only: `packages/types` and `packages/game-core`.

**Key Steps**

1. Add `GameMode` to `packages/types/src/game.ts` (or a new `gameState.ts`):

```ts
export type GameMode =
  | 'map'          // world/region map overview
  | 'room'         // in a specific location/room
  | 'scene'        // running a scene graph / cutscene
  | 'conversation' // narrative program / chat/dialogue view
  | 'menu';        // global menu / settings
```

2. Add `GameContext`:

```ts
export interface GameContext {
  mode: GameMode;
  worldId: number;
  sessionId: number;
  locationId?: string;    // "location:market_square"
  sceneId?: number;       // GameScene ID if in scene
  npcId?: number;         // focused NPC (in conversation/room)
  narrativeProgramId?: string;  // active narrative program, if any
}
```

3. Export these types from `packages/types/src/index.ts` for frontend and game-core.
4. Optionally add helper types in `packages/game-core/src/gameState.ts`:
   - `isConversationMode(context)`, `isSceneMode(context)`, etc.

**Status:** ☐ Not started

---

## Phase 22.2 – Frontend GameState Store & Route Integration

**Goal**  
Create a central `gameStateStore` (e.g., Zustand or equivalent) that holds `GameContext`, and wire it into key routes.

**Scope**

- Frontend only: `frontend/src/stores` and `frontend/src/routes`.

**Key Steps**

1. Implement `useGameStateStore`:

```ts
interface GameState {
  context: GameContext | null;
  setContext: (ctx: GameContext) => void;
  updateContext: (patch: Partial<GameContext>) => void;
}
```

2. On route entry:
   - `Game2D` route:
     - Set `mode = 'room'`, `worldId`, `locationId` (current room), no `sceneId`/`npcId`.  
   - Scene player route (when you have it):
     - Set `mode = 'scene'`, `sceneId`, `worldId`, maybe `npcId`.
   - Conversation UI (when narrative runtime opens one):
     - Set `mode = 'conversation'`, `npcId`, `narrativeProgramId`.
3. Make `GameContext` the single source of truth for “what mode are we in”:
   - Interaction panels, HUDs, and overlays read from `useGameStateStore` to decide whether to show map controls vs conversation UI vs scene controls.
4. Keep **UI-local** state (camera position, panel layout) in separate stores; do not stuff it into `GameContext`.

**Status:** ☐ Not started

---

## Phase 22.3 – Session-Level GameState (Backend)

**Goal**  
Mirror a **coarse** version of `GameContext` into `GameSession.flags.gameState` for backend systems and tools.

**Scope**

- Backend only: `GameSession.flags` and ECS helpers.

**Key Steps**

1. Define a Pydantic `GameStateSchema` in `pixsim7_backend/domain/game/schemas.py`:

```python
class GameStateSchema(BaseModel):
    mode: Literal["map", "room", "scene", "conversation", "menu"]
    world_id: int
    session_id: int
    location_id: Optional[str] = None
    scene_id: Optional[int] = None
    npc_id: Optional[int] = None
    narrative_program_id: Optional[str] = None
```

2. Store it in `GameSession.flags["gameState"]`:
   - Only updated when mode transitions meaningfully:
     - e.g., starting/ending a conversation, entering/exiting a scene, moving between rooms.  
3. Add small helpers (optionally in ECS or a `game_state.py` module):
   - `get_game_state(session) -> GameStateSchema | None`  
   - `set_game_state(session, state: GameStateSchema)`  
4. Decide which systems update backend `gameState`:
   - Narrative runtime (Task 20) when starting/ending a conversation or cinematic scene.  
   - Interaction handlers when transitioning between map/room/scene.  
   - Editors/playtest endpoints if needed.

**Status:** ☐ Not started

---

## Phase 22.4 – Integration with Narrative Runtime & Interactions

**Goal**  
Ensure narrative runtime and interactions use `GameContext`/`gameState` consistently to manage mode transitions.

**Scope**

- Narrative runtime (Task 20).  
- Interaction execution (Task 17).

**Key Steps**

1. Narrative runtime:
   - When starting a conversation program:
     - Backend:
       - Update `flags.gameState.mode = "conversation"`, set `npc_id`, `narrative_program_id`.  
     - Frontend:
       - Set `GameContext.mode = "conversation"` with matching fields.  
   - When finishing a program:
     - Transition back to previous mode (`room` or `scene`) based on stored context.
2. Scene transitions:
   - When launching a scene from an interaction outcome:
     - Backend: set `gameState.mode = "scene"`, `scene_id`.  
     - Frontend: update `GameContext` to `mode = 'scene'`.
3. Interaction UI:
   - `NpcInteractionPanel` and related components:
     - Read `GameContext` to know:
       - If we’re in conversation, show conversation‑oriented controls.  
       - If we’re in room mode, show interaction menu overlays.  
     - Use `GameContext.npcId` as the “current target NPC”.

**Status:** ☐ Not started

---

## Phase 22.5 – Behavior/Scheduler Awareness (Optional, Coarse)

**Goal**  
Make behavior and scheduler *aware* of game mode in a coarse way, without baking UI concerns into the backend.

**Scope**

- Scheduler (Task 21) and behavior prioritization.

**Key Steps**

1. Scheduler:
   - When building the work plan for a world:
     - Optionally inspect `gameState` for active sessions:  
       - If any session in that world is in `conversation` or `scene`, keep NPCs involved in those modes at higher simulation tiers.  
   - This helps focus simulation on what the player is actively seeing.
2. Behavior:
   - Behavior rules can optionally use game mode in conditions (e.g., “only trigger greetOnApproach when mode is `room` or `map`”).
   - Accessed via:
     - ECS components + `gameState` (if you choose to expose it as a read-only piece of state to conditions).

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task:

- Frontend has a **single source of truth** (`GameContext`) for:
  - Map vs room vs scene vs conversation vs menu.  
  - Current world/session, and focused NPC/scene/program where relevant.
- Backend has a **coarse gameState**:
  - Mirrored in `GameSession.flags.gameState`, updated on major mode transitions.  
  - Available for tools, behavior, and scheduler decisions.
- Narrative runtime, interactions, and (optionally) scheduler:
  - Use this model for mode transitions and mode-aware logic, instead of ad‑hoc flags.
- Editor/playtest flows:
  - Use the same GameMode / GameContext concept where it makes sense (especially for conversation/scene testing), so designers and runtime share language about “where we are” in the game.

