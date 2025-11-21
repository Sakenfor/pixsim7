# Graph + Life Sim Integration Phases (Editor Tasks)

## Scope

**This doc is for:** Developers working on integrating world/life-sim features (NPCs, relationships, time, arcs) into the node-based scene editor and 2D preview. Assumes familiarity with the scene graph editor baseline.

**See also:**
- `SYSTEM_OVERVIEW.md` – High-level map of game systems
- `NODE_EDITOR_DEVELOPMENT.md` – Scene graph editor architecture (required reading)
- `RELATIONSHIPS_AND_ARCS.md` – How to model relationships and arcs in session state
- `HOTSPOT_ACTIONS_2D.md` – How hotspot actions wire to scenes and affect playback

---

## Overview

This brief layers the **world / life‑sim features** we just added onto the
existing **node‑based Scene Editor** and 2D game preview. It assumes the
baseline in `NODE_EDITOR_DEVELOPMENT.md` is already in place.

The goal is to make the editor aware of:
- Worlds (`GameWorld` + `GameWorldState`),
- World sessions (`GameSession` with `world_time` and flags),
- 2D actions (`GameHotspot.meta.action`),
- NPC expressions + presence,
while keeping the scene graph (`Scene`, `SceneNode`, `SceneEdge`) backend‑agnostic.

Key existing references:
- Scene editor & graph:
  - `apps/main/src/components/GraphPanel.tsx`
  - `apps/main/src/components/SceneBuilderPanel.tsx`
  - `apps/main/src/components/nodes/SceneNode.tsx`
  - `apps/main/src/modules/scene-builder/index.ts`
- Game APIs & 2D playtest:
  - `apps/main/src/lib/api/game.ts`
  - `@pixsim7/game.engine` (hotspot actions and playback helpers)
  - `apps/main/src/lib/game/interactionSchema.ts` (re-export shim)
  - `apps/main/src/lib/game/session.ts`
  - `apps/main/src/routes/GameWorld.tsx`
  - `apps/main/src/routes/Game2D.tsx`
- Backend world/time/NPC endpoints:
  - `/api/v1/game/worlds` (`pixsim7/backend/main/api/v1/game_worlds.py`)
  - `/api/v1/game/sessions` (`pixsim7/backend/main/api/v1/game_sessions.py`)
  - `/api/v1/game/npcs/presence` (`pixsim7/backend/main/api/v1/game_npcs.py`)

---

## Character Binding Model (Design Constraints)

Before the concrete phases, a quick summary of how characters should be
represented in the editor and runtime. This is important so the UI work does
not hard‑code assumptions that will block future worlds/sims.

**Key ideas:**

- **Scenes are standalone.**
  - A `Scene` should not hard‑depend on specific `GameLocation` or `GameWorld`.
  - Scenes are authored once and then reused in different worlds/locations.

- **Roles vs NPC identity.**
  - Inside a scene, we use **roles** to describe who appears, e.g.:
    - `Scene.meta.cast = [{ role: "lead", label: "Protagonist" }, { role: "bartender" }]`
    - Nodes can refer to roles via `SceneNode.meta.speakerRole = "lead"`.
  - Optionally, a role can suggest a **default NPC**:
    - `Scene.meta.cast[*].defaultNpcId` is a soft binding (“this scene was written for Anete”). It is a hint, not a requirement.

- **Hard identity binding (optional).**
  - Some nodes are truly about a specific NPC (e.g. “Anete walking” clip).
  - For these, allow an explicit `SceneNode.meta.npc_id`:
    - This bypasses roles and says “this node is Anete”.
    - The UI can still show a role selector, but `npc_id` wins if present.

- **NpcExpression is for UI surfaces, not all video.**
  - `NpcExpression` stays scoped to portraits / talking heads / reaction clips
    used in UI (dialog, notifications, HUD), not all cinematic video.
  - Full‑screen or large video content remains in `SceneNode.media`.

- **NPC identity assets live on the NPC, not in expressions.**
  - Use a convention in `GameNPC.meta.identity`, e.g.:
    ```jsonc
    {
      "identity": {
        "primaryPortraitAssetId": 123,
        "primaryBodyAssetId": 456,
        "clips": [
          { "id": "walk_intro", "asset_id": 789 }
        ]
      }
    }
    ```
  - The editor can surface these when a node is `npc_id`‑bound.

- **Worlds bind roles to NPCs.**
  - When a world/location/hotspot uses a scene, it can provide:
    ```jsonc
    {
      "npc_bindings": {
        "lead": 12,
        "bartender": 37
      }
    }
    ```
  - Runtime resolution for a given role:
    1. `npc_bindings[role]` from world/location context.
    2. `Scene.meta.cast[*].defaultNpcId` for that role.
    3. No binding → treat as generic / faceless role.

The phases below should respect these constraints: scenes stay reusable,
roles are the primary mechanism, `npc_id` is an optional hard lock, and
`NpcExpression` is used only for small UI‑scale expressions.

---

## Phase 1 – World‑Aware Scene Editing Context

**Goal:** Let the editor work “inside a world” so scenes and hotspots can be
authored with a specific `GameWorld` + `GameLocation` in mind, but without
hard‑wiring world IDs into scene schemas.

**Tasks:**
- Add a **World selector** to the scene editor workspace:
  - Reuse world APIs from `apps/main/src/lib/api/game.ts` (`listGameWorlds`, `createGameWorld`, `getGameWorld`).
  - Mirror the UX already added in `Game2D` (simple dropdown + “New World”).
  - Persist the selected `worldId` in a small UI store (e.g. React context or a scene‑builder module), not in backend yet.
- Add a **Location selector** scoped to the selected world:
  - Filter `GameLocation` list by `meta.world_id` when that convention is present.
  - For now, allow “all locations” if `world_id` is not set.
- Expose the selected `{ worldId, locationId }` to:
  - Scene graph panels (`GraphPanel`),
  - `SceneBuilderPanel`,
  - and the 2D preview launcher (Phase 5).

**Acceptance:**
- Opening the scene editor shows a world dropdown and location dropdown.
- Changing world or location updates the context used by the rest of the editor but does not break existing scenes.

---

## Phase 2 – Hotspot Actions + Scene Linking in the Editor

**Goal:** Make the editor aware of 2D hotspot actions so creators don’t have
to hand‑edit `meta.action` JSON or remember action types.

**Tasks:**
- Extend `GameWorld` editor (`apps/main/src/routes/GameWorld.tsx`):
  - Replace the current raw `meta` JSON input with a **structured view** for `meta.action` based on `HotspotAction`:
    - `type: 'play_scene' | 'change_location' | 'npc_talk'`
    - `scene_id`, `target_location_id`, `npc_id`
  - Keep a “raw meta JSON” field for advanced use, but make action fields the primary controls.
  - Ensure the values are written back into `meta.action` in a way compatible with `parseHotspotAction`.
- Add a **“Link Scene” helper**:
  - In `GameWorld`, allow picking a `GameScene` for `linked_scene_id` from a dropdown (simple `/game/scenes` list or a typeahead stub).
  - Show a quick link (“Open in Scene Editor”) next to each `linked_scene_id` that navigates to the scene editor with the same world/location context.

**Acceptance:**
- For any hotspot, you can set `type: play_scene/change_location/npc_talk` and relevant IDs via form inputs.
- `Game2D` continues to trigger actions correctly based on the edited metadata.

---

## Phase 3 – Scene Graph Annotations for Life‑Sim Data

**Goal:** Let the graph editor express how a scene affects world/session state
without changing backend models – just via `SceneNode.meta` / `SceneEdge.effects`
with conventions that the runtime already understands.

**Tasks:**
- In `SceneBuilderPanel` / inspector:
  - Add a “Life Sim” section for nodes and edges:
    - Node‑level (on enter/exit):
      - Toggle for “advances world time” with a numeric input (`+minutes`), stored in node `meta`, e.g. `{ lifeSim: { advanceMinutes: 15 } }`.
      - Optional `npc_id` field to hard‑bind the node to a specific NPC (for strongly identity‑tied clips).
    - Edge‑level (branching results):
      - Quick controls for relationship deltas, e.g. “+10 affinity with NPC X”:
        - Store in `SceneEdge.effects` using a simple convention (e.g. `key: "rel:npc:12.affinity", op: "inc", value: 10`).
      - Optional flags for quest/arc steps (e.g. `arc:main_romance_alex.stage = 2`).
- Make sure `toRuntimeScene()` passes these through into the runtime `Scene` object without trying to interpret them – the 2D/3D clients will map them into `GameSession.flags` / `relationships` later.

**Acceptance:**
- Editor can attach “advance time by N minutes” and simple relationship/arc effects to nodes/edges.
- Generated runtime `Scene` still validates against `@pixsim7/types` and nothing breaks in existing players.

---

## Phase 4 – NPC Expressions & Presence Hints in the Graph

**Goal:** Make it easier to author scenes with specific NPCs and their
expressions/states, while reusing the existing `NpcExpression` and presence
mechanics, and keeping a clean separation between identity vs expression.

**Tasks:**
- In Scene inspector:
  - Add a **Cast** section:
    - Define roles: `{ role, label, defaultNpcId? }` stored in `Scene.meta.cast`.
    - Optional “Primary NPC” convenience selector that simply sets a default role binding (e.g. role `"lead"` with `defaultNpcId`).
- For nodes:
  - Add an optional “Speaker role” field bound to `SceneNode.meta.speakerRole` (uses `Scene.meta.cast` entries).
  - Add an optional “NPC expression state” field (`idle`, `talking`, `waiting_for_player`, etc.) stored as `SceneNode.meta.npc_state`.
  - For nodes with a hard `npc_id` binding (Phase 3), allow expression state to still be set for UI overlays (NpcExpression).
- Graph UI hints (optional but valuable):
  - Visual tag on nodes showing `speakerRole` + resolved NPC (based on defaultNpcId, if present).
  - Icon/label indicating when a node has `npc_id` (hard identity lock) vs only a role.
  - Simple color coding for nodes where an NPC is speaking vs internal logic nodes.

**Acceptance:**
- Scenes can declare which NPC they are primarily about.
- Nodes can declare NPC expression states without breaking any schemas.
- Graph visual hints make it easy to see NPC‑centric flow.

---

## Phase 5 – “Play from Here in World” Preview

**Goal:** Tighten the loop between graph editing and the 2D life sim preview:
start from a node in the editor, open `Game2D` in the same world, at a
matching location/time, and play that scene.

**Tasks:**
- Add a “Play from here in 2D” button in `SceneBuilderPanel` / Graph context menu:
  - When clicked:
    - Ensure a `GameWorld` and `GameLocation` are selected (Phase 1).
    - Encode `{ worldId, sceneId, maybe nodeId }` into URL query params for `/game-2d`.
  - In `Game2D`:
    - Read optional `sceneId` param and, if present, trigger `handlePlayHotspot`‑like logic to open that scene immediately for the current location.
    - Respect `worldId` param by selecting that world and syncing `worldTime` from `GameWorldState` (already supported by APIs).
- Make sure this works regardless of whether the scene is linked via a hotspot yet — i.e. for quick testing while authoring the scene graph.

**Acceptance:**
- From a scene node, you can jump into `/game-2d` and see that scene play inside the correct world context.
- The world clock and NPC presence behave the same as they would when reached via a hotspot in normal gameplay.

---

## Phase 6 – World Overview & NPC Schedule Visualization (Optional)

**Goal:** Provide a high‑level, editor‑only view that combines worlds,
locations, NPC schedules, and scenes, to understand life‑sim dynamics at a
glance.

**Tasks (optional / stretch):**
- World overview panel:
  - Timeline view for `GameWorldState.world_time` with sample days.
  - Overlay `NPCSchedule` rows, showing where each NPC is at different times.
- Scene placement hints:
  - For each `GameLocation` + time slot, show which scenes are reachable via hotspots/actions.
  - Basic “heatmap” of where players will spend time, based on current wiring.

**Acceptance:**
- Editors can see which NPCs are where at which times, and how scenes link into that schedule, without leaving the editor.

---

## Notes for Implementation

- Keep all new semantics as **frontend conventions**:
  - Use `meta.*`, `flags`, and `relationships` to encode behaviors.
  - Do **not** add new backend columns or enums for arcs/quests/relationships yet.
- Prefer small helper modules in `apps/main/src/lib/game/` for:
  - Namespacing relationship keys (`npc:${id}`, `arc:${id}`, etc.).
  - Mapping editor concepts → `Scene.meta` / `SceneEdge.effects` shapes that the runtime can interpret later.
- Reuse existing docs:
  - `docs/NODE_EDITOR_DEVELOPMENT.md` for general node editor behavior.
  - `docs/HOTSPOT_ACTIONS_2D.md` for hotspot action schema.
  - `docs/RELATIONSHIPS_AND_ARCS.md` for how quests/relationships will layer on later.
