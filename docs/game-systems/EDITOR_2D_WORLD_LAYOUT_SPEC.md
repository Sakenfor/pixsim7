# 2D World Layout & NPC Interaction Editor – Design Guide

This doc is for improving the existing PixSim7 **Game World editor** and related
graph tools so creators can build richer 2D worlds with standing NPCs,
interaction slots (talk, pickpocket, etc.), and, later, light stealth mechanics.

Target implementer: a high‑capability agent (e.g. Claude Opus). You should read
and respect:

- `docs/GRAPH_UI_LIFE_SIM_PHASES.md`
- `docs/HOTSPOT_ACTIONS_2D.md`
- `docs/RELATIONSHIPS_AND_ARCS.md`
- `docs/ACTION_PROMPT_ENGINE_SPEC.md`

Use those as the canonical source for scene graphs, hotspot actions, world
state, and action blocks. This doc only covers **editor UX and JSON shapes**.

---

## 1. Current Editor State (Relevant Parts)

- `apps/main/src/routes/GameWorld.tsx`
  - Lists locations via `/game/locations`.
  - For a selected location, edits its **hotspots**:
    - `object_name`, `hotspot_id`, `action`, `meta`.
  - Has structured controls for `action`:
    - `type: 'play_scene' | 'change_location' | 'npc_talk'`
    - `scene_id`, `target_location_id`, `npc_id`.

- `apps/main/src/components/GraphPanel.tsx`
  - Scene graph editor (React Flow) for scene nodes/edges.
  - Uses `WorldContextSelector` to know `(worldId, locationId)` context but
    scene data is world‑agnostic.

- `apps/main/src/components/SceneBuilderPanel.tsx`
  - Node inspector for the selected scene node.
  - Already writes some life‑sim metadata into `SceneNode.metadata`:
    - `lifeSim.advanceMinutes`,
    - `npc_id` (hard binding),
    - `speakerRole`, `npc_state` (for expressions).

- `apps/main/src/routes/Game2D.tsx`
  - 2D game preview:
    - Shows background image/video for `GameLocation`.
    - Renders hotspots on top via `meta.rect2d` and `action`.
    - Uses `GameWorld`/NPC APIs plus `getNpcPresence` to drive portraits.

Right now, there is **no editor UI** for:

- Placing static NPCs visually on the background.
- Defining reusable 2D “slots” NPCs can occupy.
- Configuring NPC‑specific interactions on the 2D background.

---

## 2. Guiding Constraints

- **No DB schema changes** for this phase:
  - Use existing JSON fields:
    - `GameLocation.meta`,
    - `GameHotspot.meta`,
    - `GameWorld.meta`,
    - `GameSession.flags` / `relationships`.

- Stay **2D‑first**:
  - No real‑time pathfinding or shadow calculation is required.
  - Background art can “bake in” lighting/shadows.

- NPC movement is already handled via:
  - `NPCSchedule` + `NPCState` + `/game/npcs/presence`.
  - The editor should configure where NPCs can appear in 2D, not simulate motion.

---

## 3. Phase 1 – 2D NPC Slots on Location Backgrounds

**Goal:** Let creators define visual slots on a location’s 2D background where
NPCs can stand/sit, without binding them permanently to a specific NPC.

### Data Shape

Extend `GameLocation.meta` with a `npcSlots2d` array:

```jsonc
{
  "npcSlots2d": [
    {
      "id": "bench_left",
      "x": 0.32,
      "y": 0.71,
      "roles": ["sitter", "partner"],
      "fixedNpcId": null
    },
    {
      "id": "bar_counter",
      "x": 0.65,
      "y": 0.42,
      "roles": ["bartender"],
      "fixedNpcId": 37
    }
  ]
}
```

- Coordinates are normalized `0–1` in background space.
- `roles` is a free‑form list indicating **slot intent** (e.g. `"bartender"`,
  `"visitor"`, `"shopkeeper"`, `"partner"`).
- `fixedNpcId` (optional) can hard‑lock a slot to a specific NPC (e.g. shopkeeper).

### Editor UX

In `GameWorld` (or a new “2D Layout” tab for the selected location):

- Show the location’s background asset (same logic as `Game2D` uses).
- Allow adding/removing **slots**:
  - Click on the image to create a slot at that position.
  - Edit `id`, `roles`, and optional `fixedNpcId` in a small form.
- Render slot markers (e.g. circles with IDs/role labels) on the image.

The editor should read/write `npcSlots2d` under `detail.meta` and use the
existing PUT `/game/locations/{id}/hotspots` for saving (no backend changes
needed if `meta` is sent through intact).

---

## 4. Phase 2 – Runtime Slot Assignment Rules

**Goal:** Specify how NPCs present at a location are mapped to slots at runtime.

### Runtime Behavior (Design)

Given:

- `npcSlots2d` from `GameLocation.meta`,
- NPC presence from `/game/npcs/presence?location_id=`,

Define a client‑side helper (later reusable in both 2D and 3D) that:

1. Fills slots with `fixedNpcId` first (if that NPC is present).
2. Fills remaining slots with present NPCs:
   - Prefer NPCs whose **world role** (from `GameNPC.personality` or tags in
     `GameWorld.meta`) matches slot `roles`.
3. Any extra NPCs beyond available slots can be:
   - Ignored, or
   - Rendered using a simple fallback (e.g., overlapping slot, or “crowd” marker).

### Editor Hints

Add optional **role hints** on NPCs in world metadata:

```jsonc
{
  "npcRoles": {
    "12": ["partner", "romanceable"],
    "37": ["bartender", "shopkeeper"]
  }
}
```

stored in `GameWorld.meta`. The selector can use these when matching NPCs to
slot `roles`. Editor support for editing `npcRoles` is optional but nice.

---

## 5. Phase 3 – NPC Interaction Config per Slot

**Goal:** Configure interactions (talk, pickpocket, etc.) per NPC slot, in a
simple, retro‑style way (no movement or LOS required).

### Data Shape

Extend `npcSlots2d[*]` with an `interactions` object:

```jsonc
{
  "npcSlots2d": [
    {
      "id": "bench_left",
      "x": 0.32,
      "y": 0.71,
      "roles": ["sitter"],
      "fixedNpcId": null,
      "interactions": {
        "canTalk": true,
        "npcTalk": {
          "npcId": 12,        // optional override; else use assigned NPC
          "preferredSceneId": 42
        },
        "canPickpocket": true,
        "pickpocket": {
          "baseSuccessChance": 0.4,
          "detectionChance": 0.3,
          "onSuccessFlags": ["stealth:stole_from_npc_12"],
          "onFailFlags": ["stealth:caught_by_npc_12"]
        }
      }
    }
  ]
}
```

This is all frontend‑authored JSON under `GameLocation.meta`; backend does not
need new tables.

### Editor UX

For each slot in the 2D layout view:

- Show an “Interactions” panel:
  - Checkbox `Talk` → config for `npcTalk`:
    - NPC ID (optional; defaults to assigned NPC),
    - Scene ID (optional; fallback to `hotspot.action.type = "npc_talk"`).
  - Checkbox `Pickpocket` → config for `pickpocket` probabilities and flags.
  - Future checkboxes (e.g. “Flirt”, “Give Item”) can be added as new keys
    under `interactions` following the same pattern.

The editor writes this to `detail.meta.npcSlots2d[*].interactions` and leaves
actual logic to the 2D client and back‑end endpoints.

---

## 6. Phase 4 – Wire Slots into Game2D

**Goal:** Show assigned NPCs on the 2D background and wire click interactions.

### Client‑Side Integration (`Game2D`)

In `apps/main/src/routes/Game2D.tsx`:

- After loading `locationDetail` and `npcSlots2d` from `locationDetail.meta`,
  and fetching `getNpcPresence` for the current `worldTime` + `location_id`, call
  a helper to assign NPCs to slots (as described in Phase 2).

- Render NPC markers on top of the background:

  ```tsx
  assignedSlots.map((slot) => (
    <button
      key={slot.id}
      className="absolute ..."
      style={{ left: slot.x * 100 + '%', top: slot.y * 100 + '%' }}
      onClick={() => handleNpcSlotClick(slot)}
    >
      {/* Could show tiny portrait or NPC initials */}
    </button>
  ));
  ```

- `handleNpcSlotClick(slot)`:
  - If `slot.interactions.canTalk` → trigger NPC talk:
    - Use `npcTalk.preferredSceneId`, or
    - Use hotspot meta + `npc_talk` action + narrative engine.
  - If `slot.interactions.canPickpocket` → call a new `/game/stealth/pickpocket`
    endpoint with `npc_id` and `slot.id`, then:
    - Apply flags via `GameSession` API,
    - Optionally trigger a small scene or action clip via narrative/action engines.

Most of this can be wired with existing endpoints; new ones should follow the
same pattern as existing `/game/*` routes and use JSON flags, not new tables.

---

## 7. Phase 5 – Stealth/Pickpocket Backend Hook (Minimal)

**Goal:** Implement a simple, chance‑based pickpocket mechanic that uses
session flags, without real stealth simulation.

### Suggested Endpoint (Backend)

Add `pixsim7/backend/main/api/v1/game_stealth.py` (name flexible) with:

- `POST /api/v1/game/stealth/pickpocket`
  - Body:
    ```jsonc
    {
      "npc_id": 12,
      "slot_id": "bench_left",
      "base_success_chance": 0.4,
      "detection_chance": 0.3,
      "world_id": 1,
      "session_id": 456
    }
    ```
  - Behavior:
    - Perform simple random roll(s) server‑side.
    - Update `GameSession.flags.stealth` and/or `GameSession.stats["relationships"]["npc:12"].flags`:
      - e.g. set `stealth:stole_from_npc_12` or `stealth:caught_by_npc_12`.
  - Return:
    ```jsonc
    {
      "success": true,
      "detected": false,
      "updated_flags": {...}
    }
    ```

No new DB schema is required; use JSON fields and existing `GameSession` update
methods (`PATCH /game/sessions/{id}`).

---

## 8. Notes & Stretch Ideas

- 2D mode does **not** need real lighting/shadow math:
  - Creators can bake shadows into background art.
  - Slots simply decide where NPCs appear and what they can do.

- Once slots + interactions exist, the same data can be reused by a 3D client:
  - 3D can treat slots as spawn points or anchor positions.
  - Stealth parameters (later) can be applied more richly there.

- Future extensions might include:
  - Slot‑based “date spots” (special interactions that use intimacy level).
  - Time‑of‑day visibility toggles for slots (e.g. some NPCs only appear in
    evening).
  - Simple “relationship mini‑games” attached to slot interactions.

For now, this spec is intentionally modest and 2D‑friendly: focus on **slots,
NPC assignment, and interaction configuration** in the editor, and let the
existing narrative + action engines handle the heavy lifting for dialogue and
visuals.*** End Patch***"}} ***!
