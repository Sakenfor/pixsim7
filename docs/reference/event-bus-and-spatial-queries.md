# Event Bus and Spatial Query System

This document explains how to use the game event bus and spatial query service for tracking game state changes and querying entity positions.

## Overview

The system provides two main components:

1. **Event Bus**: A pub/sub system for game state change notifications
2. **Spatial Query Service**: An in-memory index for fast entity position lookups

Both are designed to be:
- **Additive**: Don't break existing APIs
- **Engine-agnostic**: Independent of 2D/3D renderer
- **Minimal**: Simple APIs for MVP use cases
- **Server authoritative**: Backend-side with WebSocket forwarding hooks

## Naming and Typing Conventions

### Event Type Naming
Event types use a namespaced format: `{namespace}:{action}`

**Conventions:**
- Use lowercase with underscores: `game:entity_moved` ✅ not `game:EntityMoved` ❌
- Namespace by domain: `game:`, `job:`, `asset:`, `scene:`
- Use past tense for completed actions: `entity_moved`, not `entity_move`
- Be specific: `entity_moved` is better than `update`

**Examples:**
- `game:entity_moved` - Entity transform changed
- `game:entity_spawned` - Entity added to world
- `game:interaction_started` - Interaction began
- `job:created` - Generation job created

### ID Types
Entity IDs support **both `int` and `str` (UUID)** to accommodate different entity types:

- **NPCs**: Currently use `int` (NpcId branded type)
- **Items/Props**: May use `str` (UUID) in the future
- **Players**: May use `str` (user UUID)
- **Templates**: May use `int` or `str`

**Type signature:**
```python
EntityId = Union[int, str]
```

**In events:**
```python
{
    "entity_id": 123,  # int for NPCs
    # or
    "entity_id": "550e8400-e29b-41d4-a716-446655440000"  # UUID for items/players
}
```

### Transform Format
All transforms must follow the shared `Transform` type from `packages/shared/types/src/game.ts`:

**Required fields:**
- `worldId: int` - World identifier
- `position: {x: float, y: float, z?: float}` - Position (z optional for 2D)

**Optional fields:**
- `locationId: int` - Location within world
- `orientation: {yaw?, pitch?, roll?}` - Rotation in degrees
- `scale: {x?, y?, z?}` - Scale factors (default 1.0)
- `space: 'world_2d' | 'world_3d' | 'ui_2d'` - Coordinate space hint

**Example:**
```python
transform = {
    "worldId": 1,
    "locationId": 42,
    "position": {"x": 100.0, "y": 50.0},
    "orientation": {"yaw": 90.0},
    "space": "world_2d"
}
```

### Link IDs and Template Context
When entities are linked to templates (via ObjectLink system), events include:

- `template_kind: str` - Template type (e.g., `"npc_template"`)
- `template_id: int | str` - Template identifier
- `link_id: str` - Formatted as `"{template_kind}:{template_id}"`

**Example:**
```python
{
    "entity_type": "npc",
    "entity_id": 123,
    "template_kind": "npc_template",
    "template_id": 456,
    "link_id": "npc_template:456"  # convenience field
}
```

This allows consumers to resolve back to templates without extra queries.

## Event Bus

### Architecture

The event bus lives at `pixsim7/backend/main/infrastructure/events/bus.py` and provides:
- Async publish/subscribe pattern
- Wildcard subscriptions (`"*"` for all events)
- Optional event type registration for documentation
- Automatic WebSocket forwarding (configured separately)

### Defining Events

**New approach (recommended)**: Services register their own events dynamically:

```python
from pixsim7.backend.main.infrastructure.events.bus import event_bus, register_event_type

# Register event type for documentation (optional but recommended)
register_event_type(
    "game:entity_moved",
    "Emitted when an entity's transform changes",
    payload_schema={
        "entity_type": "str (npc, item, prop, player, etc.)",
        "entity_id": "int",
        "transform": "Transform dict",
        "link_id": "optional str",
        "previous_transform": "optional Transform dict"
    },
    source="NpcSpatialService"
)

# Emit event
await event_bus.publish("game:entity_moved", {
    "entity_type": "npc",
    "entity_id": 123,
    "transform": {
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 100, "y": 50}
    }
})
```

**Old approach (deprecated)**: Manual constants in bus.py
```python
# Don't do this - use register_event_type() instead
ENTITY_MOVED = "game:entity_moved"
```

### Core Game Events

The following events are currently registered:

#### `game:entity_moved`
Emitted when an entity's transform changes (position, orientation, scale).

**Payload:**
```python
{
    "entity_type": "npc",  # or "item", "prop", "player", etc.
    "entity_id": 123,
    "transform": {
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 100, "y": 50, "z": 0},
        "orientation": {"yaw": 90},  # optional
        "scale": {"x": 1.0, "y": 1.0}  # optional
    },
    "previous_transform": {...},  # optional - previous state
    "link_id": "npc_template:123"  # optional - template/runtime link
}
```

**Emitted by:**
- `NpcSpatialService.update_npc_transform()`
- `SpatialQueryService.update_entity_transform()`

#### `game:entity_spawned`
Emitted when an entity is added to the spatial index.

**Payload:**
```python
{
    "entity_type": "npc",
    "entity_id": 123,
    "transform": {...},
    "tags": ["friendly", "shopkeeper"]  # optional
}
```

**Emitted by:**
- `SpatialQueryService.register_entity()`

#### `game:entity_despawned`
Emitted when an entity is removed from the spatial index.

**Payload:**
```python
{
    "entity_type": "npc",
    "entity_id": 123
}
```

**Emitted by:**
- `SpatialQueryService.remove_entity()`

### Subscribing to Events

**Subscribe to specific event:**
```python
from pixsim7.backend.main.infrastructure.events.bus import event_bus, Event

@event_bus.on("game:entity_moved")
async def on_entity_moved(event: Event):
    entity_id = event.data["entity_id"]
    position = event.data["transform"]["position"]
    print(f"Entity {entity_id} moved to ({position['x']}, {position['y']})")
```

**Subscribe to all events:**
```python
@event_bus.on("*")
async def on_any_event(event: Event):
    print(f"Event: {event.event_type}")
```

**Manual subscription:**
```python
async def my_handler(event: Event):
    print(event.data)

event_bus.subscribe("game:entity_moved", my_handler)

# Later: unsubscribe
event_bus.unsubscribe("game:entity_moved", my_handler)
```

### Publishing Events

```python
from pixsim7.backend.main.infrastructure.events.bus import event_bus

# Fire and forget (handlers run in background)
await event_bus.publish("game:entity_moved", {
    "entity_type": "npc",
    "entity_id": 123,
    "transform": {...}
})

# Wait for all handlers to complete
await event_bus.publish("game:entity_moved", {...}, wait=True)
```

### Event Type Validation

The event bus validates that published events are registered, helping catch typos:

```python
# ❌ This will log a warning (typo in event name)
await event_bus.publish("game:entity_movd", {...})
# WARNING: Publishing unregistered event type: 'game:entity_movd'

# ✅ Registered event - no warning
await event_bus.publish("game:entity_moved", {...})
```

**Strict mode (raises error):**
```python
await event_bus.publish("game:typo", {...}, strict=True)
# Raises: ValueError: Publishing unregistered event type: 'game:typo'
```

**To silence warnings, register your events:**
```python
from pixsim7.backend.main.infrastructure.events.bus import register_event_type

register_event_type(
    "my_plugin:custom_event",
    "My custom event description",
    payload_schema={"foo": "int", "bar": "str"},
    source="MyPlugin"
)

# Now this won't warn
await event_bus.publish("my_plugin:custom_event", {"foo": 123, "bar": "baz"})
```

### Discovering Events

Get all registered event types:
```python
from pixsim7.backend.main.infrastructure.events.bus import get_registered_events

events = get_registered_events()
for event_type, info in events.items():
    print(f"{event_type}: {info['description']}")
    print(f"  Source: {info['source']}")
    print(f"  Payload: {info['payload_schema']}")
```

## Spatial Query Service

### Architecture

The spatial query service lives at `pixsim7/backend/main/services/game/spatial_query_service.py` and provides:
- In-memory indexing of SpatialObjects (NPCs, items, props, players)
- Fast queries by location, bounds, radius, and tags
- Automatic event emission on updates
- Thread-safe with asyncio locks

### Basic Usage

```python
from pixsim7.backend.main.services.game.spatial_query_service import get_spatial_service

spatial_service = get_spatial_service()

# Register an entity
await spatial_service.register_entity({
    "id": 123,
    "kind": "npc",
    "transform": {
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 100, "y": 50}
    },
    "tags": ["friendly", "shopkeeper"]
})

# Update transform
await spatial_service.update_entity_transform(
    kind="npc",
    entity_id=123,
    transform={
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 110, "y": 55}
    }
)

# Remove entity
await spatial_service.remove_entity(kind="npc", entity_id=123)
```

### Query Examples

**Query by location:**
```python
# All entities at a specific location
entities = await spatial_service.query_by_location(
    world_id=1,
    location_id=42
)

# Filter by kind
npcs = await spatial_service.query_by_location(
    world_id=1,
    location_id=42,
    kinds=["npc"]
)

# Filter by tags
shopkeepers = await spatial_service.query_by_location(
    world_id=1,
    location_id=42,
    tags=["shopkeeper"]
)
```

**Query by bounds (AABB):**
```python
# 2D bounds
entities = await spatial_service.query_by_bounds(
    world_id=1,
    location_id=42,
    min_x=0, max_x=100,
    min_y=0, max_y=100
)

# 3D bounds
entities = await spatial_service.query_by_bounds(
    world_id=1,
    min_x=0, max_x=100,
    min_y=0, max_y=100,
    min_z=0, max_z=10
)
```

**Query by radius:**
```python
# 2D circle
entities = await spatial_service.query_by_radius(
    world_id=1,
    location_id=42,
    x=50, y=50,
    radius=10
)

# 3D sphere
entities = await spatial_service.query_by_radius(
    world_id=1,
    x=50, y=50, z=5,
    radius=10
)
```

**Get specific entity:**
```python
entity = await spatial_service.get_entity(kind="npc", entity_id=123)
if entity:
    print(entity["transform"]["position"])
```

### Integration with NpcSpatialService

The `NpcSpatialService` automatically updates the spatial index when transforms change:

```python
from pixsim7.backend.main.services.game.npc_spatial_service import NpcSpatialService

npc_service = NpcSpatialService(db)

# This will:
# 1. Update NPCState.transform in database
# 2. Update spatial index
# 3. Emit game:entity_moved event
await npc_service.update_npc_transform(
    npc_id=123,
    transform={
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 100, "y": 50}
    }
)

# Disable events/spatial updates if needed
await npc_service.update_npc_transform(
    npc_id=123,
    transform={...},
    emit_events=False
)
```

## Use Cases

### Editor/Minimap: "What's at this location?"

```python
# Get all entities at current location
entities = await spatial_service.query_by_location(
    world_id=current_world,
    location_id=current_location
)

# Render on minimap
for entity in entities:
    pos = entity["transform"]["position"]
    kind = entity["kind"]
    render_icon(kind, pos["x"], pos["y"])
```

### AI: "Find nearby NPCs"

```python
# Find NPCs within 50 units
nearby_npcs = await spatial_service.query_by_radius(
    world_id=1,
    location_id=42,
    x=player_x,
    y=player_y,
    radius=50,
    kinds=["npc"]
)

for npc_data in nearby_npcs:
    npc_id = npc_data["id"]
    # Interact with nearby NPC
```

### Automation: Track entity movements

```python
@event_bus.on("game:entity_moved")
async def log_movements(event: Event):
    entity_type = event.data["entity_type"]
    entity_id = event.data["entity_id"]
    transform = event.data["transform"]

    # Log to analytics
    await analytics_service.track_movement(
        entity_type=entity_type,
        entity_id=entity_id,
        position=transform["position"]
    )
```

### WebSocket: Live updates to clients

```python
# In infrastructure/events/websocket_handler.py
@event_bus.on("game:entity_moved")
async def broadcast_entity_moved(event: Event):
    await connection_manager.broadcast({
        "type": "entity_moved",
        "data": event.data
    })
```

## Extending to Other Entity Types

The system is designed to be entity-agnostic. To add support for items, props, or players:

### 1. Create a spatial service (optional)

```python
# services/game/item_spatial_service.py
from pixsim7.backend.main.services.game.spatial_query_service import get_spatial_service
from pixsim7.backend.main.infrastructure.events.bus import event_bus

class ItemSpatialService:
    async def update_item_transform(self, item_id: int, transform: dict):
        # Update database
        await self.db.execute(...)

        # Update spatial index
        spatial_service = get_spatial_service()
        await spatial_service.update_entity_transform(
            kind="item",
            entity_id=item_id,
            transform=transform
        )
```

### 2. Register events

```python
from pixsim7.backend.main.infrastructure.events.bus import register_event_type

register_event_type(
    "game:item_picked_up",
    "Emitted when a player picks up an item",
    payload_schema={
        "item_id": "int",
        "player_id": "int",
        "location_id": "int"
    },
    source="ItemService"
)
```

### 3. Use the spatial service

```python
# Register items in spatial index
await spatial_service.register_entity({
    "id": 456,
    "kind": "item",
    "transform": {
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 75, "y": 30}
    },
    "tags": ["collectible", "treasure"]
})

# Query for nearby items
nearby_items = await spatial_service.query_by_radius(
    world_id=1,
    x=player_x,
    y=player_y,
    radius=5,
    kinds=["item"],
    tags=["collectible"]
)
```

## Performance Considerations

### Current Implementation (MVP)

**Query Complexity:**
- `query_by_location()`: **O(n)** linear scan within location
- `query_by_bounds()`: **O(n)** linear scan within location + bounds check
- `query_by_radius()`: **O(n)** linear scan + distance calculation
- `get_entity()`: **O(1)** direct lookup by kind and ID

Where **n** = number of entities at that location/world.

**Memory:**
- **O(entities)** - One `IndexedEntity` per registered entity
- Secondary indexes by location add **O(entities)** overhead
- Spatial index is **in-memory only** and rebuildable from authoritative state

**Concurrency:**
- Single async lock protects all index operations
- Updates block queries (and vice versa) during lock hold time
- **Batch operations recommended** for many concurrent changes

**When to Optimize:**
For worlds with:
- **< 100 entities/location**: Current implementation is fine
- **100-1000 entities/location**: Consider grid partitioning
- **> 1000 entities/location**: Implement R-tree or KD-tree

### Batch Operations

**Use batch methods for better performance:**

```python
# ❌ Slow: N lock acquisitions
for entity in entities:
    await spatial_service.register_entity(entity)

# ✅ Fast: 1 lock acquisition
await spatial_service.batch_register_entities(entities)
```

**Batch methods:**
- `batch_register_entities(spatial_objects)` - Register multiple entities
- `batch_update_transforms(updates)` - Update multiple transforms

Benefits:
- Single lock acquisition (reduced contention)
- Events emitted after all updates complete
- Better throughput for bulk operations

### Future Optimizations

If needed for larger worlds:
- **Spatial indexing**: R-tree or KD-tree for faster bounds/radius queries (O(log n))
- **Grid-based**: Partition locations into grid cells for spatial hashing
- **Redis backing**: Persist spatial index across restarts
- **Spatial databases**: PostGIS for complex geometric queries
- **Lock-free structures**: For higher concurrency (if profiling shows lock contention)

### Validation Overhead

Transform validation is performed on every register/update:
- Validates required fields (`worldId`, `position`)
- Logs warnings for missing optional fields
- Catches malformed transforms early

**Disable validation if needed:**
```python
# Validation is always on - no opt-out yet
# If this becomes a bottleneck, we can add a flag
```

## Testing

### Unit Tests

```python
import pytest
from pixsim7.backend.main.services.game.spatial_query_service import SpatialQueryService

@pytest.mark.asyncio
async def test_spatial_queries():
    service = SpatialQueryService()

    # Register entity
    await service.register_entity({
        "id": 1,
        "kind": "npc",
        "transform": {
            "worldId": 1,
            "locationId": 42,
            "position": {"x": 50, "y": 50}
        }
    })

    # Query by location
    entities = await service.query_by_location(
        world_id=1,
        location_id=42
    )
    assert len(entities) == 1
    assert entities[0]["id"] == 1

    # Query by radius
    nearby = await service.query_by_radius(
        world_id=1,
        x=55, y=55,
        radius=10
    )
    assert len(nearby) == 1
```

### Event Tests

```python
@pytest.mark.asyncio
async def test_event_emission():
    from pixsim7.backend.main.infrastructure.events.bus import event_bus

    events_received = []

    @event_bus.on("game:entity_moved")
    async def capture_event(event):
        events_received.append(event)

    # Trigger transform update
    await npc_service.update_npc_transform(123, {...})

    # Verify event was emitted
    assert len(events_received) == 1
    assert events_received[0].data["entity_id"] == 123
```

## Troubleshooting

### Events not being emitted

Check that:
1. The service is calling `event_bus.publish()`
2. Event handlers are registered before events are published
3. Event type string matches exactly (case-sensitive)

### Spatial queries returning empty

Check that:
1. Entities are registered with `register_entity()` or service updates
2. `worldId` and `locationId` match query parameters
3. Entities have valid position data

### Performance issues

For large entity counts:
1. Use bounds queries instead of scanning all entities
2. Filter by `kinds` to reduce result sets
3. Consider implementing grid-based indexing
4. Profile with `asyncio` profiling tools

## Future Enhancements

### Phase 2: WebSocket Client Integration
- Auto-forward game events to WebSocket clients
- Filter events by session/user permissions
- Client-side spatial query caching

### Phase 3: Advanced Indexing
- R-tree for fast geometric queries
- Spatial partitioning (octree, grid)
- Predictive indexing for moving entities

### Phase 4: Persistence
- Redis-backed spatial index
- Rebuild from authoritative state on restart
- Distributed spatial index for multi-server

### Phase 5: Complex Queries
- Path queries ("entities along this path")
- Line-of-sight queries
- Convex hull / polygon bounds
- Tag-based filtering with boolean logic

## API Reference

See inline documentation in:
- `pixsim7/backend/main/infrastructure/events/bus.py`
- `pixsim7/backend/main/services/game/spatial_query_service.py`
- `pixsim7/backend/main/services/game/npc_spatial_service.py`
