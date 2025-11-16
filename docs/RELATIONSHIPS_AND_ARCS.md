# Relationships, Arcs, and Future Systems (Quests / Items / Events)

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

