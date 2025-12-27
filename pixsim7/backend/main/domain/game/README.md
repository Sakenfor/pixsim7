# Game Domain Package

Unified domain package for all game-related logic consolidating character, NPC, behavior, stats, and brain systems.

## Structure

```
domain/game/
├── core/          # Core game models (World, Session, Location, Scene, ECS)
├── entities/      # Character templates, instances, NPCs, memory models
├── stats/         # Abstract stat system with semantic derivations
├── behavior/      # NPC behavior simulation (conditions, effects, scoring)
├── brain/         # Cognitive modeling and derivations
├── interactions/  # NPC interaction mechanics
└── schemas/       # Pydantic validation schemas
```

### Core (`core/`)
Core game models and state management:
- **models.py**: GameWorld, GameSession, GameLocation, GameScene, GameNPC, NPCState
- **ecs.py**: Entity-Component-System for NPC state
- **game_state.py**: Game mode and view state helpers

### Entities (`entities/`)
Character and NPC entity models:
- **character.py**: Character templates (reusable archetypes)
- **character_integrations.py**: CharacterInstance (world-specific). NPC links live in ObjectLink (domain/links.py)
- **character_graph.py**: Graph traversal queries
- **character_linkage.py**: Metadata linkage helpers
- **npc_memory.py**: Conversation memory, emotions, milestones
- **npc_surfaces/**: Visual surface types (portraits, expressions)

### Stats (`stats/`)
Abstract stat system with packages:
- Generic stat tracking with axes, tiers, and levels
- Semantic derivation system
- Stat packages: relationships, personality, mood, resources, drives

### Behavior (`behavior/`)
NPC activity simulation:
- **conditions.py**: Condition evaluation
- **effects.py**: Effect application
- **scoring.py**: Activity scoring and selection
- **simulation.py**: Simulation prioritization

### Brain (`brain/`)
NPC cognitive modeling:
- **engine.py**: BrainState computation from stat packages
- **derivations/**: Plugin derivations (behavior_urgency, conversation_style, instincts, etc.)

### Interactions (`interactions/`)
NPC interaction mechanics:
- **npc_interactions.py**: Interaction types (RelationshipDelta, StatDelta, etc.)
- **interaction_execution.py**: Application logic

## Import Patterns

### High-level imports (most common)
```python
from pixsim7.backend.main.domain.game import (
    GameWorld, GameSession, GameNPC,
    Character, CharacterInstance,
    StatEngine, BrainEngine,
)
```

### Subpackage imports (for specialized use)
```python
from pixsim7.backend.main.domain.game.stats import (
    get_default_mood_definition,
    StatPackage,
)
from pixsim7.backend.main.domain.game.behavior import (
    evaluate_condition,
    choose_npc_activity,
)
```

## Dependency Flow

One-way dependencies (no cycles):
```
stats → core → entities → behavior/brain → interactions
```

## Service Layer Organization

Related services are organized as follows:

- **services/game/**: World/session mechanics, inventory, quests
- **services/npc/**: NPC runtime state (memory, emotion, stats, spatial, expressions)
- **services/characters/**: Character template/instance CRUD

## Migration from Old Structure

The following imports have changed:

### Character Domain
**Old:**
```python
from pixsim7.backend.main.domain.character import Character
from pixsim7.backend.main.domain.character_integrations import CharacterInstance
from pixsim7.backend.main.domain.npc_memory import ConversationMemory
```

**New:**
```python
from pixsim7.backend.main.domain.game import Character, CharacterInstance, ConversationMemory
# OR for subpackage access:
from pixsim7.backend.main.domain.game.entities import Character, CharacterInstance
from pixsim7.backend.main.domain.game.entities.npc_memory import ConversationMemory
```

### Stats/Behavior/Brain
**Old:**
```python
from pixsim7.backend.main.domain.stats import StatEngine
from pixsim7.backend.main.domain.behavior import evaluate_condition
from pixsim7.backend.main.domain.brain import BrainEngine
```

**New:**
```python
from pixsim7.backend.main.domain.game import StatEngine, BrainEngine
from pixsim7.backend.main.domain.game.behavior import evaluate_condition
# OR subpackage access:
from pixsim7.backend.main.domain.game.stats import StatEngine
```

### Service Changes
**Old:**
```python
from pixsim7.backend.main.services.game import NpcExpressionService
from pixsim7.backend.main.services.game.npc_stat_service import NpcStatService
```

**New:**
```python
from pixsim7.backend.main.services.npc import NpcExpressionService, NpcStatService
```

## Design Principles

1. **Single Responsibility**: Each model/module does ONE thing
2. **Clean Separation**: Character templates ≠ runtime NPCs ≠ NPC memory
3. **One-Way Dependencies**: No circular imports
4. **Plugin-Friendly**: Behavior, stats, and brain systems support plugins
5. **Data-Driven**: Stats and derivations configured via JSON, not hardcoded
