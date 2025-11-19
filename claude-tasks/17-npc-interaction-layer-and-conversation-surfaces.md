**Task: NPC Interaction Layer & Conversation Surfaces (Multi‑Phase)**

> **For Agents (How to use this file)**
> - This file is a **roadmap/status document** for the player–NPC interaction layer and conversation surfaces; it is not the primary spec for relationships, behavior, or generation.
> - Read these first for authoritative behavior and data shapes:  
>   - `docs/HOTSPOT_ACTIONS_2D.md` – 2D hotspots, interaction schema, and actions  
>   - `docs/RELATIONSHIPS_AND_ARCS.md` – relationship tiers, arcs, and session flags  
>   - `docs/INTIMACY_AND_GENERATION.md` – intimacy + generation social context  
>   - `docs/DYNAMIC_GENERATION_FOUNDATION.md` – generation nodes and pipeline  
>   - `docs/GRAPH_UI_LIFE_SIM_PHASES.md` – how world/life‑sim integrates with graph editor  
>   - `claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md` – NPC behavior, activities, and routine graphs  
>   - `claude-tasks/12-intimacy-scene-composer-and-progression-editor.md` – intimacy scene/progression tooling.
> - When implementing phases here, build on **existing** interaction schema, relationship/mood metrics, and generation pipeline rather than inventing new ad‑hoc request shapes.
> - Keep everything JSON‑backed (world/NPC/session meta + flags), and avoid new core DB tables/columns.

---

## Context

Recent tasks have focused on:

- **World and NPC state** – relationships, intimacy, mood, reputation (Tasks 07–09).  
- **Generation pipeline** – unified generations API and social context (Tasks 10, 15).  
- **NPC behavior** – activities, preferences, routine graphs, simulation tiers (Task 13 + 13‑safeguards).  
- **Intimacy editor tooling** – progression and scene composition (Task 12).

What’s **missing** is the connective tissue between:

- **Player actions** (hotspots, menus, buttons, dialogue choices, “Talk”, “Give gift”, “Invite out”, etc.)
- **NPC state** (availability via behavior system, mood, relationship tiers, arcs)
- **Outcomes** (scene transitions, generative responses, relationship changes, flags, rewards).

Right now:

- `frontend/src/lib/game/interactionSchema.ts` defines a generic hotspot/action schema, but it doesn’t fully express **NPC‑specific interactions** (persona, relationship gating, dynamic availability).
- 2D playtest (`frontend/src/routes/Game2D.tsx`) and hotspot actions handle simple interactions, but not a cohesive **NPC interaction layer**.
- NPC behavior/schedules (Task 13) decide what NPCs are doing, but not how the player interacts with them in a consistent, typed way.

**Goal:** Define a **canonical NPC interaction layer** and **conversation surfaces** that:

- Use a typed `NpcInteraction` model (TS + Pydantic) built on existing interaction schema.
- Describe how interaction options are **discovered**, **gated**, **presented**, and **executed** at runtime.
- Integrate with:
  - NPC behavior state (availability & context).
  - Relationship/intimacy/mood metrics (gating, effects, social context).
  - Scenes and generation pipeline (dialogue, short encounters, cinematic/intimate scenes).
- Provide clear editor‑facing concepts (interaction definitions, menus, and presets).

---

## Phase Checklist

- [ ] **Phase 17.1 – Inventory Current Interaction & Dialogue Systems**
- [ ] **Phase 17.2 – Canonical `NpcInteraction` Model (TS + Pydantic)**
- [ ] **Phase 17.3 – Availability & Gating Logic (Who/When/Where)**
- [ ] **Phase 17.4 – Interaction Menu Builder & UI Surfaces**
- [ ] **Phase 17.5 – Execution Pipeline & Effects (Relationships, Flags, Scenes, Generation)**
- [ ] **Phase 17.6 – NPC‑Initiated Interactions & Events**
- [ ] **Phase 17.7 – Telemetry, Debugging & Tooling**

---

## Phase 17.1 – Inventory Current Interaction & Dialogue Systems

**Goal**  
Map all existing systems that implement “interactions with NPCs” so the new layer wraps and unifies them instead of duplicating logic.

**Scope**

- 2D hotspots and interaction schema:
  - `frontend/src/lib/game/interactionSchema.ts`
  - `frontend/src/routes/Game2D.tsx`
  - `frontend/src/lib/game/session.ts`
- Dialogue / narrative plugins:
  - `pixsim7_backend/api/v1/game_dialogue.py` (if present) and related routes/plugins  
  - Action blocks (`pixsim7_backend/domain/narrative/action_blocks/*`) and composition engine.
- Relationship / arcs:
  - Preview APIs, metrics, and helpers (Tasks 07–09).
- UI surfaces:
  - Any existing “Talk / Interact / Inspect” UI (2D/3D).

**Key Steps**

1. Enumerate interaction types currently supported:
   - Simple hotspot actions (e.g. `talk`, `look`, `use`).
   - Dialogue interactions (fixed scripts, generated responses).
   - Quest progression actions (turn‑in, accept, branch).
2. Document:
   - Request/response shapes used today.
   - How they update `GameSession.flags` / `relationships`.
   - Where they rely on NPC identity vs roles.
3. Add a short “Inventory Summary” section to the bottom of this file to guide subsequent phases.

**Status:** ☐ Not started

---

## Phase 17.2 – Canonical `NpcInteraction` Model (TS + Pydantic)

**Goal**  
Define a shared, typed model for **NPC interactions** that sits on top of hotspot actions and is used by both frontend and backend.

**Scope**

- New TS types in `packages/types` (likely `src/game.ts` or `src/interactions.ts`).
- Pydantic schemas in `pixsim7_backend/domain/game/schemas.py` (or interaction‑specific module).

**Key Concepts**

- **Interaction definition** – what designers author in data (per world, per NPC, or via presets).
- **Interaction instance** – a concrete available interaction at runtime for a specific NPC in a specific context.
- **Interaction outcome** – how an executed interaction affects session state and what surface it uses (inline text, scene, generation).

**Sketch (TypeScript):**

```ts
export type NpcInteractionSurface =
  | 'inline'        // small text/choice UI (e.g. 2D HUD)
  | 'dialogue'      // dialogue box / chat window
  | 'scene'         // full scene transition
  | 'notification'; // off-screen ping, message, etc.

export interface NpcInteractionDefinition {
  id: string;                             // "interaction:talk_basic", "interaction:gift_flowers"
  label: string;                          // Display label ("Talk", "Give Flowers")
  description?: string;

  // Who/what this interaction is for
  targetRolesOrIds?: string[];            // e.g. ["npc:alex", "role:shopkeeper"]
  surface: NpcInteractionSurface;

  // Gating metadata (details in Phase 17.3)
  gating?: {
    minRelationshipTierId?: string;       // world-defined tier IDs
    minAffinity?: number;
    maxTension?: number;
    timeOfDay?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
    requiredFlags?: string[];             // "arc:job_intro.completed"
    forbiddenFlags?: string[];
    cooldownSeconds?: number;
  };

  // Outcome metadata (details in Phase 17.5)
  outcome?: {
    sceneIntentId?: string;               // "intent:romantic_dinner", world-mapped to scenes
    actionBlockIds?: string[];            // generation / action blocks hooks
    relationshipDeltas?: {                // small, direct nudges
      affinity?: number;
      trust?: number;
      chemistry?: number;
      tension?: number;
    };
    flagChanges?: Record<string, unknown>;
  };

  meta?: Record<string, unknown>;
}

export interface NpcInteractionInstance {
  id: string;                             // unique per opportunity if needed
  definitionId: string;
  npcId: string;                          // concrete "npc:<id>"
  worldId: number;
  sessionId: number;
  surface: NpcInteractionSurface;

  // Derived availability state
  available: boolean;
  disabledReason?: string;

  // Optional context used for generation/scenes
  context?: {
    locationId?: string;
    currentActivityId?: string;
    moodTags?: string[];
    relationshipSnapshot?: {
      affinity?: number;
      trust?: number;
      chemistry?: number;
      tension?: number;
      tierId?: string;
      intimacyLevelId?: string;
    };
  };
}
```

**Storage**

- World‑level definitions:
  - `GameWorld.meta.interactions.definitions: Record<string, NpcInteractionDefinition>`
- NPC‑level overrides (optional):
  - `GameNPC.meta.interactions?: { definitionOverrides?: Record<string, Partial<NpcInteractionDefinition>> }`
- Session‑level state:
  - `GameSession.flags.npcs["npc:<id>"].interactions?: { lastUsedAtSeconds?: Record<string, number> }` (for cooldowns).

**Key Steps**

1. Finalize TS types for definition and instance.
2. Add Pydantic models and validators (gating ranges, known surfaces, reference consistency).
3. Integrate with world/NPC meta validation (no new tables).

**Status:** ☐ Not started

---

## Phase 17.3 – Availability & Gating Logic (Who/When/Where)

**Goal**  
Define and implement how the system decides **which interactions are available** for a given NPC at a given moment.

**Scope**

- Gating based on:
  - Relationship tiers/metrics.
  - Mood.
  - Arcs/flags.
  - Time of day.
  - NPC behavior state (current activity, location, simulation tier).

**Key Steps**

1. Implement backend helper(s) in a new domain module (e.g. `npc_interactions.py`):
   - `list_available_interactions(world, npc, session, worldTime) -> list[NpcInteractionInstance]`
   - Uses:
     - World interaction definitions.
     - NPC meta overrides.
     - Session relationships and flags.
     - Behavior state from `GameSession.flags.npcs["npc:<id>"].state`.
2. Use existing metrics and schemas:
   - Relationship/intimacy tiers from Tasks 07–11.
   - Mood state from unified mood metric (Task 14).
3. Support both **hard gating** and **soft gating**:
   - Hard gating ⇒ interaction not shown / disabled (`available: false` + `disabledReason`).
   - Soft gating ⇒ interaction shown but flagged (e.g. potential negative outcome if mood/tension is high).
4. Ensure the logic is:
   - Pure and testable.
   - Configurable via world meta (no hardcoded thresholds).

**Status:** ☐ Not started

---

## Phase 17.4 – Interaction Menu Builder & UI Surfaces

**Goal**  
Provide frontend/game‑core helpers to **build and render interaction menus** and conversation entry points based on the canonical model.

**Scope**

- Game‑core helpers (`packages/game-core`).
- 2D playtest UI (`frontend/src/routes/Game2D.tsx`) and any future NPC panels.

**Key Steps**

1. Add game‑core client functions:
   - `fetchNpcInteractions(worldId, sessionId, npcId): Promise<NpcInteractionInstance[]>`
   - Helpers to group/sort interactions:
     - By surface (inline vs dialogue vs scene).
     - By category / designer tags if added.
2. Update 2D playtest UI:
   - Replace ad‑hoc lists of actions with a menu built from the interaction instances.
   - Show disabled options with tooltips (from `disabledReason`) where appropriate.
3. Define conventions per surface:
   - `inline`: small HUD actions, quick one‑off interactions.
   - `dialogue`: open/continue a conversation UI with multiple choices.
   - `scene`: trigger a scene transition (handoff to scene graph / scene player).
   - `notification`: background events (Phase 17.6).
4. Ensure interaction definitions can be used in:
   - 2D/3D view‑modes.
   - Editor tooling (interaction presets per NPC/world).

**Status:** ☐ Not started

---

## Phase 17.5 – Execution Pipeline & Effects

**Goal**  
Define a **single execution pipeline** for NPC interactions that:

- Updates session state (relationships, flags, inventory, etc.).
- Optionally launches scenes or generation flows.
- Provides a consistent logging/analytics story.

**Scope**

- Backend interaction execution endpoint(s).
- Game‑core helpers to call execution and apply client‑side effects if needed.

**Key Steps**

1. Backend APIs:
   - Add an endpoint family (exact path TBD, e.g. `/api/v1/npc_interactions/*`):
     - `POST /npc_interactions/execute` with payload:
       - `{ world_id, session_id, npc_id, interaction_definition_id, context? }`
   - Execution pipeline:
     - Re‑compute availability (defensive).
     - Apply small, direct effects from `outcome.relationshipDeltas` and `outcome.flagChanges` to `GameSession.relationships` and `GameSession.flags`.
     - If `sceneIntentId` is present:
       - Construct a scene/graph transition request using roles and context (world decides which scene to launch).
     - If `actionBlockIds` are present:
       - Construct appropriate `GenerationSocialContext` and `GenerationNodeConfig` and call unified `/api/v1/generations`.
2. Integrate with existing systems:
   - Relationship/intimacy previews for “what if” (optional).
   - Mood updates via outcome hooks.
3. Define clear response contracts:
   - Resulting relationship deltas.
   - Any launched scene / generation IDs.
   - Messages for UI (success, failure, not available).
4. Make execution side‑effect free in editor preview modes (e.g. toggled via a flag) so designers can simulate interactions without permanently altering sessions.

**Status:** ☐ Not started

---

## Phase 17.6 – NPC‑Initiated Interactions & Events

**Goal**  
Extend the interaction model so **NPCs can initiate interactions with the player**, not just respond to player‑triggered hotspots.

**Scope**

- Hooks between NPC behavior/simulation (Task 13) and interaction layer.
- Notification / event surfaces on the frontend.

**Key Steps**

1. Define a concept of **interaction intents** emitted from behavior:
   - E.g. `npc_intent: "invite_out"`, `target_player: current`, `preferredSurface: "notification" | "dialogue"`.
   - Behavior system can emit intents when certain activities or conditions occur.
2. Implement a small buffer or queue in session flags:

```ts
GameSession.flags.interactionInbox?: Array<{
  id: string;
  npcId: string;
  definitionId: string;
  createdAt: string;
  expiresAt?: string;
}>;
```

3. Frontend/game‑core:
   - Poll or subscribe to interaction inbox for the active session.
   - Show notifications / prompts (e.g. “Alex wants to talk”).
   - Link back into the same execution pipeline as player‑initiated interactions.
4. Ensure:
   - NPC‑initiated interactions respect the same gating rules and outcome semantics.
   - Scheduled interactions can expire if the player ignores them.

**Status:** ☐ Not started

---

## Phase 17.7 – Telemetry, Debugging & Tooling

**Goal**  
Make NPC interactions observable and debuggable, and support iteration on interaction design.

**Scope**

- Logging, metrics, and editor tooling.

**Key Steps**

1. Logging:
   - Emit structured logs on interaction execution:
     - World/session/NPC IDs, interaction definition, gating state, outcome deltas.
2. Metrics:
   - Aggregate counts of interaction usage per definition, per world.
   - Track how often interactions are gated out (not available) and why.
3. Editor tooling:
   - In world/NPC editors:
     - Show per‑NPC interaction definitions and their conditions.
     - Allow designers to simulate “if I click this now, what happens?” with preview deltas.
4. Debug overlays:
   - For testing builds, show current interaction options and why some are disabled (relationship too low, wrong time, NPC busy, etc.).

**Status:** ☐ Not started

---

## Success Criteria

By the end of Task 17:

- Designers can:
  - Define reusable `NpcInteractionDefinition`s per world and NPC.
  - Preview which interactions are available for a given NPC in specific relationship/mood/behavior contexts.
  - See how interactions impact relationships, flags, and progression.
- Frontend/game‑core can:
  - Build interaction menus and conversation surfaces from a single, canonical interaction API.
  - Execute interactions through a unified backend pipeline that updates session state and launches scenes/generation when appropriate.
- NPC systems can:
  - Use the same interaction model for both player‑initiated and NPC‑initiated interactions.
  - Keep behavior, relationships, and interactions in sync via shared schemas and metrics.
- The system:
  - Respects PixSim7’s JSON‑only schema conventions (no new core tables/columns).
  - Integrates with existing interaction schema, relationship/mood metrics, behavior, and generation pipelines without duplicating logic.

