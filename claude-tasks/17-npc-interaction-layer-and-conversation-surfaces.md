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

**Status:** ✅ Complete

---

## Phase 17.1 Inventory Summary

### 1. Current Interaction Types

#### A. Hotspot-Based Interactions (`packages/game-core/src/interactions/hotspot.ts`)

**Types:**
- `play_scene`: Triggers a scene via `GameHotspot.linked_scene_id` or explicit `scene_id`
- `change_location`: Moves player to a different `GameLocation`
- `npc_talk`: Initiates conversation with an NPC (placeholder implementation)

**Schema:** Stored in `GameHotspot.meta.action` as untyped JSON, parsed on the client.

**Limitations:**
- No relationship/intimacy gating
- No NPC behavior/availability integration
- No structured outcome tracking
- Client-side only schema validation

#### B. Plugin-Based Slot Interactions (`frontend/src/lib/game/interactions/`)

**Architecture:**
- Registry-based plugin system with LRU caching
- Each plugin defines config schema, execution logic, availability checks
- Presets system for reusable configurations
- Stored in `NpcSlot2d.interactions` as `Record<string, BaseInteractionConfig>`

**Current Plugins:**
- `talk`: Opens dialogue UI
- `pickpocket`: Stealth mechanic with success/detection chances
- `persuade`: Relationship-based skill checks
- `giveItem`: Inventory-based gifting
- `sensualize`: Intimacy-gated interactions

**Key Features:**
- Optimistic session updates with backend validation
- Auto-generated UI from config fields
- Preset libraries (global + per-world) with usage tracking
- Context-aware suggestions based on NPC roles/world tags
- Conflict detection for incompatible presets

**Request/Response Shapes:**
```typescript
// Plugin execution context
interface InteractionContext {
  state: { assignment, gameSession, sessionFlags, relationships, worldId, worldTime, ... }
  api: { getSession, updateSession, attemptPickpocket, getScene }
  session: SessionHelpers  // High-level helpers for flags/inventory/arcs
  onSceneOpen, onSessionUpdate, onError, onSuccess
}

// Plugin result
interface InteractionResult {
  success: boolean
  message?: string
  data?: unknown
}
```

**Session Updates:**
- `GameSession.flags`: Nested JSON for arcs, quests, events, NPC state
- `GameSession.relationships`: Per-NPC relationship metrics (affinity, trust, chemistry, tension)
- Updates via `updateGameSession(id, { flags, relationships })`

**Storage:**
- World presets: `GameWorld.meta.interactionPresets`
- Global presets: `localStorage:pixsim7:global-interaction-presets`
- Usage stats: `localStorage:pixsim7:preset-usage-stats`

#### C. Dialogue & Generation (`pixsim7_backend/api/v1/game_dialogue.py`)

**Endpoints:**
- `POST /next-line`: Builds LLM prompt from narrative context
- `POST /next-line/execute`: Generates dialogue with caching + memory/emotion integration
- `POST /next-line/debug`: Full context dump for prompt debugging

**Narrative Context Assembly:**
```python
context = engine.build_context(
    world_id, session_id, npc_id,
    world_data, session_data, npc_data,
    location_data, scene_data, player_input
)
# Includes: relationship state, intimacy level, mood, arcs, time, location
```

**Integration with NPC Systems:**
- **Memory**: Recent conversation history (last 3-5 exchanges)
- **Emotions**: Current emotional state + dialogue modifiers
- **Milestones**: Relationship tier changes trigger milestone creation
- **Personality Evolution**: Milestones can adjust NPC traits over time
- **World Events**: Context-aware event references in dialogue

**Caching Strategy:**
- Smart cache keys: `hash(npc_personality + relationship_state + player_input)`
- Default TTL: 1 hour
- Analytics tracking: hit rate, cost savings, generation time

**Outcome Effects:**
- Creates `NpcMemory` records (short/long-term)
- Updates `NpcEmotionalState` (intensity, duration, triggers)
- Tracks `DialogueAnalytics` (costs, quality metrics, engagement)

#### D. Action Blocks & Visual Generation (`pixsim7_backend/domain/narrative/action_blocks/`)

**Purpose:** Structured prompts for video/image generation in intimate/narrative scenes.

**Types:**
- `SingleStateBlock`: Motion from one reference image (image-to-video)
- `TransitionBlock`: Smooth morphing between 2-7 reference images

**Selection API:**
```python
POST /actions/select
{
  locationTag, pose, intimacy_level, mood,
  branchIntent: "escalate" | "cool_down" | "maintain" | ...,
  leadNpcId, partnerNpcId, requiredTags, excludeTags
}
→ Returns matched blocks with compatibility score + resolved images
```

**Generation API:**
```python
POST /actions/generate
{
  concept_type: "creature_interaction" | "position_maintenance" | ...,
  parameters: { creature_type, character_name, intensity, ... },
  content_rating, duration, previous_segment
}
→ Dynamically generates action block from templates
```

**Branch Intents:** Narrative direction control (`ESCALATE`, `COOL_DOWN`, `SIDE_BRANCH`, `MAINTAIN`, `RESOLVE`)

**Storage:**
- Block library: JSON files in `domain/narrative/action_blocks/`
- Generated blocks: Cached in `GameWorld.meta` or dedicated cache table

---

### 2. How They Update State

#### Session Flags (`GameSession.flags`)

**Current Structure (from types):**
```typescript
interface SessionFlags {
  sessionKind: 'world' | 'scene'
  world?: {
    id: string
    mode: 'turn_based' | 'real_time'
    turnNumber?: number
    turnHistory?: TurnRecord[]
    turnDeltaSeconds?: number
    currentLocationId?: number
  }
  arcs?: Record<string, ArcProgress>      // { "arc:romance_alex": { stage: 2, seenScenes: [123] } }
  quests?: Record<string, QuestState>     // { "quest:find_sword": { status: "active", steps: 3 } }
  events?: Record<string, EventState>     // { "event:festival": { active: true, triggeredAt: ... } }
  npcs?: Record<string, NpcSessionState>  // { "npc:123": { state: {...}, interactions: {...} } }
}
```

**Update Pattern:** Plugins use `SessionHelpers` → optimistic UI update → backend validation → server truth applied.

#### Relationships (`GameSession.relationships`)

**Current Structure:**
```typescript
Record<string, {
  affinity: number       // 0-100, general fondness
  trust: number          // 0-100, reliability/honesty
  chemistry: number      // 0-100, romantic/sexual attraction
  tension: number        // 0-100, conflict/friction
  lastInteractionAt?: string
  custom?: Record<string, unknown>
}>
// Keys: "npc:<id>" or "npc:<name>" or custom identifiers
```

**Computed Metrics:**
- **Relationship Tier**: `stranger → acquaintance → friend → close_friend → lover → soulmate`
- **Intimacy Level**: Derived from chemistry + affinity + trust via world-defined schema

**Update Sources:**
- Direct deltas from interactions (e.g., `persuade` plugin)
- Dialogue outcomes (relationship milestone detection)
- Scene/quest progression hooks

---

### 3. NPC Identity: IDs vs Roles

#### Current Usage

**By NPC ID:**
- Dialogue endpoints: `npc_id: int` (required, database primary key)
- Slot assignments: `assignment.npcId: number` (specific NPC instance)
- Relationships: `"npc:<id>"` keys in `GameSession.relationships`
- Memory/emotions: `npc_id: int` FK to `GameNPC`

**By Role:**
- World NPC mappings: `GameWorld.meta.npcs: Record<role, npcId>`
  - Example: `{ "role:shopkeeper": 456, "role:guard": 789 }`
- Slot filters: `NpcSlot2d.roleFilter?: string` (match role instead of specific ID)
- Scene roles: `SceneNode.meta.speakerRole?: string` (generic role, resolved at runtime)

**Hybrid Approach:**
- `getWorldNpcRoles(world)` extracts role mappings
- `assignNpcsToSlots(slots, presences, npcRoles)` resolves roles → IDs
- Interactions execute against concrete `npcId` (roles are pre-resolved)

**Missing:**
- No generic role-based interaction definitions (all are NPC-ID-specific once resolved)
- No fallback/default interactions for "any NPC of role X"

---

### 4. Integration Gaps

**What's Missing for a Unified Interaction Layer:**

1. **No canonical NPC interaction model** that bridges:
   - Hotspot actions (scene-centric)
   - Slot plugin interactions (NPC-centric)
   - Dialogue flows (narrative-centric)
   - Action blocks (visual generation-centric)

2. **Gating is ad-hoc:**
   - Plugins have `isAvailable(context)` but no shared gating schema
   - No relationship tier requirements
   - No NPC behavior/activity integration (Task 13 schedules exist but aren't checked)
   - No mood-based filtering

3. **Outcomes are plugin-specific:**
   - Dialogue creates memories/emotions
   - Pickpocket updates flags/inventory
   - No unified "interaction outcome" contract

4. **No NPC-initiated interactions:**
   - All interactions are player-triggered
   - NPC behavior system (Task 13) can't "offer" interactions proactively

5. **No cross-surface consistency:**
   - 2D hotspots vs 3D interactions use different schemas
   - Editor tooling defines interactions differently than runtime

**What Works Well:**

1. **Plugin registry + presets** (Phase 1-10 complete):
   - Flexible, extensible architecture
   - Great designer UX (presets, suggestions, conflict detection)
   - Usage analytics

2. **Session helpers abstraction:**
   - Clean API for state manipulation
   - Optimistic updates with rollback

3. **Narrative context assembly:**
   - Comprehensive NPC/world/relationship context
   - Already integrates memory, emotions, milestones

4. **Action blocks:**
   - Well-structured visual generation pipeline
   - Branch intent concept is reusable

---

### 5. Recommended Next Steps

**Phase 17.2 (Canonical Model):**
- Build `NpcInteraction` types on TOP of existing plugin system
- Reuse `BaseInteractionConfig` + extend with gating/outcome metadata
- Align with action block `BranchIntent` concept

**Phase 17.3 (Gating):**
- Centralize availability logic currently scattered in `plugin.isAvailable()`
- Integrate NPC behavior state from `GameSession.flags.npcs["npc:<id>"].state`
- Use relationship tiers from narrative engine

**Phase 17.4 (UI):**
- Unify hotspot actions + slot interactions into single menu builder
- Reuse existing `InteractionContext` + `SessionHelpers`

**Phase 17.5 (Execution):**
- Wrap plugin execution with unified outcome tracking
- Link to dialogue/action block generation when appropriate

**Phase 17.6 (NPC-Initiated):**
- Add `interactionInbox` to `GameSession.flags`
- Let NPC behavior emit interaction intents

**Phase 17.7 (Tooling):**
- Extend existing preset system with debug overlays
- Reuse analytics from dialogue system

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

**Status:** ✅ Complete

**Implementation:**
- TypeScript types: `packages/types/src/interactions.ts`
- Pydantic schemas: `pixsim7_backend/domain/game/npc_interactions.py`

**Key Design Decisions:**
1. Built on top of existing plugin system (extends `BaseInteractionConfig`)
2. Reused `BranchIntent` concept from action blocks
3. Comprehensive gating schema (relationship, mood, behavior, time, flags)
4. Unified outcome schema (relationships, flags, inventory, NPC effects, scenes, generation)
5. Storage in GameWorld.meta and GameSession.flags (no new DB tables)
6. Support for both player-initiated and NPC-initiated interactions
7. Full TypeScript/Pydantic parity for API compatibility

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

**Status:** ✅ Complete

**Implementation:**
- Backend gating logic: `pixsim7_backend/domain/game/interaction_availability.py`
- API endpoint: `pixsim7_backend/api/v1/npc_interactions.py`
- Route plugin: `pixsim7_backend/routes/npc_interactions/`
- Client API: `frontend/src/lib/api/interactions.ts`

**Key Features:**
1. **Comprehensive gating checks:**
   - Time of day (periods and hour ranges)
   - Relationship (tiers, affinity, trust, chemistry, tension, intimacy level)
   - NPC behavior (state, activity, simulation tier)
   - Mood/emotions (tags and intensity thresholds)
   - Session flags (arcs, quests, events)
   - Cooldowns

2. **Integration with existing systems:**
   - Relationship data from `GameSession.relationships`
   - NPC state from `GameSession.flags.npcs["npc:<id>"]`
   - World tier ordering from `GameWorld.meta.relationships.tiers`
   - Behavior state from Task 13 system

3. **Clear disabled reasons:**
   - Enum-based reason codes (`DisabledReason`)
   - Human-readable messages for UI display
   - Includes current values when applicable

4. **Flexible filtering:**
   - By NPC ID or role patterns
   - Optional inclusion of unavailable interactions (for debugging)
   - Priority-based sorting

5. **Pure, testable functions:**
   - No DB dependencies in core gating logic
   - Easy to unit test
   - Context snapshot pattern for reproducibility

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

**Status:** ✅ Complete

**Implementation:**
- React hook: `frontend/src/lib/hooks/useNpcInteractions.ts`
- UI components: `frontend/src/components/interactions/InteractionMenu.tsx` + `.css`
- Menu builder: `packages/game-core/src/interactions/menuBuilder.ts`
- Component exports: `frontend/src/components/interactions/index.ts`

**Key Features:**
1. **useNpcInteractions hook:**
   - Fetches interactions from API
   - Auto-refetch on dependency changes
   - Splits into available/unavailable
   - Error handling and loading states

2. **InteractionMenu component:**
   - Displays list of interactions
   - Shows disabled reasons as tooltips
   - Supports compact mode (maxVisible)
   - Loading/empty states
   - Responsive design

3. **InlineInteractionHint component:**
   - Compact HUD display for 2D
   - Shows primary interaction with key hint
   - Minimal footprint

4. **Unified menu builder:**
   - Consolidates hotspot actions, slot plugins, and canonical interactions
   - Surface-based filtering and grouping
   - Priority-based sorting
   - Migration helper for legacy slot interactions
   - Helpers: getPrimaryInteraction, hasDialogueInteractions, etc.

5. **Cross-surface support:**
   - inline: Quick HUD actions
   - dialogue: Opens conversation UI
   - scene: Triggers scene transition
   - notification: Background events
   - menu: Context menu display

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

**Status:** ✅ Complete

**Implementation:**
- Backend execution: `pixsim7_backend/domain/game/interaction_execution.py`
- API endpoint: `pixsim7_backend/api/v1/npc_interactions.py` (POST /execute)
- Client API: `frontend/src/lib/api/interactions.ts` (executeInteraction)

**Key Features:**
1. **Unified execution pipeline:**
   - Validates availability before execution
   - Applies all outcome effects atomically
   - Tracks cooldowns automatically
   - Persists changes to database

2. **Outcome effects:**
   - Relationship deltas (affinity, trust, chemistry, tension with clamping)
   - Flag changes (set, delete, increment, arc stages, quest updates, events)
   - Inventory changes (add/remove items with quantities)
   - NPC effects (memory creation, emotion triggers, world event registration)
   - Scene launches (with intent mapping from world meta)
   - Generation launches (dialogue and action blocks)

3. **Session updates:**
   - All changes applied to GameSession.relationships and GameSession.flags
   - Last interaction timestamp tracked
   - Cooldown timestamps stored per interaction

4. **Integration:**
   - Scene intent → scene ID mapping from GameWorld.meta
   - Pending dialogue/action block requests stored in session flags
   - Returns updated session state to client

5. **Error handling:**
   - 400 if interaction not available
   - 404 if world/session/NPC/interaction not found
   - Clear error messages with reasons

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

**Status:** ✅ Foundation Complete (Ready for Integration)

**Foundation Provided:**
- Schema ready: `NpcInteractionIntent` in `packages/types/src/interactions.ts`
- Storage ready: `InteractionInbox` type for `GameSession.flags.interactionInbox`
- Session state: `SessionInteractionState` with `pendingFromNpc` array

**Integration Points:**
1. **NPC Behavior System (Task 13):**
   - Behavior scripts can emit `NpcInteractionIntent` objects
   - Intents stored in `GameSession.flags.interactionInbox`
   - UI polls inbox and displays notifications/prompts

2. **Interaction Definition:**
   - `npcCanInitiate: boolean` flag in `NpcInteractionDefinition`
   - Filters which interactions NPCs can start

3. **Example Flow:**
   ```python
   # In NPC behavior tick:
   if should_greet_player():
       intent = NpcInteractionIntent(
           id=f"greet:{npc_id}:{timestamp}",
           npcId=npc_id,
           definitionId="interaction:casual_greeting",
           createdAt=timestamp,
           expiresAt=timestamp + 300,  # 5 min expiry
           priority=5,
           preferredSurface="dialogue"
       )
       session.flags.interactionInbox.append(intent)
   ```

4. **Frontend Display:**
   - Poll `GameSession.flags.interactionInbox`
   - Show as notifications or conversation prompts
   - Player can accept (execute interaction) or dismiss

**Next Steps for Full Implementation:**
- Add inbox polling to frontend session manager
- Create UI components for displaying NPC-initiated interaction prompts
- Implement inbox cleanup (remove expired/completed intents)
- Add behavior hooks for common NPC initiation triggers

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

**Status:** ✅ Foundation Complete (Built-in Observability)

**Built-in Features:**
1. **Structured Disabled Reasons:**
   - Every unavailable interaction has `disabledReason` enum + `disabledMessage` string
   - UI components show tooltips with exact reason (e.g., "Requires affinity 70+ (current: 45)")
   - Aids debugging during testing

2. **Execution Response:**
   - `ExecuteInteractionResponse` includes all applied changes:
     - `relationshipDeltas`: Exact changes to metrics
     - `flagChanges`: List of all modified flags
     - `inventoryChanges`: Added/removed items
     - `launchedSceneId`, `generationRequestId`: Links to follow-up actions
   - Enables post-execution inspection

3. **Context Snapshot:**
   - `InteractionContext` captures all gating state (relationship, mood, flags, timestamps)
   - Attached to each `NpcInteractionInstance`
   - Allows reproducible debugging ("Why was this disabled at this moment?")

4. **Debug Query Support:**
   - `includeUnavailable: true` in `/list` endpoint shows ALL interactions with reasons
   - Useful for testing/debugging interaction visibility

**Recommended Tooling Additions:**
- Add structured logging to execution pipeline (world/session/NPC IDs, definition ID, outcome summary)
- Create editor preview mode (simulate execution without persisting to DB)
- Build analytics dashboard for interaction usage metrics
- Add debug overlay component showing all interactions + gating state in real-time

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

