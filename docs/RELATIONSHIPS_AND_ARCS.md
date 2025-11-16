# Relationships, Arcs, and Future Systems (Quests / Items / Events)

## Scope

**This doc is for:** Developers working on NPC relationships, story arcs, quest systems, inventory, and life-sim progression. Covers conventions for using `GameSession.flags` and `GameSession.relationships` without adding new database tables.

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

## 2. Relationships (NPC ↔ Player, NPC ↔ NPC, Player ↔ Player)

`GameSession.relationships` is a free-form JSON field. Use namespaced keys
and/or a "network" subtree to organize relationship graphs.

### 2.1 NPC ↔ Player

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

### 2.2 NPC ↔ NPC

NPC–NPC relationships are still per-player (they represent the *player's view*
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

### 2.3 Player ↔ Player (Future Multiplayer)

For multiplayer, this field can also reference other players by ID:

```jsonc
{
  "player:alice": { "player:bob": 0.9, "npc:12": 0.3 }
}
```

Initially this can still live in a per-player `GameSession`. A future
`PlayerRelationship` table can be introduced later without affecting the
session structure.

---

## 3. Story Arcs and Quests

Story arcs and quests are layered on top of existing entities using `meta`
and `flags`:

- Tag content:
  - `GameScene.meta.arc_id = "main_romance_alex"`
  - `GameScene.meta.tags = ["arc:main_romance_alex", "stage:2"]`
  - `GameHotspot.meta.arc_triggers = [...]`
- Track progress in `GameSession.flags`:
  ```jsonc
  {
    "arcs": {
      "main_romance_alex": {
        "stage": 2,
        "seenScenes": [42, 43]
      }
    },
    "quests": {
      "find_lost_cat": {
        "status": "in_progress",
        "stepsCompleted": 1
      }
    }
  }
  ```

Clients and services can then:

- Check arc/quest state before offering interactions,
- Increment stages or mark steps completed via `PATCH /game/sessions/{id}`.

---

## 4. Items and World Events

Items and events can also be expressed initially via `flags` and `meta`:

- Inventory block:
  ```jsonc
  {
    "inventory": {
      "items": [
        { "id": "flower", "qty": 1 },
        { "id": "key:basement", "qty": 1 }
      ]
    }
  }
  ```

- World events (session-local view):
  ```jsonc
  {
    "events": {
      "power_outage_city": { "active": true, "triggeredAt": 123456.0 }
    }
  }
  ```

Content can declare triggers and effects in `meta`:

- `GameLocation.meta.world_events`,
- `GameHotspot.meta.triggers`,
- `GameScene.meta.effects`.

These definitions remain backend-agnostic; systems read/write them via
the generic session update endpoint.

---

## 5. Evolution Path

This approach is intentionally conservative:

- Core tables remain generic (no quest/item-specific columns).
- `GameSession` is extended only via:
  - `world_time` (already present),
  - `flags`,
  - `relationships`.
- API surface is generic:
  - `/game/sessions` (create/get/advance),
  - `PATCH /game/sessions/{id}` (world_time/flags/relationships),
  - `/game/npcs/presence` (life-sim input from schedules/state).

When you outgrow JSON-only modelling for a system (e.g. you want indexed
quests for analytics or cross-player events), you can introduce dedicated
tables and services and migrate the data progressively, keeping the
`flags`/`relationships` layout for backwards compatibility.

---

## 6. Per-World Relationship Scales (Tiers)

Many worlds (especially romance- or erotic-focused ones) need to express
relationship **levels** in a way that is:
- Configurable per world (not hard-coded by the engine),
- Still backed by simple numeric values in `GameSession.relationships`.

### 6.1 Numeric Base

Per session, per NPC, use numeric fields in `GameSession.relationships`:

```jsonc
{
  "npc:12": { "affinity": 72, "trust": 40, "flags": ["kissed_once"] },
  "npc:15": { "affinity": 35 }
}
```

- `affinity`, `trust`, etc. are floats/ints (`0–100` is a convenient convention,
  but not enforced by the schema).
- Scenes and world events compare numbers and/or flags directly.

### 6.2 World-Defined Tiers

Each `GameWorld` can define its own relationship tiers in `meta`, e.g.:

```jsonc
{
  "relationship_schemas": {
    "default": [
      { "id": "stranger", "min": 0,  "max": 9 },
      { "id": "acquaintance", "min": 10, "max": 29 },
      { "id": "friend", "min": 30, "max": 59 },
      { "id": "close_friend", "min": 60, "max": 79 },
      { "id": "lover", "min": 80, "max": 100 }
    ]
  }
}
```

- This is **author-controlled**: worlds can choose tame or spicy vocabularies,
  different thresholds, or multiple schemas if needed.
- The engine can provide helper logic (frontend) to resolve:
  - `(affinity, schema) -> tierId` (e.g., `"lover"`).

### 6.3 Using Tiers in Arcs and Conditions

World-story / arc graphs (see `GRAPH_UI_LIFE_SIM_PHASES.md`, Phase 7) can use
either raw numbers or tier IDs in their conditions:

- Numeric checks:
  - `relationships["npc:anne"].affinity >= 80`
- Tier-based checks (translated by helpers into numeric checks):
  - `"tier(relationships['npc:anne'].affinity) >= 'lover'"`
    → `affinity >= min('lover')` for the chosen schema.

This allows arcs like:

- “Unlock this scene when you and Anne are at **lover** level”,
- “Loop this arc as long as all three partners stay above **close_friend**.”

### 6.4 UI and Editor Implications

- World settings UI can offer a “Relationship scales” editor:
  - Add/Edit tiers with `id`, `min`, `max`, optional label/icon.
- Arc/quest editors can:
  - Let authors choose a numeric threshold *or* a tier name for conditions.
- Game UIs (2D/3D) can show tier labels/badges based on the active schema.

All of this remains backend-agnostic and compatible with the existing numeric
`GameSession.relationships` structure; tiers are a per-world, data-driven
overlay that world creators control.
