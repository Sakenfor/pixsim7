# Task 13 – NPC Behavior System: Activities & Routine Graphs

## Context

This task designs the core **NPC behavior system** for PixSim7, building on:

- `claude-tasks/05-simulation-playground-for-npc-brain-and-world.md`
- `claude-tasks/08-social-metrics-and-npc-systems.md`
- `claude-tasks/09-intimacy-and-scene-generation-prompts.md`
- `claude-tasks/14-unified-mood-and-brain-integration.md`

Current state:

- Relationships, intimacy, mood, and generation are defined and partially integrated.
- Worlds and sessions already use JSON-based `meta`, `flags`, and `relationships` (see `docs/RELATIONSHIPS_AND_ARCS.md`).
- There is no unified, data-driven **daily routine + activity selection system** for NPCs.

**Goal:** introduce a **graph-based, preference-driven NPC behavior system** that:

- Uses **activities**, **NPC preferences**, and a **routine graph** to drive behavior.
- Produces **emergent behavior** from simple, tunable rules.
- Integrates cleanly with relationships, mood, scenes, and the generation pipeline.
- Follows PixSim7 conventions: strictly JSON-backed, world-agnostic, and editor-driven.

**Important constraints (from AGENTS):**

- Do **not** add new DB tables or core columns (`GameWorld`, `GameLocation`, `GameHotspot`, `GameScene`, `GameSession`, `GameNPC` stay generic).
- Extend behavior via JSON fields: `meta`, `flags`, `relationships` only.
- Scenes remain world-agnostic; worlds bind NPCs/roles at runtime.

---

## High-Level Design

### Core Philosophy

- **Graph-based**: designers author **Routine Graphs** (time slots + decisions + activity weights) in a visual editor, similar to the scene graph tooling.
- **Preference-driven**: each NPC has **preferences** (per-activity, per-category, personality traits) that modulate choices.
- **Emergent**: behavior comes from scoring feasible activities based on context, not hard-coded scripts.
- **Stateful but lightweight**: long-term structure lives in world/NPC meta; per-playthrough state lives in `GameSession.flags` and `GameSession.relationships`.

### Key Concepts

1. **Activity Catalog** – reusable templates defining what NPCs can do.
2. **NPC Preferences** – what each NPC likes/dislikes, stored per-world/per-NPC.
3. **Routine Graph** – time-based, conditional graph controlling which activities are considered when.
4. **Activity Resolution** – per-tick scoring and selection logic.
5. **Integration Layer** – mapping activities to relationships, mood, scenes, and generation.
6. **Editors and Simulation Tools** – Activity Catalog Editor, Routine Graph Editor, NPC Preference Editor, and a “simulate one day” playground.

---

## Data Model & Storage (JSON-Only)

All new behavior data is stored in existing JSON fields:

- **World-level config**: `GameWorld.meta.behavior`
- **NPC-level config**: `GameNPC.meta.behavior`
- **Session state**: `GameSession.flags` and `GameSession.relationships`

### 1. Activity Templates

Activities describe reusable “things NPCs can do”.

**TypeScript (packages/types, sketch):**

```ts
export type ActivityCategory = 'work' | 'social' | 'leisure' | 'routine' | 'quest';

export interface ActivityRequirements {
  locationTypes?: string[];           // e.g. ["office", "shop"]
  requiredNpcRolesOrIds?: string[];   // e.g. ["role:friend", "npc:alex"]
  minEnergy?: number;                 // 0–100
  moodTags?: string[];                // e.g. ["playful", "focused"]
  timeOfDay?: Array<'morning' | 'afternoon' | 'evening' | 'night'>;
}

export interface RelationshipDelta {
  affinity?: number;
  trust?: number;
  chemistry?: number;
  tension?: number;
}

export interface ActivityEffects {
  energyDeltaPerHour?: number;
  moodImpact?: { valence: number; arousal: number };
  relationshipChanges?: Record<string, RelationshipDelta>; // key: "npc:<id>" or "role:<key>"
  flagsSet?: Record<string, unknown>;                      // e.g. { "arc:job_promotion.completed": true }
}

export interface ActivityVisualMeta {
  animationId?: string;
  dialogueContext?: string;           // "at_work", "eating", "flirting"
  actionBlocks?: string[];            // IDs passed to generation / action block system
  sceneIntent?: string;               // high-level label, not hard scene IDs
}

export interface Activity {
  id: string;                         // "activity:work_office"
  name: string;
  category: ActivityCategory;

  requirements?: ActivityRequirements;
  effects?: ActivityEffects;
  visual?: ActivityVisualMeta;

  // Simulation tuning
  minDurationSeconds?: number;        // avoid rapid thrashing
  cooldownSeconds?: number;           // avoid repeating too often

  meta?: Record<string, unknown>;
}
```

**Storage:**

- `GameWorld.meta.behavior.activities: Record<string, Activity>`
  - Keys are activity IDs (e.g. `"activity:work_office"`).
  - World authors configure these via Activity Catalog Editor.

### 2. NPC Preferences

Per-NPC configuration for what they like/dislike.

```ts
export interface NpcTraitModifiers {
  extraversion?: number;      // 0–100
  conscientiousness?: number;
  openness?: number;
}

export interface NpcPreferences {
  // Per-activity weights (0.0–1.0). Missing entries default to a neutral baseline.
  activityWeights?: Record<string, number>;

  // Category weights (0.0–1.0).
  categoryWeights?: {
    work?: number;
    social?: number;
    leisure?: number;
    routine?: number;
    quest?: number;
  };

  // Relationship / location preferences
  preferredNpcIdsOrRoles?: string[];   // e.g. ["npc:alex", "role:best_friend"]
  avoidedNpcIdsOrRoles?: string[];
  favoriteLocations?: string[];       // e.g. ["location:cafe", "location:park"]

  // Time-of-day preferences
  morningPerson?: boolean;
  nightOwl?: boolean;

  // Personality traits
  traitModifiers?: NpcTraitModifiers;
}
```

**Storage:**

- Defaults at NPC level:
  - `GameNPC.meta.behavior.preferences: NpcPreferences`
- World-level presets / archetypes (optional):
  - `GameWorld.meta.behavior.presets.npcPreferences: Record<string, NpcPreferences>`
- Per-session overrides (temporary changes, arc-driven):
  - `GameSession.flags.npcs["npc:<id>"].preferences: NpcPreferences`

### 3. Routine Graph

Routine graphs describe **when** and **under which conditions** certain activities are considered.

#### Condition DSL (shared across behaviors)

Simple, composable condition language reused across behaviors:

```ts
export type Condition =
  | { type: 'relationship_gt'; npcIdOrRole: string; metric: 'affinity' | 'trust' | 'chemistry' | 'tension'; threshold: number }
  | { type: 'flag_equals'; key: string; value: unknown }
  | { type: 'mood_in'; moodTags: string[] }
  | { type: 'energy_between'; min: number; max: number }
  | { type: 'random_chance'; probability: number }             // 0–1
  | { type: 'time_of_day_in'; times: Array<'morning' | 'afternoon' | 'evening' | 'night'> }
  | { type: 'custom'; id: string; meta?: Record<string, unknown> }; // for future extension
```

#### Routine graph structures

```ts
export type RoutineNodeType = 'time_slot' | 'decision' | 'activity';

export interface RoutineNode {
  id: string;
  nodeType: RoutineNodeType;

  // Time window (for time_slot nodes)
  timeRangeSeconds?: { start: number; end: number }; // seconds in game day

  // Activity candidates (for time_slot or activity nodes)
  preferredActivities?: Array<{
    activityId: string;
    weight: number;             // base weight before preferences
    conditions?: Condition[];
  }>;

  // Decision logic (for decision nodes)
  decisionConditions?: Condition[]; // used with edges; node-level default conditions

  meta?: {
    label?: string;
    position?: { x: number; y: number }; // editor layout only
  };
}

export interface RoutineEdge {
  fromNodeId: string;
  toNodeId: string;
  conditions?: Condition[];
  weight?: number;                  // for weighted transitions
  transitionEffects?: ActivityEffects; // optional side-effects on transition
}

export interface RoutineGraph {
  id: string;                       // "routine:shopkeeper_daily"
  name: string;
  nodes: RoutineNode[];
  edges: RoutineEdge[];

  // Optional defaults applied when this routine is used
  defaultPreferences?: Partial<NpcPreferences>;

  meta?: {
    description?: string;
    tags?: string[];                // "work", "casual", "romantic"
  };
}
```

**Storage:**

- `GameWorld.meta.behavior.routines: Record<string, RoutineGraph>`
- NPC assignment:
  - `GameNPC.meta.behavior.routineId: string | null`
  - Optional per-NPC routine overrides live in `GameNPC.meta.behavior` or `GameSession.flags.npcs["npc:<id>"]`.

### 4. Per-Session NPC State

Dynamic, per-playthrough state lives in `GameSession.flags` and `GameSession.relationships`:

```ts
// Session.flags for NPC state
GameSession.flags.npcs["npc:<id>"] = {
  state: {
    energy: number;                         // 0–100
    currentActivityId?: string;             // "activity:work_office"
    activityStartedAtSeconds?: number;      // world_time when activity started
    nextDecisionAtSeconds?: number;         // world_time when to re-evaluate
    moodState?: { valence: number; arousal: number; tags?: string[] };
  },
  preferences?: NpcPreferences;             // overrides
};

// Session.relationships for relationship metrics remain as defined previously:
GameSession.relationships["npc:<id>"].affinity;
GameSession.relationships["npc:<id>"].trust;
// etc.
```

---

## Activity Resolution & Simulation

### Core Loop

At each relevant tick, the system chooses an activity per NPC:

1. Determine **which NPCs are “active”** (near player or otherwise spotlighted).
2. For each active NPC:
   - Read routine `RoutineGraph` from `GameWorld.meta.behavior.routines`.
   - Read preferences (merged defaults + overrides).
   - Read current NPC state from `GameSession.flags.npcs["npc:<id>"]`.
   - Run `chooseActivity` if `world_time >= nextDecisionAtSeconds`.
   - Apply effects to state and relationships.

### Pseudocode

```ts
function chooseActivity(
  npc: GameNPC,
  world: GameWorld,
  session: GameSession,
  worldTimeSeconds: number
): Activity | null {
  const routineId = npc.meta.behavior?.routineId;
  const routine = world.meta.behavior?.routines?.[routineId ?? ''];
  if (!routine) return null;

  const prefs = mergePreferences(
    routine.defaultPreferences,
    npc.meta.behavior?.preferences,
    session.flags.npcs[`npc:${npc.id}`]?.preferences
  );

  const npcState = session.flags.npcs[`npc:${npc.id}`]?.state ?? {};

  const node = findActiveNode(routine, worldTimeSeconds, npcState);
  if (!node) return null;

  const candidates = collectCandidateActivities(node, world, session, npc, npcState);
  const feasible = candidates.filter((c) => meetsRequirements(c.activity, npc, world, session, npcState));
  if (!feasible.length) {
    return fallbackActivityOrNull(npcState, node);
  }

  const scored = feasible.map((c) => ({
    activity: c.activity,
    score: calculateScore(c.activity, prefs, npcState, world, session),
  }));

  return weightedRandomChoice(scored);
}
```

### Scoring (Conceptual)

`calculateScore` should be:

- **Simple enough** that designers can reason about it.
- **Composable** so preferences, traits, and context all matter.

Example structure (conceptual, not final code):

```ts
score =
  baseWeight                               // from routine graph
  * activityWeight(activity.id)            // NPC-specific preference
  * categoryWeight(activity.category)      // work/social/leisure, etc.
  * traitMultiplier(activity, traits)      // extraversion, etc.
  * moodCompatibilityMultiplier(...)
  * relationshipMultiplier(...)
  * urgencyMultiplier(...)                 // e.g. low energy → boost rest activities
```

Implementation details:

- Clamp scores and ensure they never all become 0.
- Add mild “inertia” so NPCs don’t flip activities every decision tick.
- Respect `minDurationSeconds` and `cooldownSeconds` from the activity.

---

## Integration with Existing Systems

### Relationship & Arc System

- **Activity effects** update `GameSession.relationships`:
  - `ActivityEffects.relationshipChanges` is translated into changes to:
    - `relationships["npc:<id>"].affinity`
    - `relationships["npc:<id>"].trust`
    - `relationships["npc:<id>"].chemistry`
    - `relationships["npc:<id>"].tension`
- Arcs can temporarily steer behavior by:
  - Adjusting preferences in `GameSession.flags.npcs["npc:<id>"].preferences`.
  - Setting flags that affect Condition DSL (e.g. `arc:main_job_promotion.stage`).

### Mood System

- **Requirements**: activities can require mood tags (e.g. `"playful"`, `"exhausted"`).
- **Effects**: activities push mood valence/arousal in directions defined by `ActivityEffects.moodImpact`.
- Mood tags used in activities should be consistent with the world’s mood schema and evaluators (see `pixsim7_backend/domain/metrics/mood_evaluators.py`).

### Scenes & Scene Graph

- Activities do **not** hard-code scene IDs.
- Instead, they carry **scene intents** and/or action blocks:
  - `activity.visual.sceneIntent = "romantic_dinner"` (high-level label).
  - `activity.visual.actionBlocks` wire into generation/scene systems.
- World/world-meta and scene definitions decide how intents map to actual `GameScene`/`Scene` graphs and cast roles.

### Generation Pipeline & Action Blocks

- When an activity triggers a generative moment:
  - Construct `GenerationSocialContext` from:
    - Current relationships for involved NPCs.
    - World intimacy/relationship schemas.
    - World/user content rating preferences.
  - Build a `GenerationNodeConfig` using:
    - Activity category, mood state, location, time of day, etc.
  - Submit to unified `/api/v1/generations` endpoint.
- `activity.visual.actionBlocks` provide IDs for reusable prompt / generation templates.

### World Tick System

This task defines the behavioral layer; the **tick transport** is specified in:

- `claude-tasks/05-simulation-playground-for-npc-brain-and-world.md`

Integration:

- World tick handler advances `world.meta.world_time` (or session-local clock).
- Chooses which NPCs to simulate at high resolution (nearby / visible).
- Runs `chooseActivity` only when `world_time >= nextDecisionAtSeconds` for that NPC.
- Writes back updated NPC state & relationships to `GameSession.flags` and `GameSession.relationships`.

---

## Editor & Tooling Plan

### 1. Activity Catalog Editor

UI goals:

- List/filter/search activities by category, tags, and world.
- Edit:
  - Requirements (locations, moods, time-of-day, relationship gates).
  - Effects (relationship deltas, mood impact, flags).
  - Visual meta (animation, dialogue context, action blocks, scene intent).
- Validate:
  - Energy deltas and valence/arousal ranges.
  - Relationship deltas vs world schemas (e.g. caps, step sizes).

Persistence:

- Reads/writes `GameWorld.meta.behavior.activities`.
- Uses Pydantic validators in `pixsim7_backend/domain/game/schemas.py` to enforce structure.

### 2. Routine Graph Editor

UI goals:

- Visual node-graph similar to Scene Graph editor:
  - Node types: `time_slot`, `activity`, `decision`.
  - Edges with conditions and weights.
  - World-time axis preview (e.g. 0–24h timeline view).
- Inspector for:
  - Time ranges (for `time_slot`).
  - Per-node `preferredActivities` with weights and conditions.
  - Decision conditions using the Condition DSL.

Persistence:

- Reads/writes `GameWorld.meta.behavior.routines`.
- Integrates with existing graph components (`GraphPanel`, `SceneBuilderPanel`) where feasible.

### 3. NPC Preference Editor

UI goals:

- Per-NPC view:
  - Sliders for category weights (work/social/leisure/routine/quest).
  - Per-activity overrides for key activities.
  - Preferred / avoided NPCs and locations.
  - Personality traits (extraversion, conscientiousness, openness).
- Preset support:
  - Load and save presets under `GameWorld.meta.behavior.presets.npcPreferences`.

Persistence:

- NPC defaults: `GameNPC.meta.behavior.preferences`.
- Session overrides (for debugging/testing): `GameSession.flags.npcs["npc:<id>"].preferences`.

### 4. Simulation & Debugging Tools

- “Simulate one day” panel:
  - Select world + NPC.
  - Simulate 24 in-game hours with coarse ticks.
  - Show a timeline of chosen activities, energy, mood, and relationship deltas.
- Live debugging overlay:
  - For active NPCs near the player, show current activity, next decision time, key factors affecting the last decision (e.g. top 3 scoring activities).

---

## Phased Implementation Plan

### Phase 13.1 – Data Schemas & Validation

- [ ] Define TS types in `packages/types` for:
  - `Activity`, `ActivityRequirements`, `ActivityEffects`, `NpcPreferences`, `RoutineGraph`, `RoutineNode`, `RoutineEdge`, `Condition`.
- [ ] Add Pydantic schemas and validators in `pixsim7_backend/domain/game/schemas.py`:
  - Validate numeric ranges (0–100 energy, reasonable mood ranges, etc.).
  - Validate RoutineGraph structure (no missing node IDs, no invalid edges, basic cycle sanity checks for time-based nodes).
- [ ] Wire world/NPC meta validation:
  - `GameWorld.meta.behavior.*` and `GameNPC.meta.behavior` validated via existing `GameWorld`/`GameNPC` meta schema validators.

### Phase 13.2 – Core Activity Catalog

- [ ] Add backend helpers:
  - Read/write activities in `GameWorld.meta.behavior.activities`.
  - Compute derived diagnostics (unused activities, inconsistent requirements).
- [ ] Implement minimal Activity Catalog Editor in frontend:
  - List + detail view with validation errors surfaced from backend.
- [ ] Seed a small library of example activities:
  - `activity:work_office`, `activity:socialize_casual`, `activity:eat_meal`, `activity:flirt`, `activity:idle_loiter`.

### Phase 13.3 – Routine Graph Backbone

- [ ] Implement RoutineGraph handling on backend:
  - Pydantic models, validation, helper functions (`findActiveNode`, etc.).
- [ ] Add Routine Graph Editor UI:
  - Basic node types (`time_slot`, `activity`, `decision`) with drag/drop.
  - Persistence to `GameWorld.meta.behavior.routines`.
- [ ] Provide initial routine templates:
  - `routine:shopkeeper_daily`, `routine:student_weekday`, `routine:guard_patrol`, `routine:night_owl`.

### Phase 13.4 – Activity Resolution & Session State

- [ ] Implement `chooseActivity` and scoring helpers in backend domain/service layer:
  - Operates on:
    - `GameWorld.meta.behavior.*`
    - `GameNPC.meta.behavior`
    - `GameSession.flags` and `GameSession.relationships`
- [ ] Add NPC session state helpers:
  - Read/update `GameSession.flags.npcs["npc:<id>"].state`.
- [ ] Integrate with the world tick / simulation task:
  - Simulate a subset of NPCs at a configurable tick interval.
  - Apply `ActivityEffects` to session state and relationships.

### Phase 13.5 – Integration with Mood, Relationships, and Generation

- [ ] Map `ActivityEffects.relationshipChanges` into existing relationship schemas and evaluators.
- [ ] Map mood requirements and effects into unified mood system:
  - Ensure mood tags and valence/arousal semantics match `mood_evaluators`.
- [ ] Implement action block / generation hooks:
  - Activities call into the unified `/api/v1/generations` API using `GenerationNodeConfig` + `GenerationSocialContext`.
  - Ensure all prompts flow through the existing generation pipeline.

### Phase 13.6 – Tooling, Debugging & Polish

- [ ] Add “simulate one day” playground for NPC routines:
  - Fits into the existing simulation playground from Task 05.
- [ ] Add debugging overlays for active NPCs (optional dev-only UI).
- [ ] Add analytics:
  - Count activity usage, common transitions, and decision conflicts.
  - Surface diagnostics to designers (e.g. activities never chosen, conflicting conditions).

---

## Success Criteria

By the end of Task 13:

- Designers can:
  - Define activities and routines per world using the editor tools.
  - Configure per-NPC preferences and see their impact on behavior.
  - Simulate a day in the life of an NPC and observe reasonable, emergent behavior.
- Engineers can:
  - Integrate behavior decisions with relationships, mood, scenes, and generation via well-typed interfaces.
  - Extend the Condition DSL and scoring functions without changing schemas.
- The system:
  - Respects PixSim7’s JSON-only schema conventions.
  - Keeps scenes world-agnostic and leverages world/NPC meta and session state for concrete bindings.

