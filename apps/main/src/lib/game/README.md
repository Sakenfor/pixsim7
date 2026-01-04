# Game Library Modules

This directory contains TypeScript modules for game logic, schemas, and helpers used by the 2D game preview and scene editor.

## Key Modules

### interactionSchema.ts

**Hotspot actions and scene playback phases:**

- **`HotspotAction`** types: `play_scene`, `change_location`, `npc_talk`
  - Defines the frontend schema for hotspot actions
  - Parsed from `GameHotspot.action` JSON

- **`parseHotspotAction(raw)`** – Validates and parses hotspot action JSON
  - Returns typed `HotspotAction` or `null` if unknown/malformed

- **`ScenePlaybackPhase`** types: `playing`, `awaiting_input`, `completed`
  - Derived from scene runtime state (not stored)
  - Used for NPC expression mapping and UI decisions

- **`deriveScenePlaybackPhase({ scene, runtime })`** – Computes playback phase
  - Based on current node type (`choice` → `awaiting_input`, `end` → `completed`, etc.)

**See:**
- `docs/game-systems/HOTSPOT_ACTIONS_2D.md` – Complete hotspot action schema and playback phase details
- `docs/SYSTEM_OVERVIEW.md` – High-level overview of game systems

---

### session.ts

**World time and session state helpers:**

- World time synchronization between `GameSession` and `GameWorldState`
- Session kind detection (`world` vs `scene`)

**Session State Manipulation:**

Game2D and interaction plugins now use `@pixsim7/game.engine` session helpers for all relationship and flag manipulation. **Plugins access these via `context.session`** rather than importing directly:

```typescript
// In an interaction plugin:
const relState = context.session.getNpcRelationship(npcId);
const updated = context.session.updateNpcRelationship(npcId, { affinity: 50 });
context.session.addInventoryItem('flower', 1);
```

**Available session helpers:**
- **Relationships:** `getNpcRelationship()`, `updateNpcRelationship()`
- **Arcs:** `updateArcStage()`, `markSceneSeen()`
- **Quests:** `updateQuestStatus()`, `incrementQuestSteps()`
- **Inventory:** `getInventory()`, `addInventoryItem()`, `removeInventoryItem()`
- **Events:** `triggerEvent()`, `endEvent()`, `isEventActive()`
- **Batching:** `createUpdate()` returns a `SessionUpdate` builder for chaining multiple operations

**Architecture:**
- `InteractionContext.session` provides all session helpers
- `createSessionHelpers(gameSession)` binds helpers to a specific session
- `executeSlotInteractions()` handles interaction normalization and execution
- All session updates are type-safe via `SessionFlags`, `ArcProgress`, `QuestProgress`, etc.

This ensures consistent session logic across all frontends (React/3D/CLI) and keeps plugins decoupled from game-core imports.

**Conventions:**
- `GameSession.flags` – Quest/arc progress, inventory, events, world state
- `GameSession.relationships` – NPC ↔ Player and NPC ↔ NPC affinity/trust/flags

**See:**
- `docs/RELATIONSHIPS_AND_ARCS.md` – Complete guide to relationships, arcs, quests, and session state conventions
- `docs/SYSTEM_OVERVIEW.md` – Sessions overview
- `packages/game/engine/src/session/` – Session types, helpers, and builder
- `frontend/src/lib/game/interactions/sessionAdapter.ts` – Context.session implementation
- `frontend/src/lib/game/interactions/executor.ts` – Interaction execution logic

---

## Usage Notes

- These modules define **frontend-only schemas** on top of generic backend JSON fields
- Backend models remain generic; TypeScript types and helpers enforce conventions
- When adding new action types or playback rules, update the hotspot helpers in `@pixsim7/game.engine` (re-exported via `interactionSchema.ts`) and document in `docs/game-systems/HOTSPOT_ACTIONS_2D.md`
- When adding new session state patterns, update `session.ts` helpers and document in `RELATIONSHIPS_AND_ARCS.md`
