**Task: World GameProfile & Simulation Modes (Life-Sim / VN / Turn-Based Tuning)**

> **For Agents (How to use this file)**
> - This task defines a **world-level profile and simulation mode model** so that:
>   - Life-sim / 2D day-cycle games and visual-novel / romance games run on the **same engine**,  
>   - But are tuned via config rather than divergent code paths.
> - It ties together:
>   - Behavior & ECS (Task 13, 19)  
>   - Interaction & narrative (Tasks 17, 20)  
>   - Scheduler (Task 21)  
>   - Game mode/viewstate (Task 22)
> - Read these first:
>   - `docs/behavior_system/README.md` – behavior configs & examples  
>   - `docs/INTERACTION_AUTHORING_GUIDE.md` – interactions & chains  
>   - `docs/INTIMACY_SCENE_COMPOSER.md` – intimacy vs VN flows  
>   - `claude-tasks/13-safeguards-and-extensibility.md` – scoring & simulation config  
>   - `claude-tasks/21-world-time-and-simulation-scheduler-unification.md` – world simulation config  
>   - `frontend/src/routes/Game2D.tsx` – current turn-based 2D playtest logic.

---

## Context

Design goal: **one engine** that can support both:

- **Life-sim / 2D day cycle**:
  - Emphasis on NPC schedules, behavior, locations, and routine interactions.  
  - Turn-based or accelerated day progression.  
  - Frequent, small interactions (work, rest, socialize, daily quests).
- **Visual novel / romance / intimacy**:
  - Emphasis on narrative programs, scenes, and high-impact choices.  
  - Less focus on continuous simulation; more on branching sequences.  
  - Stronger content rating and intimacy gating.

Current system already provides many shared building blocks:

- ECS components for NPC state (core, romance, behavior, interactions).  
- Behavior system with configurable scoring and simulation tiers.  
- Interaction layer with chains and suggestions.  
- Narrative runtime plan (Task 20).  
- Scheduler plan (Task 21) and game mode model (Task 22).  
- Turn-based world mode in `Game2D` via `SessionFlags.sessionKind === 'world'` and `flags.world.mode === 'turn_based'`.

Missing piece: a **World GameProfile** that:

- Declares “this world is primarily life-sim / VN / hybrid”.  
- Configures:
  - Simulation mode: real-time vs turn-based.  
  - Behavior scoring weights.  
  - Interaction & suggestion tuning.  
  - Narrative emphasis (how much to favor narrative programs vs free play).

**Goal:** Add a `GameProfile` and `SimulationMode` schema to `GameWorld.meta` and wire it into behavior, interactions, scheduler, and Game2D, so you can switch between life-sim / VN / hybrid and turn-based vs continuous without forking systems.

---

## Phase Checklist

- [ ] **Phase 23.1 – GameProfile & SimulationMode Schema (World Meta)**
- [ ] **Phase 23.2 – Behavior & Scoring Integration**
- [ ] **Phase 23.3 – Interaction & Suggestion Tuning**
- [ ] **Phase 23.4 – Turn-Based Simulation Mode & Game2D Alignment**
- [ ] **Phase 23.5 – Narrative Emphasis & Defaults**

---

## Phase 23.1 – GameProfile & SimulationMode Schema (World Meta)

**Goal**  
Introduce a world-level `gameProfile` object that defines the high-level style and simulation mode.

**Scope**

- `GameWorld.meta` schema (TS + Pydantic).

**Key Steps**

1. Define `GameProfile` type in TS (`packages/types/src/game.ts` or `world.ts`):

```ts
export type GameStyle = 'life_sim' | 'visual_novel' | 'hybrid';
export type SimulationMode = 'real_time' | 'turn_based' | 'paused';

export interface GameProfile {
  style: GameStyle;
  simulationMode: SimulationMode;
  turnConfig?: {
    turnDeltaSeconds: number;      // default turn length in game seconds
    maxTurnsPerSession?: number;
  };
  behaviorProfile?: 'work_focused' | 'relationship_focused' | 'balanced';
  narrativeProfile?: 'light' | 'moderate' | 'heavy';
}
```

2. Mirror in Pydantic (`pixsim7_backend/domain/game/schemas.py`) as `GameProfileSchema`.  
3. Extend `GameWorld.meta` validation to include:

```json
"meta": {
  "gameProfile": {
    "style": "life_sim",
    "simulationMode": "turn_based",
    "turnConfig": { "turnDeltaSeconds": 3600 },
    "behaviorProfile": "work_focused",
    "narrativeProfile": "light"
  }
}
```

4. Default behavior:
   - If `gameProfile` is absent, treat as `style = "hybrid"`, `simulationMode = "real_time"`.

**Status:** ☐ Not started

---

## Phase 23.2 – Behavior & Scoring Integration

**Goal**  
Connect `GameProfile.behaviorProfile` to behavior scoring and simulation tiers.

**Scope**

- Behavior scoring config (Task 13 safeguards).  
- Simulation tier config (behavior system & scheduler).

**Key Steps**

1. Map `behaviorProfile` to default scoring weights (as per Task 13 example):
   - `work_focused`: higher categoryPreference for work, higher urgency, conservative relationship weights.  
   - `relationship_focused`: higher relationshipBonus, moodCompatibility, lower work emphasis.  
   - `balanced`: middle-of-the-road defaults.
2. When loading behavior config:
   - If world has explicit `behavior.scoringConfig`, use that.  
   - Else, derive defaults from `behaviorProfile`.
3. Simulation tiers:
   - For `life_sim` worlds:
     - More NPCs at `active` tier; frequent updates.  
   - For `visual_novel` worlds:
     - Fewer NPCs at `detailed` tier; focus on narrative-relevant NPCs.
4. Update docs (`docs/behavior_system/README.md`) to describe how `GameProfile` influences behavior defaults.

**Status:** ☐ Not started

---

## Phase 23.3 – Interaction & Suggestion Tuning

**Goal**  
Adjust interaction suggestion logic and default interaction configs based on `GameProfile`.

**Scope**

- Game-core `suggestions.ts` and template helpers.  
- Optional world-level interaction config in meta.

**Key Steps**

1. Expose `GameProfile` (style + narrativeProfile) to game-core suggestion helpers:
   - For `life_sim` / `narrativeProfile: light`:
     - Boost everyday interactions (work/social/leisure), less emphasis on heavy narrative beats.  
   - For `visual_novel` / `narrativeProfile: heavy`:
     - Boost chain continuation, relationship milestones, narrative programs.
2. World-level interaction defaults:
   - Optionally add `meta.interactions.defaults` that vary by `style`:
     - For `life_sim`: default interaction surfaces more inline / ambient.  
     - For `visual_novel`: default surfaces more `dialogue` / `scene`.
3. Suggestion scoring:
   - Use world-level weights (Task 13–17) derived from `GameProfile`, so you don’t hardcode VN vs life-sim assumptions.

**Status:** ☐ Not started

---

## Phase 23.4 – Turn-Based Simulation Mode & Game2D Alignment

**Goal**  
Connect `simulationMode` and `turnConfig` to the existing Game2D turn-based controls and scheduler.

**Scope**

- `Game2D.tsx`, session flags (`SessionFlags`), and scheduler (Task 21).

**Key Steps**

1. Align `Game2D` logic:
   - Derive turn-based behavior from:
     - `world.meta.gameProfile.simulationMode === "turn_based"` and `turnConfig.turnDeltaSeconds`, not just `SessionFlags.world.mode`.  
   - When creating or loading sessions for a world:
     - Initialize `SessionFlags.world.mode` and `world.turnDeltaSeconds` based on `GameProfile`.
2. Scheduler (Task 21):
   - For `simulationMode = "turn_based"`:
     - Only advance `world_time` when a turn is advanced (e.g., via explicit player action or a “Next Turn” command).  
   - For `simulationMode = "real_time"`:
     - Use continuous ticks as defined in `WorldSimulationConfig`.
3. Expose “turn-based vs real-time” clearly in editor/UI:
   - In `GameWorld` or a `WorldSettings` panel, show and edit `GameProfile.simulationMode` & `turnConfig`.

**Status:** ☐ Not started

---

## Phase 23.5 – Narrative Emphasis & Defaults

**Goal**  
Tie `GameProfile.style` and `narrativeProfile` into narrative runtime defaults and interaction/narrative flows.

**Scope**

- Narrative runtime (Task 20).  
- Interaction templates (chains, suggestions).

**Key Steps**

1. Narrative runtime:
   - For `style = "visual_novel"` and `narrativeProfile = "heavy"`:
     - Favor launching narrative programs (scenes, dialogue) from interactions.  
   - For `style = "life_sim"` and `narrativeProfile = "light"`:
     - Use narrative programs more sparingly (e.g., major events, arcs), while everyday interactions remain short and non-intrusive.
2. Interaction templates:
   - Provide example presets per style:
     - Life-sim: more daily routines, simple talk interactions, small deltas.  
     - VN: richer chains with explicit story beats, choices, and scene transitions.
3. Editors:
   - In interaction/narrative editors, show which `GameProfile` the world is using, and provide style-appropriate templates first.

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task:

- Each `GameWorld` has an explicit `gameProfile` that defines:
  - Style (`life_sim` / `visual_novel` / `hybrid`).  
  - Simulation mode (`turn_based` vs `real_time`).  
  - Behavior and narrative emphasis profiles.
- Behavior, interactions, and suggestions:
  - Read this profile and adjust defaults accordingly, without separate “life-sim vs VN” code paths.
- Game2D and future runtime UIs:
  - Reflect `simulationMode` correctly (turn-based vs continuous).  
  - Provide a consistent turn-based mechanism when `simulationMode = "turn_based"`.
- The engine remains one unified system:
  - Life-sim vs VN is a matter of configuration layers (GameProfile + behavior/interaction defaults), not separate engines.***
