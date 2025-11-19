# Relationships, Arcs, and Future Systems (Quests / Items / Events)

## Scope

**This doc is for:** Developers working on NPC relationships, story arcs, quest systems, inventory, and life-sim progression. Covers conventions for using `GameSession.flags` and `GameSession.relationships` without adding new database tables.

> **For Agents**
> - Backend `GameSession.relationships` and the relationship preview APIs are **authoritative** for tier/intimacy values; TypeScript helpers are fallback for tools only.
> - Prefer extending `flags` and `relationships` JSON (with namespaced keys) over adding new DB tables/columns for arcs/quests/items.
> - When changing relationship logic, inspect and keep in sync:  
>   - `pixsim7_backend/domain/narrative/relationships.py`  
>   - `pixsim7_backend/services/game/game_session_service.py` (`_normalize_session_relationships`)  
>   - `packages/game-core/src/relationships/*` and `packages/game-core/src/session/state.ts`.
> - Related tasks (roadmap/status, not specs):  
>   - `claude-tasks/07-relationship-preview-api-and-metrics.md`  
>   - `claude-tasks/08-social-metrics-and-npc-systems.md`  
>   - `claude-tasks/11-world-aware-session-normalization-and-schema-validation.md`

**See also:**
- `SYSTEM_OVERVIEW.md` – High-level map of game systems
- `HOTSPOT_ACTIONS_2D.md` – How hotspot actions trigger scenes and update session state
- `GRAPH_UI_LIFE_SIM_PHASES.md` – How to wire arc state into scene graphs and hotspots
- `NODE_EDITOR_DEVELOPMENT.md` – Scene editor for authoring scenes that update arcs/relationships

---

## Overview

This document describes how to model relationships and story arcs on top of
the existing game session + world model without introducing new tables.
The goal is to keep the core domain generic and extend behavior via
namespaced fields in `flags`, `relationships`, and `meta`.

Relevant pieces:
- `GameSession.flags: Dict[str, Any>`
- `GameSession.relationships: Dict[str, Any>`
- `GameLocation.meta`, `GameHotspot.meta`, `GameScene.meta`, `GameNPC.personality`
- `PATCH /game/sessions/{id}` (world_time, flags, relationships)

---

## 1. Session Kinds and World Block

`GameSession` can represent both:

- Scene sessions (single-scene progression), and
- World sessions (life-sim runs in a world).

Use a convention in `flags` to distinguish them:

```jsonc
{
  "sessionKind": "world",       // or "scene"
  "world": {
    "id": "my-world-slug",      // conceptual world identifier
    "mode": "turn_based",       // or "real_time", etc.
    "currentLocationId": 3
  }
}
```

This keeps world-specific state grouped and makes it easy to migrate
to an explicit `World` table in the future.

---

## 2. Relationships (NPC → Player, NPC → NPC, Player → Player)

`GameSession.relationships` is a free-form JSON field. Use namespaced keys
and/or a "network" subtree to organize relationship graphs.

### 2.1 NPC → Player

Per-player, per-world relationships between the player and NPCs can live here:

```jsonc
{
  "npc:12": { "affinity": 0.7, "trust": 0.3, "flags": ["saved_from_accident"] },
  "npc:15": { "affinity": -0.1, "trust": 0.1 }
}
```

In code, use helpers that build keys like `npc:${id}` to avoid clashes.
Scenes and world events can then:

- Read affinity/trust to branch dialogue,
- Update these values via `PATCH /game/sessions/{id}` with `relationships`.

### 2.2 NPC → NPC

NPC→NPC relationships are still per-player (they represent the *player's view*
of the world), but can be modelled as pairs or a graph:

- Pair-based:
  ```jsonc
  {
    "npcPair:12:15": { "rivalry": 0.4, "friendship": 0.8 }
  }
  ```
- Graph-based under `network`:
  ```jsonc
  {
    "network": {
      "npc:12": { "npc:15": 0.8, "npc:3": -0.2 }
    }
  }
  ```

This supports emergent behavior (triangles, factions) without new tables.

### 2.3 Player → Player (Future Multiplayer)

For multiplayer, this field can also reference other players by ID:

```jsonc
{
  "player:alice": { "player:bob": 0.9, "npc:12": 0.3 }
}
```

Initially this can still live in a per-player `GameSession`. A future
`PlayerRelationship` table can be introduced later without affecting the
session structure.

### 2.4 World-Aware Relationship Normalization

**As of Task 11** (planned), sessions can be linked to worlds via `GameSession.world_id`, enabling **per-world relationship schemas**. See the task file for the roadmap; this doc focuses on conventions and structure rather than migration details.

---

## 3. Story Arcs and Quests

… (rest of existing content unchanged) …

