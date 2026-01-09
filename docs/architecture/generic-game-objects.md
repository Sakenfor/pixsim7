# Generic Game Object Architecture

**Status:** Implemented (v1)
**Last Updated:** 2025-12-14
**Related:** [Spatial Model](./spatial-model.md)

## Overview

This document describes the **composition-based, entity-agnostic game object system** that generalizes across NPCs, items, props, players, and other game entities. The system avoids inheritance hierarchies in favor of discriminated unions and shared component shapes.

## Goals

1. **Composition over inheritance**: No base classes - entities compose shared shapes
2. **Discriminated unions**: Type-safe entity variants with TypeScript narrowing
3. **Entity-agnostic mapping**: One mapper infrastructure, multiple entity types
4. **Data-driven configuration**: Entity behavior defined by mapping tables, not code
5. **Backward compatibility**: Additive changes, existing NPC code continues to work

## Architecture Principles

### 1. Composition-Based Design

Instead of:
```typescript
// ❌ Inheritance (what we DON'T do)
class Entity { ... }
class NPC extends Entity { ... }
class Item extends Entity { ... }
```

We use:
```typescript
// ✅ Composition (what we DO)
interface GameObjectBase {
  kind: string;
  id: number;
  name: string;
  transform: Transform;
  tags?: string[];
  meta?: Record<string, unknown>;
}

interface NpcObject extends GameObjectBase {
  kind: 'npc';
  npcData?: NpcObjectData;
}

type GameObject = NpcObject | ItemObject | PropObject | ...;
```

**Why?**
- DTOs are flat and easy to serialize
- No runtime type checking overhead
- TypeScript discriminated unions provide type safety
- Services operate on shapes, not classes

### 2. Discriminated Unions

The `kind` field discriminates between entity types:

```typescript
function processObject(obj: GameObject) {
  switch (obj.kind) {
    case 'npc':
      // TypeScript narrows obj to NpcObject
      console.log(obj.npcData?.personaId);
      break;
    case 'item':
      // TypeScript narrows obj to ItemObject
      console.log(obj.itemData.quantity);
      break;
  }
}
```

**Type guards** provide additional safety (from `@pixsim7/shared.logic-core/game`):
```typescript
import { isNpcObject } from '@pixsim7/shared.logic-core/game';

if (isNpcObject(obj)) {
  // obj is now NpcObject
  const persona = obj.npcData?.personaId;
}
```

### 3. Entity-Agnostic Infrastructure

All entity types use the same infrastructure:
- **FieldMapping**: Generic field mapping system
- **Generic resolver**: Entity-agnostic context resolution
- **Transform**: Shared spatial model (see [spatial-model.md](./spatial-model.md))

## Core Types

**Types:** `packages/shared/types/src/game.ts` (`@pixsim7/shared.types`)
**Type Guards:** `packages/shared/logic-core/src/game.ts` (`@pixsim7/shared.logic-core/game`)

### GameObjectBase

```typescript
interface GameObjectBase {
  kind: 'npc' | 'item' | 'prop' | 'player' | 'trigger' | (string & {});
  id: number;
  name: string;
  transform: Transform;  // From spatial model
  tags?: string[];
  meta?: Record<string, unknown>;
}
```

**Shared fields:**
- `kind`: Discriminator for type narrowing
- `id`: Entity ID (use branded types like NpcId, ItemId)
- `name`: Display name
- `transform`: Position, rotation, scale (see [spatial-model.md](./spatial-model.md))
- `tags`: Optional tags for filtering/categorization
- `meta`: Optional metadata for extensions

### Entity Variants

Each entity type extends `GameObjectBase` with type-specific data:

#### NpcObject

```typescript
interface NpcObject extends GameObjectBase {
  kind: 'npc';
  id: NpcId;
  npcData?: NpcObjectData;
}

interface NpcObjectData {
  personaId?: string;
  scheduleId?: string;
  expressionState?: string;
  portraitAssetId?: number;
  role?: string;
  brainState?: Record<string, unknown>;
}
```

#### ItemObject

```typescript
interface ItemObject extends GameObjectBase {
  kind: 'item';
  itemData: ItemObjectData;
}

interface ItemObjectData {
  itemDefId: string;
  quantity: number;
  durability?: number;
  state?: Record<string, unknown>;
}
```

#### PropObject

```typescript
interface PropObject extends GameObjectBase {
  kind: 'prop';
  propData: PropObjectData;
}

interface PropObjectData {
  propDefId: string;
  assetId?: number;
  interactionState?: string;
  config?: Record<string, unknown>;
}
```

#### PlayerObject

```typescript
interface PlayerObject extends GameObjectBase {
  kind: 'player';
  playerData: PlayerObjectData;
}

interface PlayerObjectData {
  userId: string;
  controlType: 'local' | 'remote';
  multiplayerSessionId?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
  cameraTarget?: { ... };
  inputState?: Record<string, unknown>;
}
```

#### TriggerObject

```typescript
interface TriggerObject extends GameObjectBase {
  kind: 'trigger';
  triggerData: TriggerObjectData;
}

interface TriggerObjectData {
  triggerType: 'zone' | 'proximity' | 'interaction' | 'event';
  eventId?: string;
  bounds?: { type: 'circle' | 'rect' | 'polygon'; ... };
  conditions?: Record<string, unknown>;
  repeatable?: boolean;
  cooldownSeconds?: number;
}
```

### GameObject Union

```typescript
type GameObject =
  | NpcObject
  | ItemObject
  | PropObject
  | PlayerObject
  | TriggerObject;
```

## Generic Mapping Infrastructure

### FieldMapping (Entity-Agnostic)

**Location:** `pixsim7/backend/main/services/prompt_context/mapping.py`

```python
@dataclass
class FieldMapping:
    target_path: str           # Where to write in snapshot (dot notation)
    source: str                # Primary source name ("template", "runtime", etc.)
    fallback: str              # Fallback source name
    source_paths: Optional[Dict[str, str]] = None  # Path per source
    stat_axis: Optional[str] = None
    stat_package_id: Optional[str] = None
    transform: Optional[Callable[[Any, Dict[str, Any]], Any]] = None
```

**Design:**
- No hardcoded source names - works with any source
- `source_paths` dict allows flexible source naming
- Backward compatible with `instance_path`/`npc_path` for NPCs
- Transform hook for per-field reshaping

**Example - NPC (backward compatible):**
```python
FieldMapping(
    target_path="traits.mood",
    source="instance",
    fallback="npc",
    instance_path="current_state.mood",
    npc_path="state.mood"
)
```

**Example - Item (generic):**
```python
FieldMapping(
    target_path="state.durability",
    source="runtime",
    fallback="template",
    source_paths={
        "template": "default_durability",
        "runtime": "durability"
    }
)
```

**Example - Prop (with transform):**
```python
FieldMapping(
    target_path="visual.assetId",
    source="template",
    fallback="none",
    source_paths={"template": "asset_id"},
    transform=lambda value, ctx: f"asset:{value}"
)
```

### Generic Resolver

**Location:** `pixsim7/backend/main/services/prompt_context/generic_resolver.py`

```python
def resolve_entity_context(
    entity_type: str,
    mapping: Dict[str, FieldMapping],
    sources: Dict[str, Any],
    entity_id: Optional[str] = None,
    entity_name: Optional[str] = None,
    template_id: Optional[str] = None,
    prefer_live: bool = True,
    **kwargs
) -> Dict[str, Any]:
    """
    Generic entity context resolver.

    Works with any entity type by accepting:
    - mapping: Field mapping table for the entity
    - sources: Dict of source_name -> source_data

    Returns:
    - Dict with entity_type, entity_id, fields, source
    """
```

**Usage pattern:**

```python
# For NPCs
sources = {
    "instance": character_instance,
    "npc": game_npc,
    "state": npc_state
}
context = resolve_entity_context(
    entity_type="npc",
    mapping=get_npc_field_mapping(),
    sources=sources,
    entity_id=npc_id,
    entity_name=npc.name
)

# For items
sources = {
    "template": item_definition,
    "runtime": item_instance
}
context = resolve_entity_context(
    entity_type="item",
    mapping=get_item_field_mapping(),
    sources=sources,
    entity_id=item_id,
    entity_name=item_def.name
)
```

## Entity-Specific Mappings

Each entity type has its own mapping configuration file:

- **NPCs**: `pixsim7/backend/main/services/characters/npc_prompt_mapping.py`
- **Items**: `pixsim7/backend/main/services/characters/item_prompt_mapping.py` (placeholder)
- **Props**: `pixsim7/backend/main/services/characters/prop_prompt_mapping.py` (placeholder)
- **Players**: `pixsim7/backend/main/services/characters/player_prompt_mapping.py` (placeholder)

These files are **pure data** - no logic, just mapping tables:

```python
# npc_prompt_mapping.py
NPC_FIELD_MAPPING: Dict[str, FieldMapping] = {
    "name": FieldMapping(...),
    "personality.openness": FieldMapping(...),
    "transform": FieldMapping(...),
}

def get_npc_field_mapping() -> Dict[str, FieldMapping]:
    return NPC_FIELD_MAPPING
```

## Spatial Service Pattern

All entity types should follow the same spatial service pattern:

**NpcSpatialService** (reference implementation):
- `get_npc_transform(npc_id)` - Get transform with fallback
- `update_npc_transform(npc_id, transform)` - Update full transform
- `update_npc_position(npc_id, x, y, z, ...)` - Convenience method
- `batch_update_transforms(updates)` - Batch operations
- `clear_npc_transform(npc_id)` - Clear transform data

**Future services** (follow same pattern):
- `ItemSpatialService` - Same methods for items
- `PropSpatialService` - Same methods for props
- `PlayerSpatialService` - Same methods for players

All services work with `Transform` dicts matching the GameObject schema.

## Adding a New Entity Type

To add a new entity type (e.g., "vehicle"), follow these steps:

### 1. Define Types (TypeScript)

**File:** `packages/shared/types/src/game.ts`

```typescript
// 1. Add to GameObjectBase kind union (already allows custom strings)
// 2. Define entity-specific data interface
export interface VehicleObjectData {
  vehicleDefId: string;
  fuelLevel: number;
  passengers?: number[];
  state?: 'parked' | 'moving' | 'damaged';
}

// 3. Define entity variant
export interface VehicleObject extends GameObjectBase {
  kind: 'vehicle';
  vehicleData: VehicleObjectData;
}

// 4. Add to GameObject union
export type GameObject =
  | NpcObject
  | ItemObject
  | PropObject
  | PlayerObject
  | TriggerObject
  | VehicleObject;  // Add here

// 5. Add type guard in @pixsim7/shared.logic-core/game
// File: packages/shared/logic-core/src/game.ts
export function isVehicleObject(obj: GameObject): obj is VehicleObject {
  return obj.kind === 'vehicle';
}
```

### 2. Create Mapping Configuration (Python)

**File:** `pixsim7/backend/main/services/characters/vehicle_prompt_mapping.py`

```python
from typing import Dict
from pixsim7.backend.main.services.prompt_context.mapping import FieldMapping

VEHICLE_FIELD_MAPPING: Dict[str, FieldMapping] = {
    "name": FieldMapping(
        target_path="name",
        source="template",
        fallback="runtime",
        source_paths={
            "template": "name",
            "runtime": "override_name"
        }
    ),
    "fuelLevel": FieldMapping(
        target_path="state.fuel",
        source="runtime",
        fallback="template",
        source_paths={
            "template": "default_fuel",
            "runtime": "fuel_level"
        }
    ),
    "transform": FieldMapping(
        target_path="spatial.transform",
        source="runtime",
        fallback="none",
        source_paths={"runtime": "transform"}
    ),
}

def get_vehicle_field_mapping() -> Dict[str, FieldMapping]:
    return VEHICLE_FIELD_MAPPING
```

### 3. Create Database Model (Python)

**File:** `pixsim7/backend/main/domain/game/models.py`

```python
class VehicleDefinition(SQLModel, table=True):
    __tablename__ = "vehicle_definitions"
    id: Optional[int] = Field(default=None, primary_key=True)
    vehicle_def_id: str = Field(max_length=64, unique=True)
    name: str
    default_fuel: float = Field(default=100.0)
    meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

class VehicleInstance(SQLModel, table=True):
    __tablename__ = "vehicle_instances"
    id: Optional[int] = Field(default=None, primary_key=True)
    vehicle_def_id: str = Field(foreign_key="vehicle_definitions.vehicle_def_id")
    fuel_level: float
    transform: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Spatial transform matching shared Transform type"
    )
    state: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
```

### 4. Create Spatial Service (Python)

**File:** `pixsim7/backend/main/services/game/vehicle_spatial_service.py`

```python
class VehicleSpatialService:
    """Service for managing vehicle spatial transforms."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_vehicle_transform(self, vehicle_id: int) -> Optional[Dict[str, Any]]:
        # Follow NpcSpatialService pattern
        ...

    async def update_vehicle_transform(self, vehicle_id: int, transform: Dict[str, Any]) -> Dict[str, Any]:
        # Follow NpcSpatialService pattern
        ...
```

### 5. Use Generic Resolver

```python
from pixsim7.backend.main.services.prompt_context.generic_resolver import resolve_entity_context
from pixsim7.backend.main.services.characters.vehicle_prompt_mapping import get_vehicle_field_mapping

async def get_vehicle_context(vehicle_id: int, db: AsyncSession):
    # Load sources
    vehicle_def = await db.get(VehicleDefinition, ...)
    vehicle_instance = await db.get(VehicleInstance, vehicle_id)

    # Prepare sources
    sources = {
        "template": vehicle_def,
        "runtime": vehicle_instance
    }

    # Resolve using generic resolver
    context = resolve_entity_context(
        entity_type="vehicle",
        mapping=get_vehicle_field_mapping(),
        sources=sources,
        entity_id=str(vehicle_id),
        entity_name=vehicle_def.name
    )

    return context
```

## Design Patterns

### Pattern 1: Type-Safe Object Processing

```typescript
// Generic function works with all object types
function renderGameObject(obj: GameObject) {
  // Common rendering for all types
  const { x, y } = obj.transform.position;
  renderTransform(x, y, obj.transform.orientation?.yaw ?? 0);

  // Type-specific rendering via discriminated union
  switch (obj.kind) {
    case 'npc':
      renderNpcSprite(obj.npcData?.expressionState);
      break;
    case 'item':
      renderItemIcon(obj.itemData.itemDefId);
      break;
    case 'prop':
      renderPropModel(obj.propData.assetId);
      break;
    // ...
  }
}
```

### Pattern 2: Filter by Tag

```typescript
import { isNpcObject } from '@pixsim7/shared.logic-core/game';

// All objects have tags, can filter generically
function findObjectsByTag(objects: GameObject[], tag: string): GameObject[] {
  return objects.filter(obj => obj.tags?.includes(tag));
}

// Use type guards to narrow results
const interactiveNpcs = findObjectsByTag(allObjects, 'interactive')
  .filter(isNpcObject);
```

### Pattern 3: Spatial Queries

```typescript
// All objects have transforms, can query spatially
function findObjectsInRadius(
  objects: GameObject[],
  center: Position3D,
  radius: number
): GameObject[] {
  return objects.filter(obj => {
    const pos = obj.transform.position;
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  });
}
```

### Pattern 4: Data-Driven Mapping

```python
# No if/elif on entity type - just pass different mapping
def get_entity_snapshot(entity_type: str, entity_id: str, db: AsyncSession):
    # Select mapping based on entity type (data-driven)
    mapping_registry = {
        "npc": get_npc_field_mapping,
        "item": get_item_field_mapping,
        "prop": get_prop_field_mapping,
        "player": get_player_field_mapping,
    }

    mapping = mapping_registry[entity_type]()

    # Rest is identical for all types
    sources = load_sources(entity_type, entity_id, db)
    return resolve_entity_context(entity_type, mapping, sources, ...)
```

## Benefits

### 1. No Inheritance Complexity
- Flat DTOs are easy to serialize/deserialize
- No runtime type hierarchy overhead
- Clear data ownership and shape

### 2. Type Safety
- Discriminated unions provide compile-time type narrowing
- Type guards ensure runtime safety
- IntelliSense autocomplete works perfectly

### 3. Entity-Agnostic Services
- One mapping system for all entity types
- One spatial service pattern for all entity types
- One resolver for all entity types

### 4. Data-Driven
- Entity behavior defined by mapping tables
- No if/elif branching on entity type
- Easy to extend with new entity types

### 5. Backward Compatibility
- Existing NPC code continues to work
- New types are additive
- Migration path is incremental

## Related Systems

- **Spatial Model** ([spatial-model.md](./spatial-model.md)): Transform system used by all GameObject variants
- **Actor System** (`packages/shared/types/src/game.ts`): Previous entity system, being migrated to GameObject
- **ECS Components** (`packages/shared/types/src/game.ts`): Component-based state for NPCs, can extend to other entities

## Migration Strategy

### Current State
- NPCs use custom types (GameNpcDetail, NpcPresenceDTO)
- NPC-specific mapping and resolver
- No generalization for other entity types

### Migration Path

1. ✅ **Phase 1 (Complete)**: Define GameObject types
   - Added GameObjectBase and variants
   - Created discriminated union
   - Added type guards

2. ✅ **Phase 2 (Complete)**: Generalize mapping infrastructure
   - Made FieldMapping entity-agnostic
   - Created generic resolver
   - Added placeholder mappings for items, props, players

3. **Phase 3 (Future)**: Implement items/props
   - Create database models for items/props
   - Implement spatial services following NPC pattern
   - Create item/prop-specific resolvers using generic infrastructure

4. **Phase 4 (Future)**: Migrate NPC APIs to GameObject
   - Add GameObject-compatible endpoints alongside existing ones
   - Update frontend to use GameObject types
   - Deprecate legacy NPC types (backward compatible)

5. **Phase 5 (Future)**: Extend to all entity types
   - Players use GameObject model
   - Triggers use GameObject model
   - Custom entity types (vehicles, buildings, etc.) use GameObject model

## Summary

The generic GameObject architecture provides:
- ✅ Composition-based design (no inheritance)
- ✅ Discriminated unions for type safety
- ✅ Entity-agnostic mapping infrastructure
- ✅ Generic resolver working with any entity type
- ✅ Spatial service pattern for all entities
- ✅ Backward compatibility with existing NPC code
- ✅ Clear extension path for new entity types

**Next steps:**
- Implement item and prop database models
- Build item/prop spatial services
- Create item/prop-specific resolvers
- Build generic entity editor UI
- Migrate existing NPC code to GameObject pattern (optional)
