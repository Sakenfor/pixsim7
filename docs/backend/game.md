# Game Domain

The Game domain contains core game mechanics including world state, sessions, NPCs, locations, and the Entity-Component-System (ECS).

## Entry Module

```python
from pixsim7.backend.game import (
    # Models
    GameSession, GameNPC, GameLocation, GameWorld, GameWorldState,
    # ECS
    get_npc_component, set_npc_component, get_npc_metric,
    # State
    get_game_state, is_conversation_mode, get_focused_npc,
    # Services
    GameSessionService, GameWorldService,
)
```

## Architecture

```
pixsim7/backend/main/
├── domain/game/           # Domain models and ECS
│   ├── models.py          # GameSession, GameNPC, GameLocation, etc.
│   ├── ecs.py             # Entity-Component-System helpers
│   ├── game_state.py      # Session game state management
│   └── schemas/           # Pydantic schemas
├── services/game/         # Business logic
│   ├── game_session_service.py
│   ├── game_location_service.py
│   ├── game_world_service.py
│   └── npc_expression_service.py
└── routes/game_*/         # API endpoints
```

## Key Types

### GameWorld

Represents a game world instance with its configuration.

```python
class GameWorld(SQLModel, table=True):
    id: int
    user_id: int
    name: str
    meta: dict  # World configuration (stats, time settings, etc.)
```

### GameSession

A player's active session within a world.

```python
class GameSession(SQLModel, table=True):
    id: int
    user_id: int
    world_id: int
    scene_id: int
    current_node_id: int
    save_state: dict  # Progress, choices, flags
```

### GameNPC

An NPC in the game world with ECS-managed state.

```python
class GameNPC(SQLModel, table=True):
    id: int
    world_id: int
    character_id: int
    name: str
    entity_data: dict  # ECS components stored here
```

### GameLocation

A location/room in the game world.

```python
class GameLocation(SQLModel, table=True):
    id: int
    world_id: int
    name: str
    npcs: list[int]  # NPCs currently at this location
```

## Entity-Component-System (ECS)

The ECS system manages NPC state through components stored in `entity_data`.

### Reading Components

```python
from pixsim7.backend.game import get_npc_component, has_npc_component

# Check if NPC has a component
if has_npc_component(npc, "mood"):
    mood = get_npc_component(npc, "mood")
    print(f"Current mood: {mood.get('value', 0)}")
```

### Writing Components

```python
from pixsim7.backend.game import set_npc_component, update_npc_component

# Set entire component
set_npc_component(npc, "mood", {"value": 75, "trend": "improving"})

# Update specific fields
update_npc_component(npc, "mood", {"value": 80})
```

### Metrics

Metrics are special components with registered definitions.

```python
from pixsim7.backend.game import get_npc_metric, set_npc_metric, get_metric_registry

# Get metric value
affection = get_npc_metric(npc, "affection")

# Set metric value
set_npc_metric(npc, "affection", 50)

# List available metrics
registry = get_metric_registry()
for metric in registry.list_metrics("social"):
    print(f"{metric.name}: {metric.description}")
```

## Game State

Session-scoped state for tracking current UI mode, focused NPC, etc.

### Reading State

```python
from pixsim7.backend.game import (
    get_game_state, is_conversation_mode, get_focused_npc
)

state = get_game_state(session)
if is_conversation_mode(state):
    npc = get_focused_npc(state)
    print(f"Talking to: {npc.name}")
```

### Updating State

```python
from pixsim7.backend.game import set_game_state, update_game_state

# Set entire state
set_game_state(session, GameStateSchema(
    mode="conversation",
    focused_npc_id=npc.id,
))

# Update specific fields
update_game_state(session, {"mode": "room"})
```

## Services

### GameSessionService

Manages session lifecycle.

```python
from pixsim7.backend.game import GameSessionService

service = GameSessionService(db)
session = await service.create_session(user_id=1, world_id=1)
await service.save_progress(session_id=session.id, save_state={...})
```

### GameWorldService

World-level operations.

```python
from pixsim7.backend.game import GameWorldService

service = GameWorldService(db)
world = await service.create_world(user_id=1, name="My World")
npcs = await service.get_world_npcs(world_id=world.id)
```

### GameLocationService

Location and NPC placement.

```python
from pixsim7.backend.game import GameLocationService

service = GameLocationService(db)
await service.move_npc_to_location(npc_id=1, location_id=2)
npcs_at_location = await service.get_npcs_at_location(location_id=2)
```

## Extending the Domain

### Adding New Components

1. Define the component schema in `domain/game/schemas/`
2. Register with ECS if it needs validation
3. Use `set_npc_component()` to store

### Adding New Metrics

1. Define metric in `domain/metrics/`
2. Register with metric registry
3. Access via `get_npc_metric()` / `set_npc_metric()`

### Adding New Services

1. Create service in `services/game/`
2. Export from `services/game/__init__.py`
3. Add to `pixsim7/backend/game.py` entry module

## Related Domains

- **Simulation**: Uses game models for world tick scheduling
- **Narrative**: Reads game state for dialogue context
- **Content**: Generates assets for game scenes
