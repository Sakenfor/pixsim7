# Game Library Modules

This directory provides game-related utilities and thin integration layers used by the 2D game preview and scene editor. Core logic lives in `@pixsim7/game.engine` (`packages/game/engine/src/`); this directory re-exports and extends it for frontend use.

## Key APIs (from `@pixsim7/game.engine`)

### Hotspot Actions & Playback Phases

Provided by `@pixsim7/game.engine`, imported directly by `Game2D.tsx`:

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
- `docs/game-systems/SYSTEM_OVERVIEW.md` – High-level overview of game systems

---

### Session State Helpers

Provided by `@pixsim7/game.engine` (`packages/game/engine/src/session/`):

- World time synchronization between `GameSession` and `GameWorldState`
- Session kind detection (`world` vs `scene`)

**Session State Manipulation:**

Game2D and interaction plugins use `@pixsim7/game.engine` session helpers for all relationship and flag manipulation. **Plugins access these via `context.session`** rather than importing directly:

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

This ensures consistent session logic across all frontends (React/3D/CLI) and keeps plugins decoupled from game engine imports.

**Conventions:**
- `GameSession.flags` – Quest/arc progress, inventory, events, world state
- `GameSession.relationships` – NPC ↔ Player and NPC ↔ NPC affinity/trust/flags

**See:**
- `docs/game/RELATIONSHIPS_AND_ARCS.md` – Complete guide to relationships, arcs, quests, and session state conventions
- `docs/game-systems/SYSTEM_OVERVIEW.md` – Sessions overview
- `packages/game/engine/src/session/` – Session types, helpers, and builder
- `apps/main/src/lib/game/interactions/executor.ts` – Interaction execution logic

---

## Local Modules

### interactions/

- `executor.ts` – Interaction execution logic (slot interactions, normalization)
- `dynamicLoader.ts` – Dynamic plugin interaction loading from backend manifests
- `presets.ts` – Interaction preset definitions
- `InteractionConfigForm.tsx` – Config form component for interactions

### Other

- `index.ts` – Re-exports from `@pixsim7/game.engine`
- `customHelpers.ts` – Project-specific game helpers
- `npcPreferences.ts` – NPC preference utilities
- `usePixSim7Core.ts` – Core game hook

---

## Usage Notes

- Core game logic lives in `@pixsim7/game.engine` — this directory re-exports and extends it
- Backend models remain generic; TypeScript types and helpers enforce conventions
- When adding new action types or playback rules, update `@pixsim7/game.engine` and document in `docs/game-systems/HOTSPOT_ACTIONS_2D.md`
- When adding new session state patterns, update session helpers in `packages/game/engine/src/session/` and document in `docs/game/RELATIONSHIPS_AND_ARCS.md`
