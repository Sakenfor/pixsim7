# Game Creator Journey & Tooling Overview

> Living document describing how a creator would build a mixed‑genre game in PixSim7, and which tools/systems are involved at each stage.

This is intentionally broad and "toolbox‑first": it describes *lenses* on the experience rather than a rigid wizard or single "happy path". The goal is to keep the design open to different genres (romance, stealth, slice‑of‑life, combat, puzzle, etc.) while still giving creators a clear sense of progression.

---

## Core Editors

PixSim7's workspace is panel‑based and flexible (Dockview + panel registry), similar to Blender's editor system. At the center of this system are two **core editors**—the primary surfaces where creators spend most of their time:

### Game View (Core Runtime Viewport)

- **Implementation:** `apps/main/src/routes/Game2D.tsx`
- **Purpose:** Shows the game as the player sees it—world, HUD, overlays, NPC interactions.
- **Role:** The canonical runtime/play viewport. When you want to see and test your game, this is where you go.
- **Panel metadata:** `coreEditorRole: 'game-view'`

### Flow View (Core Logic/Flow Editor)

- **Implementation:** Scene Graph Editor (`apps/main/src/components/legacy/GraphPanel.tsx`, via `GraphEditorHost`)
- **Purpose:** Design flows—scenes, nodes, choices, transitions, edge effects.
- **Role:** The canonical logic/flow editor. When you want to design what happens in your game, this is where you go.
- **Panel metadata:** `coreEditorRole: 'flow-view'`

### Satellite Editors & Tools

Other panels and tools orbit around these core editors:

- **World Editor:** `GameWorld` for locations, hotspots, world metadata
- **HUD/Overlay Editors:** HUD Designer, HUD Layout Editor, overlay configuration
- **Tool Panels:** World tools, gizmos, dev tools, health/validation, plugin tools, Game Tools catalog

### Workspace Modes

The `EditorContext` tracks the current editing context:

- **`editor.primaryView`:** Which core editor is active (`'game'`, `'flow'`, `'world'`, or `'none'`)
- **`editor.mode`:** Current high-level mode (`'play'`, `'edit-flow'`, `'layout'`, `'debug'`, or `null`)

Workspace presets center different core editors:

- **World & Locations** — World editor-centric
- **Narrative & Flow** — Flow View-centric
- **Playtest & Tuning** — Game View-centric

See `CORE_EDITORS_AND_WORKSPACES_TASK.md` for implementation details.

---

## Phase 1 – Game Shell & Worlds

**What the creator is doing**

- Declaring: “This is my game” → worlds, tone, high‑level structure.
- Deciding what *kinds* of play exist (romance, stealth, slice‑of‑life, quests, etc.) at a high level, not per‑scene.

**Key systems & files**

- Worlds & locations:
  - Backend: `pixsim7/backend/main/api/v1/game_worlds.py`
  - Frontend: `apps/main/src/routes/GameWorld.tsx`
  - Types: `@pixsim7/shared.types` (`GameWorldDetail`, `GameLocationDetail`, etc.)
- Game engine session + flags:
  - `packages/game/engine/src/session/*`
  - `apps/main/src/lib/game/session.ts`
- Plugin / module system:
  - Backend plugins: `pixsim7/backend/main/plugins/*`
  - Frontend: `apps/main/src/lib/plugins/*`, `apps/main/src/components/PluginManager.tsx`

**Design stance**

- Treat a “game project” as:
  - A set of worlds and locations, plus
  - A set of enabled **modules** (plugins/stat packages/capabilities), not a single hard‑coded genre.
- Modules like `game-romance`, `game-stealth`, quests, etc. should be discoverable and toggleable, but all write into shared state (`GameSession.flags`, `GameSession.stats`, relationships, quests, inventory).

**Checklist – World / project setup**

- [ ] A creator can create/rename/delete worlds from the UI without touching JSON.
- [ ] They can see which “modules” (stealth, romance, quests, etc.) are available and enable/disable them per project/world.
- [ ] There is a simple “game at a glance” summary somewhere (worlds, locations, main scene graph, key stat packages).

---

## Phase 2 – Spaces: Locations, HUD, and Overlays

**What the creator is doing**

- Defining spaces where play happens:
  - Backgrounds, camera framing, hotspots, NPC slots.
- Deciding what belongs on screen for each type of space:
  - Exploration HUD, dialogue HUD, “tension” or stealth HUD, mini‑game layouts, etc.

**Key systems & files**

- Locations and hotspots:
  - API: `apps/main/src/lib/api/game.ts` (`listGameLocations`, `getGameLocation`, `saveGameLocationHotspots`, etc.)
  - Editor: `apps/main/src/routes/GameWorld.tsx` (Hotspots tab)
- NPC placement & 2D layout:
  - `apps/main/src/components/NpcSlotEditor.tsx`
  - `apps/main/src/lib/game/slotAssignment.ts`
- HUD & overlays:
  - `apps/main/src/lib/overlay/*`
  - `apps/main/src/components/hud/*`
  - `apps/main/src/components/game/HudLayoutEditor.tsx`
  - `apps/main/src/components/panels/HudDesignerPanel.tsx`

**Design stance**

- Keep “space configuration” as data + HUD/overlay presets per world/location:
  - World UI config / view mode is responsible for picking a HUD profile, not hard‑coded logic per genre.
- Present HUDs and overlays as **composable widgets**:
  - A romance game and a stealth game should both use the same overlay primitives (meters, banners, notifications) with different presets, not different code paths.

**Checklist – Spaces & HUD**

- [ ] A creator can choose a background for a location and immediately see it in Game2D.
- [ ] They can pick or customize a HUD preset per world/location without understanding the overlay internals.
- [ ] They can add common widgets (relationship meter, stealth meter, quest log, inventory band, etc.) without writing code, ideally from a catalog of HUD widgets.

---

## Phase 3 – Flows: Scenes and Graphs

**What the creator is doing**

- Designing *flows* of play:
  - Dialogue, choices, checks, minigames, transitions between locations/scenes.
- Attaching *effects* to those flows:
  - Relationship changes, quest updates, inventory changes, time progression, stat updates.

**Key systems & files**

- Scene graph store:
  - `apps/main/src/stores/graphStore/*` (multi‑scene architecture)
- Graph editor surfaces:
  - Legacy/core: `apps/main/src/components/legacy/GraphPanel.tsx` + `GraphPanelWithProvider`
  - Registry: `apps/main/src/lib/graph/editorRegistry.ts`
  - Registration: `apps/main/src/lib/graph/registerEditors.ts`
- Scene conversion:
  - `GraphState.toRuntimeScene` in `graphStore/index.ts`
  - Consumed by `ScenePlayer` (`packages/game/components/src/components/ScenePlayer.tsx`)
- Edge effects:
  - **New:** `apps/main/src/components/panels/tools/EdgeEffectsPanel.tsx`
  - Engine helpers: `@pixsim7/game.engine` (`createRelationshipEffect`, `createArcEffect`, `createQuestEffect`, `createInventoryEffect`, `validateEffect`, `formatEffect`, etc.)

**Design stance**

- Treat the graph editor as the **game flow composer**:
  - Node types represent generic building blocks (interaction, condition, scene call, return, etc.).
  - Effects on edges and nodes encode “what this path does” to the world/session, regardless of genre.
- Avoid encoding genre semantics directly into node types:
  - Instead, use stat packages and effects to say “this choice increases stealth suspicion” or “this branch advances romance arc X”.

**Checklist – Flows & effects**

- [ ] A creator can connect nodes and preview the resulting sequence in the ScenePlayer without touching code.
- [ ] They can attach “when this path is taken, adjust X/Y/Z stats” via a generic EdgeEffects UI (relationship, arc, quest, inventory).
- [ ] There is (or will be) a way to see a **summary of effects** for a scene: which stats, arcs, quests, and inventory items it touches.

---

## Phase 4 – Interactions: Hotspots, Slots, Presets

**What the creator is doing**

- Binding flows and systems to tangible touchpoints:
  - Clicking a hotspot, talking to an NPC, entering a room, completing a minigame.
- Reusing interaction patterns:
  - “Talk to NPC in romantic context”, “attempt stealth action”, “trigger puzzle”, “start or complete quest”.

**Key systems & files**

- Hotspots:
  - Data: `GameHotspotDTO` in `@pixsim7/shared.types`
  - Editor: `apps/main/src/routes/GameWorld.tsx` (Hotspots tab)
  - Schema: `apps/main/src/lib/game/interactionSchema.ts` → `@pixsim7/game.engine` (`HotspotAction`, `ScenePlaybackPhase`, etc.)
- NPC slots:
  - `apps/main/src/components/NpcSlotEditor.tsx`
  - Uses presets/playlists and slot assignment helpers.
- Interaction presets:
  - `apps/main/src/components/game/InteractionPresetEditor.tsx`
  - `apps/main/src/components/game/panels/InteractionPresetUsagePanel.tsx`
  - `apps/main/src/lib/game/interactions/*` (registry, presets, executor, session adapter)

**Design stance**

- Treat **interaction presets** as the user‑facing “verbs”:
  - Each preset encapsulates engine behavior + plugin calls + effects on session state.
- Hotspots and slots are **binding points**:
  - They reference presets or actions and provide local context (which NPC, which location, which node).
- Genre differences (romance vs stealth vs puzzle) show up as:
  - Which preset is chosen, and which stat packages it uses, not as separate hard‑coded UIs.

**Checklist – Interactions & presets**

- [ ] A creator can choose “what happens here” (on a hotspot or slot) from a list of presets, configure a few fields, and be done.
- [ ] The same preset can be applied to an NPC slot in one location and a hotspot in another, and still make sense.
- [ ] When inspecting a hotspot/slot, it’s clear which preset is attached and which stat packages (relationships, stealth, quests, etc.) it depends on.

---

## Phase 5 – Runtime: Sessions, Time, Mixed Genres

**What the creator is doing**

- Seeing the game **run**:
  - Time progresses, NPC presence changes, events fire, stats evolve.
- Confirming that different genres interact sensibly:
  - Stealth flags affect romance, quest progress unlocks minigames, world events change NPC availability, etc.

**Key systems & files**

- Game2D runtime:
  - `apps/main/src/routes/Game2D.tsx`
  - Uses `ScenePlayer` and engine helpers (`assignNpcsToSlots`, `deriveScenePlaybackPhase`, world time helpers, etc.)
- Session & world time:
  - `apps/main/src/lib/game/session.ts`
  - `@pixsim7/game.engine` session helpers for relationships, quests, inventory, events.
- Debugging state:
  - `apps/main/src/stores/gameStateStore.ts` (game state context for plugins/tools)
  - World tools + gizmos: `apps/main/src/lib/worldTools/*`, `apps/main/src/components/gizmos/*`

**Design stance**

- Expose **state** as the common surface:
  - Sessions, flags, relationships, quests, stealth stats, inventory, world time.
- Let genre modules write into this shared state:
  - The UI should surface these as “meters”, “logs”, “overlays”, “debug views” instead of separate game modes.

**Checklist – Runtime & debugging**

- [ ] A creator can inspect current session state (flags, relationships, quests, inventory, world time) while playing Game2D.
- [ ] They can tell which node/edge/interaction just caused a notable state change (even if roughly).
- [ ] There is, or will be, a way to “play from here”:
  - Start Game2D at a specific scene node and world/location context for targeted playtesting.

---

## Phase 6 – Tool Catalog & Discoverability

**What the creator is doing**

- Exploring what’s possible:
  - “What tools do I have to make my game?”
- Turning features on/off:
  - Choosing which systems matter for *this* game (e.g. relationships + stealth, but no combat).

**Key systems & files**

- Plugin catalog and manager:
  - `apps/main/src/components/PluginManager.tsx` (PluginManagerUI)
  - `apps/main/src/lib/plugins/*`
  - Backend plugin manifests under `pixsim7/backend/main/plugins/*`
- Capabilities & registries:
  - `apps/main/src/lib/capabilities/*`
  - `apps/main/src/lib/worldTools/registry.ts`
  - `apps/main/src/components/hud/*`
  - `apps/main/src/lib/overlay/*`

**Design stance**

- Present “tools” at a higher level than raw plugins:
  - **World tools**
  - **HUD widgets / overlays**
  - **Interactions & presets**
  - **Stat packages** (relationships, stealth, quests, skills, etc.)
  - **Gizmos** (debug/visualization surfaces)
- Keep the catalog **genre‑agnostic** but allow filtering:
  - e.g. tags like `romance`, `stealth`, `puzzle`, `combat`, `narrative`, `simulation`.

**Checklist – Tool discoverability**

- [ ] There is a single “Game Tools” surface that lists:
  - Interactions & presets
  - HUD widgets & overlays
  - World tools
  - Stat packages / components
  - Gizmos / debug tools
- [ ] For each tool, the creator can see:
  - What it does (description, example),
  - Where it shows up (which panels/routes),
  - Whether it’s enabled for their current game/world.
- [ ] It is easy to add a new tool type (new stat package or interaction) without restructuring the overall UX.

---

## How to Use This Document

- Treat these phases as **lenses**, not strict steps:
  - A creator will bounce between Worlds, Graphs, Game2D, and Presets.
- When adding features:
  - Ask which phase they primarily support,
  - Ensure they appear in the right “toolbox”:
    - World/space, Flow, Interaction, HUD/overlay, Runtime, or Tool Catalog.
- When simplifying:
  - Prefer making existing tools easier to discover and compose,
  - Avoid adding tightly scoped flows that only serve a single genre.

This doc can grow side‑docs for each phase (e.g. `PHASE_2_SPACES_NOTES.md`, `PHASE_4_INTERACTIONS_EXAMPLES.md`) under this same folder if we need deeper dives.

