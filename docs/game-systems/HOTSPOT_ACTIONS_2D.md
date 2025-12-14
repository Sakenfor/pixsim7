# 2D Hotspot Actions & NPC Portraits (Frontend Schema)

## Scope

**This doc is for:** Developers working on 2D gameplay, hotspot interactions, scene playback, and NPC portrait rendering in the Game2D preview.

**See also:**
- `SYSTEM_OVERVIEW.md` – High-level map of game systems
- `RELATIONSHIPS_AND_ARCS.md` – How to model relationships and arcs on top of sessions
- `NODE_EDITOR_DEVELOPMENT.md` – Scene graph editor architecture
- `GRAPH_UI_LIFE_SIM_PHASES.md` – World/life-sim integration with the graph editor

---

## Overview

This document describes the **frontend-only** schema used by the 2D game UI
for interpreting hotspot actions and scene playback phases. The backend
models (`GameLocation`, `GameHotspot`, `GameScene`, `GameNPC`, `NpcExpression`)
remain generic; only the **JSON stored in `meta`** and the TypeScript helpers
define this behavior.

Relevant code:
- `@pixsim7/game.engine` (hotspot actions and playback helpers)
- `apps/main/src/lib/game/interactionSchema.ts` (re-exports game-core helpers)
- `apps/main/src/routes/Game2D.tsx`
- `apps/main/src/routes/GameWorld.tsx`

---

## 1. Hotspot Actions (2D)

Hotspot actions live in:

- `GameHotspot.meta.action` (arbitrary JSON in the backend),
- parsed and enforced in the frontend by `parseHotspotAction`.

TypeScript schema (canonical in `@pixsim7/game.engine`):

- `HotspotActionType = 'play_scene' | 'change_location' | 'npc_talk'`

- `PlaySceneAction`:
  ```ts
  {
    type: 'play_scene';
    scene_id?: number | string | null; // optional; fallback to linked_scene_id
  }
  ```

- `ChangeLocationAction`:
  ```ts
  {
    type: 'change_location';
    target_location_id?: number | string | null; // GameLocation.id
  }
  ```

- `NpcTalkAction`:
  ```ts
  {
    type: 'npc_talk';
    npc_id?: number | string | null; // GameNPC.id
  }
  ```

Union:

```ts
type HotspotAction =
  | PlaySceneAction
  | ChangeLocationAction
  | NpcTalkAction;
```

### 1.1 Parsing & Unknown Actions

`parseHotspotAction(raw: unknown): HotspotAction | null`:

- Validates `raw.type` is one of:
  - `'play_scene'`,
  - `'change_location'`,
  - `'npc_talk'`.
- Returns a typed `HotspotAction` or `null` if unknown / malformed.
- Callers treat `null` as “no structured action”; they can still fall back
  to existing fields like `linked_scene_id`.

This keeps the backend free of new enums while giving the frontend a small,
well-defined action vocabulary.

---

## 2. Game2D Behavior for Actions

In `Game2D` (`Game2D.tsx`), `handlePlayHotspot` applies the schema:

1. **Parse action**
   ```ts
   const rawAction = (hotspot.meta as any)?.action ?? null;
   const action = parseHotspotAction(rawAction);
   ```

2. **`change_location`**
   - Reads `action.target_location_id`.
   - Casts to `Number` and, if finite, sets `selectedLocationId` and returns.

3. **`npc_talk`**
   - Currently: logs to the console (`npc_talk action triggered`).
   - Reserved for future conversational UI (dialogue box, etc.).

4. **`play_scene` + backwards compatibility**
   - Computes the scene id with fallback:
     ```ts
     const sceneId =
       (action && 'scene_id' in action ? action.scene_id : null) ??
       hotspot.linked_scene_id;
     ```
   - If no id is found → no-op.
   - Otherwise fetches the scene via `/game/scenes/:id` and opens `ScenePlayer`
     full-screen.

This preserves existing behavior (`linked_scene_id`) while allowing richer
actions in `meta.action`.

---

## 3. Scene Playback Phases (Frontend)

No backend enum is introduced for phases; they are computed purely from the
scene graph and runtime state.

### 3.1 Phase Type

```ts
type ScenePlaybackPhase = 'playing' | 'awaiting_input' | 'completed';
```

### 3.2 Deriving Phase

Helper (canonical in `@pixsim7/game.engine`, re-exported via `interactionSchema.ts`):

```ts
deriveScenePlaybackPhase({ scene, runtime }): ScenePlaybackPhase
```

Logic:

- Find `runtime.currentNodeId` in `scene.nodes`.
- If no node is found → `'completed'`.
- If node `type === 'choice'` → `'awaiting_input'`.
- If node `type === 'end'` → `'completed'`.
- Otherwise → `'playing'`.

`ScenePlayer` (in `@pixsim7/game-ui`) exposes `onStateChange(state)`. `Game2D`
subscribes to this callback and immediately maps `SceneRuntimeState` into a
simple `ScenePlaybackPhase` for UI decisions.

---

## 4. NPC Portraits in 2D Scenes

NPC portraits are driven by:

- `location.meta.primary_npc_id` (convention for “active NPC”),
- `NpcExpression` rows (`state`, `asset_id`, `crop`, `meta`),
- Assets fetched from `/assets/:id`.

### 4.1 Active NPC per Location

When a location is loaded in `Game2D`:

- `primary_npc_id` is read from `location.meta.primary_npc_id`.
- If present, it is coerced to `number` and stored in `activeNpcId`.
- Expressions are fetched once via `getNpcExpressions(activeNpcId)`.

### 4.2 Mapping Phase → Expression State

When a scene is open and playing:

- If `phase === 'playing'` → desired NPC state: `'talking'`.
- If `phase === 'awaiting_input'` → desired NPC state: `'waiting_for_player'`.
- If `phase === 'completed'` → desired NPC state: `'idle'`.
- Fallbacks:
  - If no exact match:
    - Try `state === 'idle'`,
    - else fall back to the first available expression.

This gives a minimal but useful mapping that can be extended later without
changing backend tables.

### 4.3 Portrait Asset Lookup

For the chosen `NpcExpression` row:

- Use `asset_id` to fetch the asset via `/assets/:id`.
- Accept only `image` or `video` media types.
- Render as a small `<Panel>` overlay next to the full-screen `ScenePlayer`:
  - Image: `<img src={file_url} />`.
  - Video: `<video src={file_url} loop autoPlay muted />`.

The portrait is recomputed whenever:

- The scene opens/closes,
- The scene playback phase changes,
- The active NPC or its expressions change.

---

## 5. Editing Actions in GameWorld

The **Game World editor** (`GameWorld.tsx`) exposes:

- Existing fields per hotspot:
  - `object_name`,
  - `hotspot_id`,
  - `linked_scene_id`,
  - `meta` (raw JSON).

- Additional convenience inputs for the action schema:
  - `action.type` (`play_scene`, `change_location`, `npc_talk`),
  - `action.scene_id`,
  - `action.target_location_id`.

These inputs simply manipulate `hotspot.meta.action` as JSON; the backend still
stores a generic `meta` object.

This keeps the **2D interaction model** fully frontend-driven while allowing
world authors to define structured behaviors from the editor UI.
