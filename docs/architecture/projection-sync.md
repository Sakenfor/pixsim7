# Projection Sync: Derived Read-Models for Game Entities

> Status: Implemented
> Date: 2026-03-01
> Related: [behavior_system/README.md](../behavior_system/README.md), [scene-concepts-map.md](./scene-concepts-map.md)

## Overview

Game entities (NPCs, locations, scenes) maintain **derived projection blobs** — pre-computed read-model summaries stored alongside their parent records.  These projections are kept in sync by **after-change hooks** wired into the nested CRUD system and by explicit sync calls after bundle import.

The design separates authored storage data from the runtime decision layer:

- **Storage / read-models (projections)**: `NPCSchedule`, `NpcExpression`, `GameHotspot`, scene graph rows.
- **Runtime**: Behavior routines in `world.meta.behavior.routines` — compiled from schedule projections, consumed by the behavior engine.

## Canonical Hierarchy

```
┌──────────────────────────────────────────────────────────┐
│                     RUNTIME LAYER                        │
│                                                          │
│  Behavior Engine reads:                                  │
│    world.meta.behavior.routines[routineId]               │
│      → compiled decision graph (time slots, activities)  │
│                                                          │
│  Runtime resolvers never write back to schedule rows.    │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │  compiled from
                          │
┌──────────────────────────────────────────────────────────┐
│               PROJECTION / READ-MODEL LAYER              │
│                                                          │
│  NPC schedule projection                                 │
│    source: NPCSchedule rows                              │
│    target: world.meta.behavior.routines[npc.schedule.N]  │
│                                                          │
│  NPC expression projection                               │
│    source: NpcExpression rows                             │
│    target: npc.personality._projections.npc_expressions   │
│                                                          │
│  Location hotspot projection                             │
│    source: GameHotspot rows (scope=location)             │
│    target: location.meta._projections.location_hotspots  │
│                                                          │
│  Scene graph projection                                  │
│    source: GameSceneNode + GameSceneEdge rows             │
│    target: scene.meta._projections.scene_graph            │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │  triggers
                          │
┌──────────────────────────────────────────────────────────┐
│                  AUTHORED DATA LAYER                     │
│                                                          │
│  NPCSchedule, NpcExpression, GameHotspot,                │
│  GameSceneNode, GameSceneEdge                            │
│                                                          │
│  CRUD via NestedEntityService (create/update/delete/     │
│  replace_all)                                            │
└──────────────────────────────────────────────────────────┘
```

## Flow Diagrams

### 1. Nested CRUD -> After-Change Hooks -> Projection Sync

```
  Client
    │
    ▼
  POST/PUT/DELETE  /api/v1/game/npcs/{npc_id}/schedules
    │
    ▼
  NestedEntityService.create / update / delete / replace_all
    │
    ├─ Persist row changes (INSERT/UPDATE/DELETE)
    │
    └─ _run_after_change_hook()
         │
         ▼
       sync_npc_schedule_projection(db, npc_id)
         │
         ├─ Load NPCSchedule rows for NPC
         ├─ Resolve location keys
         ├─ compile_routines_from_schedule_projections()
         └─ Upsert into world.meta.behavior.routines
```

Hook wiring is in `default_specs.py` via `NestedEntitySpec.after_change`:

| Parent Entity  | Nested Kind | after_change Hook                    |
|----------------|-------------|--------------------------------------|
| GameNPC        | schedule    | `sync_npc_schedule_projection`       |
| GameNPC        | expression  | `sync_npc_expression_projection`     |
| GameLocation   | hotspot     | `sync_location_hotspot_projection`   |
| GameScene      | node        | `sync_scene_graph_projection`        |
| GameScene      | edge        | `sync_scene_graph_projection`        |

### 2. Bundle Import -> Projection Sync

```
  POST /api/v1/game/worlds/projects/import
    │
    ▼
  GameProjectBundleService.import_bundle(req, owner_user_id)
    │
    ├─ Create GameWorld
    ├─ Import locations + hotspots
    ├─ Import NPCs + schedules + expressions
    ├─ Import scenes + nodes + edges
    ├─ Import items
    │
    └─ Post-import projection sync:
         for each imported location:
           sync_location_hotspot_projection(db, location_id)
         for each imported scene:
           sync_scene_graph_projection(db, scene_id)
         for each imported NPC:
           sync_npc_schedule_projection(db, npc_id)
           sync_npc_expression_projection(db, npc_id)
```

### 3. Manual World-Level Resync

```
  POST /api/v1/game/worlds/{world_id}/projections/resync
    │
    ▼
  resync_world_projections(db, world_id)
    │
    ├─ SELECT all NPC ids WHERE world_id = ?
    │    for each NPC:
    │      sync_npc_schedule_projection(db, npc_id)
    │      sync_npc_expression_projection(db, npc_id)
    │
    ├─ SELECT all Location ids WHERE world_id = ?
    │    for each Location:
    │      sync_location_hotspot_projection(db, location_id)
    │
    └─ SELECT all Scene ids WHERE world_id = ?
         for each Scene:
           sync_scene_graph_projection(db, scene_id)
    │
    └─ Returns: { npcs_synced, locations_synced, scenes_synced,
                   elapsed_ms, warnings[] }
```

The resync endpoint is idempotent — each sync function internally
compares current vs computed projection and skips the commit when
nothing changed.

### 4. Runtime Resolver Reads Behavior Routines

```
  Behavior Engine (tick / NPC decision)
    │
    ▼
  Read world.meta.behavior.routines[npc.routineId]
    │
    ├─ Evaluate time_slot nodes against current world_time
    ├─ Score preferredActivities
    └─ Select activity → update NPCState

  The engine NEVER writes back to NPCSchedule rows.
```

## Projection Storage Locations

| Projection     | Stored In     | JSON Path                                          |
|----------------|---------------|----------------------------------------------------|
| Schedule       | GameWorld     | `meta.behavior.routines[routineId]`                |
| Expression     | GameNPC       | `personality._projections.npc_expressions`         |
| Hotspot        | GameLocation  | `meta._projections.location_hotspots`              |
| Scene Graph    | GameScene     | `meta._projections.scene_graph`                    |

## Key Files

| File | Purpose |
|------|---------|
| `services/game/derived_projections.py` | Expression, hotspot, scene graph sync + `resync_world_projections` |
| `services/game/npc_schedule_projection.py` | Schedule → routine compilation |
| `services/game/crud/default_specs.py` | Hook wiring (`after_change` on NestedEntitySpec) |
| `services/game/crud/crud_service.py` | Hook invocation (`_run_after_change_hook`) |
| `services/game/project_bundle.py` | Post-import sync calls |
| `api/v1/game_worlds.py` | Resync API endpoint |
| `tests/services/test_projection_sync.py` | Integration tests |
| `tests/services/test_npc_schedule_projection.py` | Schedule compilation unit tests |

## Explicit Non-Goals (This Pass)

- **No reverse sync** from compiled behavior routines back to `NPCSchedule` rows. Routines are a one-way derivation from schedule storage.
- **No event-sourcing** of projection changes. Projections are recomputed from current state, not from a change log.
- **No cross-world projection sharing**. Each world's projections are self-contained.
