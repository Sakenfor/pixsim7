# Game Library Modules

This directory contains TypeScript modules for game logic, schemas, and helpers used by the 2D game preview and scene editor.

## Key Modules

### interactionSchema.ts

**Hotspot actions and scene playback phases:**

- **`HotspotAction`** types: `play_scene`, `change_location`, `npc_talk`
  - Defines the frontend schema for hotspot actions
  - Parsed from `GameHotspot.meta.action` JSON

- **`parseHotspotAction(raw)`** – Validates and parses hotspot action JSON
  - Returns typed `HotspotAction` or `null` if unknown/malformed

- **`ScenePlaybackPhase`** types: `playing`, `awaiting_input`, `completed`
  - Derived from scene runtime state (not stored)
  - Used for NPC expression mapping and UI decisions

- **`deriveScenePlaybackPhase({ scene, runtime })`** – Computes playback phase
  - Based on current node type (`choice` → `awaiting_input`, `end` → `completed`, etc.)

**See:**
- `docs/HOTSPOT_ACTIONS_2D.md` – Complete hotspot action schema and playback phase details
- `docs/SYSTEM_OVERVIEW.md` – High-level overview of game systems

---

### session.ts

**World time and session state helpers:**

- World time synchronization between `GameSession` and `GameWorldState`
- Helper functions for reading/updating `flags` and `relationships`
- Session kind detection (`world` vs `scene`)

**Conventions:**
- `GameSession.flags` – Quest/arc progress, inventory, events, world state
- `GameSession.relationships` – NPC ↔ Player and NPC ↔ NPC affinity/trust/flags

**See:**
- `docs/RELATIONSHIPS_AND_ARCS.md` – Complete guide to relationships, arcs, quests, and session state conventions
- `docs/SYSTEM_OVERVIEW.md` – Sessions overview

---

## Usage Notes

- These modules define **frontend-only schemas** on top of generic backend JSON fields
- Backend models remain generic; TypeScript types and helpers enforce conventions
- When adding new action types or playback rules, update `interactionSchema.ts` and document in `HOTSPOT_ACTIONS_2D.md`
- When adding new session state patterns, update `session.ts` helpers and document in `RELATIONSHIPS_AND_ARCS.md`
