# Simulation Domain

The Simulation domain handles world tick scheduling, NPC behavior simulation, and time progression.

## Entry Module

```python
from pixsim7.backend.simulation import (
    # Core Simulation
    WorldScheduler, WorldSimulationContext, SchedulerLoopRunner,
    # Behavior Conditions
    evaluate_condition, register_condition_evaluator,
    # Behavior Effects
    apply_activity_effects, register_effect_handler,
    # Activity Scoring
    calculate_activity_score, choose_activity,
    # Simulation Tiers
    determine_simulation_tier, should_tick_npc,
    # Routine Resolution
    choose_npc_activity, apply_activity_to_npc,
)
```

## Architecture

```
pixsim7/backend/main/
├── domain/behavior/       # Behavior system logic
│   ├── conditions.py      # Condition DSL evaluation
│   ├── effects.py         # Activity effect handlers
│   ├── scoring.py         # Activity scoring system
│   ├── simulation.py      # Simulation tier management
│   └── routine_resolver.py # Routine graph traversal
├── services/simulation/   # Scheduler orchestration
│   ├── context.py         # WorldSimulationContext
│   ├── scheduler.py       # WorldScheduler
│   └── __init__.py
└── workers/               # Background processing
```

## Key Concepts

### World Time

Each world has a `world_time` that advances during simulation ticks. Time can be:
- **Real-time**: Advances continuously
- **Turn-based**: Advances on player action
- **Paused**: No advancement

### Simulation Tiers

NPCs are simulated at different frequencies based on player proximity:

| Tier | Description | Tick Rate |
|------|-------------|-----------|
| **Foreground** | NPCs in current scene | Every tick |
| **Background** | NPCs in adjacent locations | Every 5 ticks |
| **Dormant** | NPCs far from player | Every 30 ticks |

```python
from pixsim7.backend.simulation import determine_simulation_tier, should_tick_npc

tier = determine_simulation_tier(npc, player_location)
if should_tick_npc(npc, tier, current_tick):
    # Process this NPC
    pass
```

## WorldScheduler

The central scheduler orchestrates world simulation.

### Basic Usage

```python
from pixsim7.backend.simulation import WorldScheduler

scheduler = WorldScheduler(db)
await scheduler.register_world(world_id=1)
await scheduler.tick_world(world_id=1)
```

### Scheduler Loop

For continuous simulation:

```python
from pixsim7.backend.simulation import SchedulerLoopRunner

runner = SchedulerLoopRunner(scheduler)
await runner.start()  # Runs until stopped
await runner.stop()
```

## Behavior System

The behavior system determines what activities NPCs perform.

### Conditions

Conditions are evaluated to determine if an activity is available.

```python
from pixsim7.backend.simulation import evaluate_condition

# Simple condition
result = evaluate_condition(npc, {
    "type": "stat_above",
    "stat": "energy",
    "threshold": 50
})

# Register custom condition
from pixsim7.backend.simulation import register_condition_evaluator

@register_condition_evaluator("custom_condition")
def evaluate_custom(npc, params):
    return npc.entity_data.get("custom_flag", False)
```

### Effects

Effects apply changes when an activity completes.

```python
from pixsim7.backend.simulation import apply_activity_effects

# Apply effects from an activity
await apply_activity_effects(npc, activity, context)

# Register custom effect
from pixsim7.backend.simulation import register_effect_handler

@register_effect_handler("custom_effect")
async def handle_custom(npc, params, context):
    # Apply custom changes
    pass
```

### Activity Scoring

Activities are scored and the best one is selected.

```python
from pixsim7.backend.simulation import (
    calculate_activity_score,
    choose_activity,
    score_and_filter_activities
)

# Score a single activity
score = calculate_activity_score(npc, activity, context)

# Score all and choose best
activities = score_and_filter_activities(npc, available_activities, context)
chosen = choose_activity(activities)
```

### Routine Resolution

NPCs follow routine graphs that define their behavior patterns.

```python
from pixsim7.backend.simulation import (
    find_active_routine_node,
    collect_candidate_activities,
    choose_npc_activity,
    apply_activity_to_npc,
    finish_activity
)

# Find current routine node based on time/state
node = find_active_routine_node(npc, routine_graph, world_time)

# Get candidate activities from node
candidates = collect_candidate_activities(node, npc)

# Choose and apply
activity = choose_npc_activity(npc, candidates, context)
await apply_activity_to_npc(npc, activity)

# When activity completes
await finish_activity(npc, activity)
```

## WorldSimulationContext

Context passed through simulation containing shared state.

```python
from pixsim7.backend.simulation import WorldSimulationContext

context = WorldSimulationContext(
    db=db,
    world_id=1,
    world_time=1234.5,
    tick_number=100,
)

# Access in handlers
def my_condition(npc, params, context: WorldSimulationContext):
    return context.world_time > params.get("after_time", 0)
```

## Integration with Game Domain

The simulation domain uses game models through the domain entry:

```python
from pixsim7.backend.game import (
    GameWorld, GameWorldState, GameNPC,
    get_npc_component, update_npc_component
)

# Read NPC state
energy = get_npc_component(npc, "energy")

# Update after simulation
update_npc_component(npc, "energy", {"value": energy - 10})
```

## Extending Simulation

### Adding New Conditions

1. Create evaluator function with signature `(npc, params, context) -> bool`
2. Register with `@register_condition_evaluator("condition_name")`
3. Use in activity conditions as `{"type": "condition_name", ...}`

### Adding New Effects

1. Create handler function with signature `async (npc, params, context) -> None`
2. Register with `@register_effect_handler("effect_name")`
3. Use in activity effects as `{"type": "effect_name", ...}`

### Customizing Scoring

Override scoring weights in world config:

```python
world.meta["scoring_weights"] = {
    "urgency": 1.5,
    "preference": 1.0,
    "random": 0.1
}
```

## Related Domains

- **Game**: Provides NPC models and ECS for state storage
- **Narrative**: Can trigger narrative programs from simulation
- **Automation**: Uses simulation for regression testing
