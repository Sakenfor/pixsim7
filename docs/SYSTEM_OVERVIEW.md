# PixSim7 Game System Overview

**Quick navigation for agents and developers working on the game / world / scene editor / 2D systems.**

This document provides a high-level map of how PixSim7's game systems fit together. For implementation details, follow the links to specialized documentation below.

> **For Agents**
> - Start from `docs/APP_MAP.md`, then read this file before touching game/world/session code.
> - Treat this doc and the referenced files as the **spec**, and the database models/services as the **authority**.
> - When editing game systems, keep scenes world‑agnostic and use session `flags` / `relationships` instead of new schema fields where possible.
> - Related tasks (roadmap/status only):  
>   - `claude-tasks/01-world-hud-layout-designer.md`  
>   - `claude-tasks/02-interaction-presets-and-palettes.md`  
>   - `claude-tasks/03-scene-and-quest-graph-templates.md`  
>   - `claude-tasks/05-simulation-playground-for-npc-brain-and-world.md`

---

## Core Concepts

### Worlds: Locations, Hotspots, and Time

**`GameWorld`** represents a long-lived simulation context:
- Defines a world identifier and configuration (turn-based vs real-time)
- **`meta.relationship_schemas`**: Per-world relationship tier definitions (affinity ranges → tier IDs)
- **`meta.intimacy_schema`**: Per-world intimacy level thresholds (affinity/trust/chemistry/tension → level IDs)
- See `RELATIONSHIPS_AND_ARCS.md` § 2.4 for world-aware relationship normalization

**`GameWorldState`** tracks the current simulation state:
- `world_time` (decimal timestamp for in-world clock)
- Managed via `/api/v1/game/worlds` endpoints

**`GameLocation`** represents a place in the world:
- Physical space with background assets, ambient media
- Contains `GameHotspot` entities (interactable objects)
- Uses `meta.world_id` to indicate which world it belongs to
- Uses `meta.primary_npc_id` to specify the active NPC for that location

**`GameHotspot`** represents an interactable object or trigger:
- Lives inside a `GameLocation`
- Triggers actions via `meta.action` (see `HotspotAction` schema in `HOTSPOT_ACTIONS_2D.md`)
- Can reference a `GameScene` via `linked_scene_id`
- Can specify display modes for 2D/3D presentation (see `GAME_WORLD_DISPLAY_MODES.md`)

**Backend:**
- `/api/v1/game/worlds` (world CRUD + state management)
- `/api/v1/game/locations` (locations CRUD)
- `/api/v1/game/hotspots` (hotspots CRUD)

---

### Sessions: Player Progress and State

**`GameSession`** tracks a single player's progress through a world or scene:
- **`world_id`**: Links session to a `GameWorld` for world-aware relationship normalization (optional)
- **`world_time`**: Synchronized with `GameWorldState.world_time` for life-sim sessions
- **`flags`**: Arbitrary JSON for quest/arc progress, inventory, events
  - Example: `flags.arcs.main_romance_alex.stage = 2`
  - Example: `flags.inventory.items = [{ id: "flower", qty: 1 }]`
  - Example: `flags.world.currentLocationId = 3`
- **`relationships`**: NPC ↔ Player and NPC ↔ NPC affinity/trust/flags
  - Example: `relationships["npc:12"].affinity = 72`
  - Backend automatically computes `tierId` and `intimacyLevelId` using world-specific schemas
  - See `RELATIONSHIPS_AND_ARCS.md` for world-aware normalization details

**Session kinds:**
- **World sessions**: `flags.sessionKind = "world"` – life-sim runs with time progression
- **Scene sessions**: `flags.sessionKind = "scene"` – single-scene progression

**Backend:**
- `/api/v1/game/sessions` (create, get, list)
- `PATCH /api/v1/game/sessions/{id}` (update world_time, flags, relationships)

---

### Scenes: Branching Narrative Graphs

**`GameScene`** (backend entity) + **`Scene`** (runtime type from `@pixsim7/types`):
- Node-based graph for branching narrative flow
- Nodes: `video`, `choice`, `condition`, `mini_game`, `end`
- Edges: Connect nodes with optional conditions and effects
- **World-agnostic**: Scenes are reusable across worlds and locations

**Scene metadata (`Scene.meta`):**
- `cast`: Defines roles (e.g., `"lead"`, `"bartender"`) with optional `defaultNpcId`
- `arc_id`, `tags`: For quest/arc tracking (see `RELATIONSHIPS_AND_ARCS.md`)
- Life-sim effects: Time advancement, relationship changes, flag updates

**Node metadata (`SceneNode.meta`):**
- `speakerRole`: References a role from `Scene.meta.cast`
- `npc_id`: Hard-binds the node to a specific NPC (overrides role resolution)
- `npc_state`: Expression state for UI surfaces (`idle`, `talking`, `waiting_for_player`)
- `lifeSim.advanceMinutes`: How much world time this node advances

**Edge metadata (`SceneEdge`):**
- `conditions`: Flag checks, relationship thresholds, mini-game results
- `effects`: Set/unset flags, update relationships, advance arcs
- `isDefault`: True for default fallback edges

**ScenePlayer** (game-ui component):
- React component that renders scenes with video playback, choices, mini-games
- Exposes `onStateChange(state)` callback for playback phase tracking
- Lives in `@pixsim7/game-ui` package

**Backend:**
- `/api/v1/game/scenes` (scene CRUD)

---

### NPCs: Characters, Schedules, and Expressions

**`GameNPC`** represents a character in the world:
- `personality`: LLM prompt template for AI-driven dialogue (optional)
- `meta.identity`: Contains identity-specific assets and clips
  - Example: `meta.identity.primaryPortraitAssetId = 123`
  - Example: `meta.identity.clips = [{ id: "walk_intro", asset_id: 789 }]`

**`NPCSchedule`** defines where an NPC is at different times:
- `day_of_week`, `start_time`, `end_time`, `location_id`
- Used for presence queries via `/api/v1/game/npcs/presence`

**`NPCState`** tracks runtime NPC state:
- Current location, activity, emotional state
- Primarily for life-sim AI-driven behavior (future)

**`NpcExpression`** defines UI-scale portrait/reaction clips:
- `state`: `idle`, `talking`, `waiting_for_player`, etc.
- `asset_id`: References an image or video asset
- `crop`, `meta`: For positioning and additional data
- **Scope**: Only for small UI surfaces (portraits, dialog boxes, HUD), not full-screen cinematic content

**Character binding model:**
- **Scenes use roles** (`Scene.meta.cast`) – generic, reusable
- **Worlds bind roles to NPCs** via `meta.npc_bindings` on locations/hotspots
- **Nodes can hard-bind** via `SceneNode.meta.npc_id` for identity-specific clips

**Backend:**
- `/api/v1/game/npcs` (NPC CRUD)
- `/api/v1/game/npcs/schedules` (schedule CRUD)
- `/api/v1/game/npcs/presence` (query NPCs by world_time and location)
- `/api/v1/game/npcs/{id}/expressions` (expression CRUD)

---

## Frontend Systems

### 2D Preview: Game2D

**`frontend/src/routes/Game2D.tsx`** – Playtest environment for 2D gameplay:
- Renders a location's background and hotspots
- Handles hotspot clicks via `handlePlayHotspot`:
  - Parses `meta.action` using `parseHotspotAction` (from `@pixsim7/game-core`)
  - Supports: `play_scene`, `change_location`, `npc_talk`
- Opens `ScenePlayer` full-screen for scenes
- Displays NPC portraits based on scene playback phase and `NpcExpression` states
- Syncs `world_time` from `GameWorldState` for life-sim sessions

**Related files:**
- `frontend/src/lib/game/interactionSchema.ts` – Action types and phase derivation
- `frontend/src/lib/game/session.ts` – World time / session helpers

**See:** `HOTSPOT_ACTIONS_2D.md` for hotspot action schema and playback phase mapping.

---

### Scene Editor & Graph: Node-Based Authoring

**`frontend/src/components/GraphPanel.tsx`** – Visual graph editor:
- Drag-and-drop nodes with connection mode
- Port-aware edges (default, success, failure)
- Set start node, rename, delete, duplicate

**`frontend/src/components/SceneBuilderPanel.tsx`** – Property inspector:
- Node-specific configuration forms
- Selection strategy, progression steps, mini-game config
- Cast/role management, NPC binding hints

**`frontend/src/components/nodes/SceneNode.tsx`** – Node component:
- Multiple handles for different edge types
- Visual indicators for node type and metadata

**`frontend/src/modules/scene-builder/index.ts`** – Draft model:
- `DraftScene`, `DraftNode`, `DraftEdge` with editor-only metadata
- `toRuntimeScene()` – Converts draft to compact `@pixsim7/types.Scene`

**`frontend/src/components/WorldContextSelector.tsx`** – World/location context bar:
- Selects the world and location for scene editing context
- Used by scene editor to provide world-aware authoring

**Related packages:**
- `@pixsim7/game-ui` – ScenePlayer component for playback
- `@pixsim7/types` – Shared Scene/Node/Edge types

**See:**
- `NODE_EDITOR_DEVELOPMENT.md` for editor architecture and development roadmap
- `GRAPH_UI_LIFE_SIM_PHASES.md` for world/life-sim integration with the graph editor

---

## For Agents: Where to Start

### If you're working on 2D gameplay (hotspots, actions, playback)

**Read first:**
- `HOTSPOT_ACTIONS_2D.md` – Hotspot action types, scene playback phases, NPC portraits
- `RELATIONSHIPS_AND_ARCS.md` – Session flags, relationships, arcs, quests, items

**Key files:**
- `frontend/src/routes/Game2D.tsx` – 2D preview and hotspot handling
- `frontend/src/lib/game/interactionSchema.ts` – Action parsing and phase derivation
- `frontend/src/lib/game/session.ts` – Session helpers

**Key constraints:**
- Don't change database schemas; use `meta`, `flags`, `relationships` instead
- Hotspot actions live in `meta.action` as JSON, validated by frontend
- Scene playback phases are derived from runtime state, not stored

---

### If you're working on the scene editor / graph

**Read first:**
- `NODE_EDITOR_DEVELOPMENT.md` – Editor architecture, development roadmap, phases
- `GRAPH_UI_LIFE_SIM_PHASES.md` – World/life-sim integration, character binding model

**Key files:**
- `frontend/src/components/GraphPanel.tsx` – Graph canvas
- `frontend/src/components/SceneBuilderPanel.tsx` – Property inspector
- `frontend/src/modules/scene-builder/index.ts` – Draft model and conversion

**Key constraints:**
- Scenes are world-agnostic; use roles, not hard NPC IDs (except for identity-specific nodes)
- Editor metadata stays in draft; `toRuntimeScene()` produces minimal runtime `Scene`
- Validate graphs before save (no cycles, unreachable nodes, missing required fields)

---

### If you're working on NPCs / life sim / world behavior

**Read first:**
- `RELATIONSHIPS_AND_ARCS.md` – Relationship systems, arcs, quests, session state
- `GRAPH_UI_LIFE_SIM_PHASES.md` – Character binding model, roles vs identity

**Key files:**
- Backend: `pixsim7_backend/api/v1/game_npcs.py` – NPC and schedule APIs
- Frontend: `frontend/src/lib/game/session.ts` – Session helpers

**Key constraints:**
- NPCs have schedules (`NPCSchedule`) for presence queries
- NPC expressions (`NpcExpression`) are for UI surfaces only, not full-screen video
- Identity clips live in `GameNPC.meta.identity`, not in expressions
- Relationships are per-session, stored in `GameSession.relationships`

---

### If you're working on 3D / display modes

**Read first:**
- `GAME_WORLD_DISPLAY_MODES.md` – How 2D content is presented in 3D contexts

**Key concepts:**
- Display modes: `fullscreen`, `surface`, `panel`
- Configuration lives in `GameHotspot.meta.display`
- Scenes remain reusable; worlds decide how to present them

---

## Design Principles

1. **Keep core models generic**
   - Don't add quest/item/arc-specific columns to database tables
   - Extend via `meta`, `flags`, `relationships` JSON fields

2. **Scenes are world-agnostic**
   - Use roles for character references, not hard NPC IDs
   - Worlds bind roles to NPCs at runtime via `npc_bindings`
   - Only use `npc_id` for identity-specific nodes (e.g., "Anete walking" clip)

3. **Frontend-driven schemas**
   - Backend stores generic JSON; frontend validates and interprets
   - Use TypeScript types and helpers to enforce conventions
   - Keep semantics flexible for future worlds with different mechanics

4. **Separation of concerns**
   - **Worlds** = long-lived simulation context (locations, NPCs, time)
   - **Sessions** = player progress (flags, relationships, state)
   - **Scenes** = reusable narrative graphs (nodes, edges, roles)
   - **Assets** = media files (video, image, 3D model)

5. **NPC expressions vs identity**
   - `NpcExpression` = small UI surfaces (portraits, reactions)
   - `GameNPC.meta.identity` = full-body/cinematic clips
   - Use the right one for the right context

---

## Related Documentation

- `HOTSPOT_ACTIONS_2D.md` – 2D hotspot actions and scene playback phases
- `RELATIONSHIPS_AND_ARCS.md` – Relationships, arcs, quests, items, events
- `GRAPH_UI_LIFE_SIM_PHASES.md` – Graph editor + life-sim integration
- `GAME_WORLD_DISPLAY_MODES.md` – 2D/3D display modes for scenes
- `NODE_EDITOR_DEVELOPMENT.md` – Scene editor architecture and roadmap
- `PHASE4_CANONICAL_SCENE_SCHEMA.md` – Canonical `@pixsim7/types.Scene` schema definition

---

## API Endpoints Reference

**Worlds & Locations:**
- `GET /api/v1/game/worlds` – List worlds
- `POST /api/v1/game/worlds` – Create world
- `GET /api/v1/game/worlds/{id}` – Get world
- `PATCH /api/v1/game/worlds/{id}` – Update world
- `GET /api/v1/game/locations` – List locations
- `POST /api/v1/game/locations` – Create location
- `GET /api/v1/game/hotspots` – List hotspots

**Sessions:**
- `POST /api/v1/game/sessions` – Create session
- `GET /api/v1/game/sessions/{id}` – Get session
- `PATCH /api/v1/game/sessions/{id}` – Update session (world_time, flags, relationships)

**Scenes:**
- `GET /api/v1/game/scenes` – List scenes
- `POST /api/v1/game/scenes` – Create scene
- `GET /api/v1/game/scenes/{id}` – Get scene
- `PATCH /api/v1/game/scenes/{id}` – Update scene

**NPCs:**
- `GET /api/v1/game/npcs` – List NPCs
- `POST /api/v1/game/npcs` – Create NPC
- `GET /api/v1/game/npcs/presence` – Query NPC presence by world_time and location
- `GET /api/v1/game/npcs/{id}/expressions` – List expressions for NPC
- `POST /api/v1/game/npcs/{id}/expressions` – Create expression

**Assets:**
- `GET /api/v1/assets` – List assets
- `GET /api/v1/assets/{id}` – Get asset with file URL

---

## Quick Start for Common Tasks

**Adding a new hotspot action:**
1. Define the action type in `frontend/src/lib/game/interactionSchema.ts`
2. Update `parseHotspotAction` to handle the new type
3. Update `handlePlayHotspot` in `Game2D.tsx` to implement the behavior
4. Document in `HOTSPOT_ACTIONS_2D.md`

**Creating a new scene node type:**
1. Add the type to `@pixsim7/types` Scene schema
2. Update `SceneNode.tsx` to render the new type
3. Add inspector fields in `SceneBuilderPanel.tsx`
4. Update `toRuntimeScene()` in scene-builder module
5. Update `ScenePlayer` to handle the new node type

**Adding relationship/arc tracking:**
1. Define the convention in `GameSession.flags` or `relationships`
2. Add helper functions in `frontend/src/lib/game/session.ts`
3. Update scenes to set flags/relationships via edge effects
4. Document the convention in `RELATIONSHIPS_AND_ARCS.md`

**Implementing a new NPC schedule:**
1. Create `NPCSchedule` rows via `/api/v1/game/npcs/schedules`
2. Query presence via `/api/v1/game/npcs/presence?world_time=...&location_id=...`
3. Use results to show/hide NPCs in 2D/3D views
