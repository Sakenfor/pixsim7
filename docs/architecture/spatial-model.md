# Spatial Model Architecture

**Status:** Implemented (v1)
**Last Updated:** 2025-12-14

## Overview

The spatial model provides a unified, reusable framework for positioning and orienting game objects in 2D and 3D space. It's designed to be **2D-first** (supporting current workflows) but **3D-ready** (avoiding future breaking changes).

This document describes the spatial model implementation and how it generalizes to all game objects (NPCs, items, props, locations, etc.).

## Goals

1. **2D now, 3D later**: Support current 2D workflows (top-down, side-view) without committing to full 3D, but make 3D extension painless
2. **Reusable abstractions**: One `Transform` type works for NPCs, items, props, triggers, etc.
3. **Backend authoritative**: Game core owns spatial state; editors and simulations consume it via services
4. **No breaking changes**: Additive fields and backward compatibility with existing location tracking
5. **Game-Maker-like objects**: Enable "place anything anywhere" workflows for world building

## Core Types

All types are defined in `packages/shared/types/src/game.ts` and exported via both named exports and the `Game` namespace.

### Transform

```typescript
interface Transform {
  worldId: WorldId;              // World this transform belongs to
  locationId?: LocationId;       // Optional location within world (for local coordinates)
  position: Position3D;          // Position in space (z optional for 2D)
  orientation?: Orientation;     // Rotation (yaw/pitch/roll, all optional)
  scale?: Scale;                 // Scale factors (all optional, default 1.0)
  space?: CoordinateSpace;       // Hint for renderers: 'world_2d' | 'world_3d' | 'ui_2d'
}
```

**Design notes:**
- **2D workflows**: Use `x`, `y`, and optionally `yaw`; leave `z`, `pitch`, `roll` undefined
- **3D workflows**: Use `x`, `y`, `z` and full orientation
- **Location context**: `worldId` or `locationId` determines which space we're in
- **Future**: Could add `parentId` for hierarchical transforms (relative positioning)

### Position3D

```typescript
interface Position3D {
  x: number;
  y: number;
  z?: number;  // Optional for 2D
}
```

### Orientation

```typescript
interface Orientation {
  yaw?: number;    // Rotation around Y axis (heading) - primary for 2D
  pitch?: number;  // Rotation around X axis (elevation)
  roll?: number;   // Rotation around Z axis (tilt/bank)
}
```

All angles in **degrees**. All fields optional.

### Scale

```typescript
interface Scale {
  x?: number;
  y?: number;
  z?: number;
}
```

Defaults to uniform scale of 1.0 if not specified.

### CoordinateSpace

```typescript
type CoordinateSpace = 'world_2d' | 'world_3d' | 'ui_2d';
```

Helps renderers and editors treat transforms differently:
- `'world_2d'`: 2D top-down or side-view (z=0 or ignored)
- `'world_3d'`: Full 3D space with all axes
- `'ui_2d'`: UI overlay coordinates (screen space)

### SpatialObject

```typescript
interface SpatialObject {
  id: number;                      // Entity ID (use branded IDs like NpcId, ItemId, etc.)
  kind: SpatialObjectKind;         // 'npc' | 'player' | 'item' | 'prop' | 'trigger' | ...
  transform: Transform;            // Spatial transform
  tags?: string[];                 // Optional tags for editor filtering
  meta?: Record<string, unknown>;  // Optional metadata
}
```

**Design notes:**
- This is NOT inheritance - it's a component/shape that entities can adopt
- NPC/Item/Prop DTOs can include a `spatial: SpatialObject` field
- Or they can directly embed these fields in their own structure
- Tags help editors filter and categorize objects (e.g., `["interactive", "decoration"]`)

## Backend Integration

### Database Schema

The `NPCState` model stores spatial transforms in a JSON field:

```python
class NPCState(SQLModel, HasStats, table=True):
    npc_id: Optional[int] = Field(primary_key=True)
    current_location_id: Optional[int] = Field(...)  # Backward compatibility
    state: Dict[str, Any] = Field(...)               # Existing state
    transform: Optional[Dict[str, Any]] = Field(     # NEW: Spatial transform
        default=None,
        sa_column=Column(JSON),
        description="Spatial transform matching shared Transform type"
    )
```

**Backward compatibility:**
- `current_location_id` is preserved for existing code
- `transform` is optional and additive
- If `transform` is null, only `current_location_id` is used

### NpcSpatialService

The `NpcSpatialService` provides the canonical API for managing NPC spatial data:

**Location:** `pixsim7/backend/main/services/game/npc_spatial_service.py`

**Methods:**
- `get_npc_transform(npc_id)` - Get current transform, with fallback to location_id
- `update_npc_transform(npc_id, transform)` - Update full transform
- `update_npc_position(npc_id, x, y, z=None, ...)` - Convenience method for position-only updates
- `batch_update_transforms(updates)` - Batch update for multiple NPCs
- `clear_npc_transform(npc_id)` - Clear transform data

**Example usage:**
```python
from pixsim7.backend.main.services.game import NpcSpatialService

service = NpcSpatialService(db)

# Update NPC position
transform = await service.update_npc_position(
    npc_id=123,
    x=100, y=50, z=0,
    world_id=1,
    location_id=42
)

# Update full transform with rotation
transform = await service.update_npc_transform(
    npc_id=123,
    transform={
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 100, "y": 50, "z": 0},
        "orientation": {"yaw": 90},
        "space": "world_2d"
    }
)
```

### Prompt Context Integration

The NPC prompt mapping includes spatial data:

**Location:** `pixsim7/backend/main/services/characters/npc_prompt_mapping.py`

```python
NPC_FIELD_MAPPING = {
    "transform": FieldMapping(
        target_path="spatial.transform",
        source="npc",
        fallback="none",
        npc_path="transform",  # From NPCState.transform
    ),
}
```

This means NPC snapshots for prompts will automatically include:
```python
{
    "spatial": {
        "transform": {
            "worldId": 1,
            "locationId": 42,
            "position": {"x": 100, "y": 50},
            "orientation": {"yaw": 90},
            "space": "world_2d"
        }
    }
}
```

### API Integration

The `/api/v1/npcs/presence` endpoint returns spatial data:

**Updated DTO:**
```python
class NpcPresenceDTO(BaseModel):
    npc_id: int
    location_id: int
    state: Dict[str, Any]
    transform: Optional[Dict[str, Any]] = None  # NEW: Spatial transform
```

The endpoint automatically includes transform data when present in `NPCState`.

## Frontend Integration

### Using Transform Types

```typescript
import { Transform, SpatialObject } from '@pixsim7/shared.types';
// OR
import { Game } from '@pixsim7/shared.types';

// Create a 2D transform
const npcTransform: Transform = {
  worldId: WorldId(1),
  locationId: LocationId(42),
  position: { x: 100, y: 50 },
  orientation: { yaw: 90 },
  space: 'world_2d'
};

// Use SpatialObject shape
const npc: SpatialObject = {
  id: 123,
  kind: 'npc',
  transform: npcTransform,
  tags: ['interactive', 'friendly']
};
```

### Consuming Presence Data

```typescript
import { NpcPresenceDTO } from '@pixsim7/shared.types';

const presence = await api.get<NpcPresenceDTO[]>('/api/v1/npcs/presence', {
  params: { world_id: 1, location_id: 42 }
});

presence.forEach(p => {
  if (p.transform) {
    // NPC has spatial data
    const pos = p.transform.position;
    renderNpc(p.npc_id, pos.x, pos.y, pos.z ?? 0);
  } else {
    // Fallback to location-only
    renderNpcAtLocation(p.npc_id, p.location_id);
  }
});
```

## Future Extensions

### Props and Items

Props and items will reuse the same `Transform` and `SpatialObject` patterns:

```typescript
// Prop example
interface PropDTO {
  id: number;
  name: string;
  assetId: number;
  spatial: SpatialObject;  // Reuse SpatialObject shape
}

// Item example
interface ItemInstance {
  id: number;
  itemDefId: string;
  transform: Transform;    // Or embed transform directly
  quantity: number;
}
```

**Backend:**
- Create `PropState` or `ItemInstance` tables with `transform` JSON field
- Create `PropSpatialService` or `ItemSpatialService` following same pattern
- Reuse same transform schema

### Locations and Hierarchies

Locations can have their own transforms for world-anchoring:

```typescript
interface GameLocationDetail {
  id: LocationId;
  name: string;
  transform: Transform;      // Location's position in world
  children: SpatialObject[]; // Objects placed within location
}
```

**Hierarchical transforms:**
- Location has world-space transform
- Objects within location have local-space transforms (relative to location)
- Renderer computes final world position: `locationTransform * objectTransform`

### Triggers and Spawn Points

```typescript
// Trigger zone
const trigger: SpatialObject = {
  id: 1,
  kind: 'trigger',
  transform: { position: { x: 50, y: 50 }, ... },
  tags: ['cutscene', 'one-time'],
  meta: {
    eventId: 'cutscene_intro',
    bounds: { radius: 10 }
  }
};

// Spawn point
const spawn: SpatialObject = {
  id: 2,
  kind: 'spawn',
  transform: { position: { x: 0, y: 0 }, orientation: { yaw: 0 }, ... },
  tags: ['player', 'default']
};
```

### 3D Workflow

When ready for 3D, simply populate the optional fields:

```typescript
// 3D NPC placement
const transform3d: Transform = {
  worldId: WorldId(1),
  locationId: LocationId(42),
  position: { x: 10, y: 2, z: 5 },          // Full 3D position
  orientation: { yaw: 45, pitch: -15, roll: 0 },  // Full 3D rotation
  scale: { x: 1.5, y: 1.5, z: 1.5 },        // Non-uniform scale
  space: 'world_3d'
};
```

**No schema changes needed** - all fields already exist and are optional.

## Design Patterns

### Object Placement Pattern

The spatial model enables a "Game-Maker-like" workflow:

1. **Create object** (NPC, prop, item, trigger)
2. **Define transform** (position, rotation, scale)
3. **Place in world** via `SpatialService.update_transform()`
4. **Query objects** via location, bounds, or tags

All object types follow the same pattern, making tools and editors reusable.

### Component Pattern, Not Inheritance

`SpatialObject` is a **shape**, not a base class:

```typescript
// GOOD: Embed as a field
interface NpcWithSpatial extends GameNpcDetail {
  spatial: SpatialObject;
}

// GOOD: Embed fields directly
interface ItemInstance {
  id: number;
  kind: 'item';
  transform: Transform;
  tags: string[];
}

// AVOID: Don't treat as inheritance
class Npc extends SpatialObject { ... }  // TypeScript doesn't work this way
```

This keeps DTOs flat and makes serialization straightforward.

### 2D vs 3D Rendering

Renderers check `space` and presence of `z`:

```typescript
function renderObject(obj: SpatialObject) {
  const { position, orientation, space } = obj.transform;

  if (space === 'world_2d' || position.z === undefined) {
    // 2D rendering
    render2D(position.x, position.y, orientation?.yaw ?? 0);
  } else {
    // 3D rendering
    render3D(
      position.x,
      position.y,
      position.z,
      orientation?.yaw ?? 0,
      orientation?.pitch ?? 0,
      orientation?.roll ?? 0
    );
  }
}
```

## Migration Strategy

### Current State

- NPCs have `current_location_id` for presence tracking
- No position within location
- No rotation or scale data

### Migration Path

1. ✅ **Phase 1 (Current)**: Add optional `transform` field to `NPCState`
   - Existing code continues using `current_location_id`
   - New code can populate `transform`
   - Fully backward compatible

2. **Phase 2**: Populate transforms for NPCs in key locations
   - Run migration script to set default positions
   - Use `NpcSpatialService` to update positions as needed

3. **Phase 3**: Extend to props and items
   - Create `PropState` and `ItemInstance` with `transform` fields
   - Build spatial editors for placement

4. **Phase 4**: Migrate UIs to use transforms
   - Update 2D location viewer to render NPC positions
   - Build drag-and-drop placement tools

5. **Phase 5**: Enable 3D when ready
   - Populate `z`, `pitch`, `roll` for 3D locations
   - Switch renderers to 3D mode
   - No schema changes needed

## Related Systems

- **Actor System** (`packages/shared/types/src/game.ts`): Base entity system for NPCs, players, agents
  - Already includes `locationId` field
  - Could be extended with `transform` field for consistency

- **NPC Zones** (`packages/shared/types/src/npcZones.ts`): Body interaction zones
  - NOT the same as spatial zones
  - These are zones on NPC bodies for tool interaction (romance/sensual gameplay)
  - Spatial zones would be collision/trigger volumes in world space

- **Prompt Context** (`pixsim7/backend/main/services/characters/prompt_context_service.py`):
  - Now includes spatial transform in NPC snapshots
  - Enables LLM to be aware of NPC positioning for context

## Examples

### Example 1: Place NPC in 2D Location

```python
# Backend
from pixsim7.backend.main.services.game import NpcSpatialService

service = NpcSpatialService(db)
await service.update_npc_position(
    npc_id=123,
    x=150, y=200,
    world_id=1,
    location_id=5
)
```

```typescript
// Frontend
const presence = await api.get('/api/v1/npcs/presence', {
  params: { world_id: 1, location_id: 5 }
});

// Render NPC at position
const npc = presence.find(p => p.npc_id === 123);
if (npc?.transform) {
  renderSprite(npc.transform.position.x, npc.transform.position.y);
}
```

### Example 2: Create Prop with 3D Transform

```python
# Future: PropSpatialService
service = PropSpatialService(db)
await service.create_prop(
    prop_def_id="furniture_chair",
    world_id=1,
    location_id=5,
    transform={
        "position": {"x": 10, "y": 0, "z": 5},
        "orientation": {"yaw": 45, "pitch": 0, "roll": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "space": "world_3d"
    }
)
```

### Example 3: Query Objects in Bounds

```python
# Future: SpatialQueryService
results = await spatial_service.query_objects_in_bounds(
    location_id=5,
    bounds={"x": 0, "y": 0, "width": 100, "height": 100},
    kinds=["npc", "prop", "trigger"]
)
# Returns all objects within 2D rect
```

## Summary

The spatial model provides:
- ✅ Unified `Transform` and `SpatialObject` types for all game objects
- ✅ 2D-first design with seamless 3D extension
- ✅ Backend authoritative storage in `NPCState.transform`
- ✅ `NpcSpatialService` for clean API access
- ✅ Prompt context integration for LLM awareness
- ✅ API endpoint integration for frontend consumption
- ✅ Backward compatibility with existing location tracking
- 🔜 Ready for props, items, triggers, and hierarchical transforms

**Next steps:**
- Build spatial placement UI/editor
- Extend to props and items
- Add spatial query utilities (bounds, radius, raycasts)
- Populate default transforms for existing NPCs
