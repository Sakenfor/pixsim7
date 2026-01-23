# Backend Domain Map

This document maps the existing backend codebase to well-defined domains with clear entry modules, enabling easier navigation and reduced cross-domain coupling.

## Domain Overview

The PixSim7 backend is organized into the following major domains:

| Domain | Entry Module | Primary Responsibility |
|--------|--------------|------------------------|
| **Game** | `pixsim7.backend.game` | Core game world, sessions, NPCs, ECS, state management |
| **Simulation** | `pixsim7.backend.simulation` | World tick scheduling, NPC simulation, time progression |
| **Automation** | `pixsim7.backend.automation` | Android device control, execution loops, presets |
| **Narrative** | `pixsim7.backend.narrative` | Story execution, dialogue, narrative programs |
| **Content** | `pixsim7.backend.content` | Asset generation, provider integration, generation workflows |

---

## Domain: Game

Core game mechanics including world state, sessions, NPCs, locations, and the ECS system.

### Current Paths

| Layer | Current Location |
|-------|------------------|
| Domain Models | `pixsim7/backend/main/domain/game/` |
| Services | `pixsim7/backend/main/services/game/` |
| API Routes | `pixsim7/backend/main/routes/game_**/` |

### Key Components

**Domain Models (`domain/game/`):**
- `models.py` - `GameScene`, `GameSession`, `GameLocation`, `GameNPC`, `NPCState`, `NPCSchedule`
- `ecs.py` - Entity-Component-System for NPC attributes and metrics
- `game_state.py` - Session-scoped game state (mode, focus, current location)
- `schemas/` - Pydantic schemas for game state

**Services (`services/game/`):**
- `GameSessionService` - Session lifecycle management
- `GameLocationService` - Location and NPC placement
- `GameWorldService` - World-level operations
- `NpcExpressionService` - NPC expression/animation state

**Related Services:**
- `services/scene/` - Scene assembly and rendering
- `services/npc/` - NPC behavior and interactions
- `services/characters/` - Character CRUD operations

### Entry Module Exports

```python
from pixsim7.backend.game import (
    # Domain Models
    GameScene, GameSession, GameLocation, GameNPC, NPCState, NPCSchedule,

    # ECS Helpers
    get_npc_entity, set_npc_entity, get_npc_component, set_npc_component,
    get_npc_metric, set_npc_metric, get_metric_registry,

    # Game State
    GameStateSchema, get_game_state, set_game_state, update_game_state,
    is_conversation_mode, is_scene_mode, get_focused_npc,

    # Services
    GameSessionService, GameLocationService, GameWorldService,
)
```

---

## Domain: Simulation

World tick scheduling, NPC simulation loops, and time progression.

### Current Paths

| Layer | Current Location |
|-------|------------------|
| Domain Models | `pixsim7/backend/main/domain/behavior/` |
| Services | `pixsim7/backend/main/services/simulation/` |
| Workers | `pixsim7/backend/main/workers/` |

### Key Components

**Services (`services/simulation/`):**
- `WorldSimulationContext` - Context for simulation ticks
- `WorldScheduler` - Scheduling NPC behaviors and world events
- `SchedulerLoopRunner` - Main simulation loop execution

**Related Domain (`domain/behavior/`):**
- Behavior extension registry
- Simulation conditions and effects

### Entry Module Exports

```python
from pixsim7.backend.simulation import (
    # Core Simulation
    WorldSimulationContext,
    WorldScheduler,
    SchedulerLoopRunner,

    # Behavior Extensions (re-exported)
    BehaviorRegistry,
)
```

---

## Domain: Automation

Android device automation, execution loops, and preset management.

### Current Paths

| Layer | Current Location |
|-------|------------------|
| Domain Models | `pixsim7/backend/main/domain/automation/` |
| Services | `pixsim7/backend/main/services/automation/` |
| API Routes | `pixsim7/backend/main/routes/automation/`, `routes/device_agents/` |
| Workers | `pixsim7/backend/main/workers/automation.py` |

### Key Components

**Domain Models (`domain/automation/`):**
- `AndroidDevice` - Device connection and state
- `DeviceAgent` - Agent managing device connections
- `AppActionPreset` - Reusable automation presets
- `AutomationExecution` - Single execution record
- `ExecutionLoop` - Looped automation workflows
- Enums: `DeviceStatus`, `LoopStatus`, `AutomationStatus`

**Services (`services/automation/`):**
- `ExecutionLoopService` - Loop lifecycle management
- `DevicePoolService` - Device assignment and pooling

### Entry Module Exports

```python
from pixsim7.backend.automation import (
    # Domain Models
    AndroidDevice, DeviceAgent, AppActionPreset,
    AutomationExecution, ExecutionLoop, ExecutionLoopHistory,

    # Enums
    DeviceType, ConnectionMethod, DeviceStatus,
    ActionType, AutomationStatus,
    LoopSelectionMode, PresetExecutionMode, LoopStatus,

    # Services
    ExecutionLoopService, DevicePoolService, DeviceAssignmentResult,
)
```

---

## Domain: Narrative

Story execution, dialogue systems, narrative programs, and action blocks.

### Current Paths

| Layer | Current Location |
|-------|------------------|
| Domain Models | `pixsim7/backend/main/domain/narrative/` |
| Services | `pixsim7/backend/main/services/narrative/`, `services/action_blocks/` |
| API Routes | `pixsim7/backend/main/routes/action_blocks/`, `routes/interactions/` |
| Plugins | `pixsim7/backend/main/plugins/game_dialogue/` |

### Key Components

**Domain Models (`domain/narrative/`):**
- `NarrativeProgram` - Graph-based narrative structure
- Node types: `DialogueNode`, `ChoiceNode`, `ActionNode`, `SceneNode`, `BranchNode`, etc.
- `NarrativeRuntimeState` - Execution state tracking
- `NarrativeContext` - Context for narrative decisions
- `action_blocks/` - Reusable action block definitions

**Services:**
- `services/narrative/NarrativeRuntimeEngine` - Program execution
- `services/action_blocks/` - Action block CRUD and resolution

### Entry Module Exports

```python
from pixsim7.backend.narrative import (
    # Program Structure
    NarrativeProgram, NarrativeNode, NarrativeEdge,
    NarrativeRuntimeState, NarrativeStepResult,

    # Node Types
    DialogueNode, ChoiceNode, ActionNode, ActionBlockNode,
    SceneNode, BranchNode, WaitNode, ExternalCallNode,

    # Runtime
    NarrativeRuntimeEngine, NarrativeEngine, NarrativeContext,

    # ECS Helpers
    get_narrative_state, set_narrative_state, start_program, finish_program,

    # Integration
    launch_narrative_program_from_interaction,
    create_simple_dialogue_program,
)
```

---

## Domain: Content (Generation)

Asset generation, video provider integration, and generation workflows.

### Current Paths

| Layer | Current Location |
|-------|------------------|
| Domain Models | `pixsim7/backend/main/domain/` (Asset, Generation, ProviderSubmission) |
| Services | `pixsim7/backend/main/services/generation/`, `services/asset/`, `services/provider/` |
| API Routes | `pixsim7/backend/main/routes/assets/`, `routes/generations/`, `routes/providers/` |
| Providers | `pixsim7/backend/main/providers/` |
| Workers | `pixsim7/backend/main/workers/job_processor.py`, `status_poller.py` |

### Key Components

**Domain Models (`domain/`):**
- `Asset`, `AssetVariant` - Generated content storage
- `Generation` - Generation request tracking
- `ProviderSubmission` - Provider-specific submission state
- `ProviderAccount`, `ProviderCredit` - Account management

**Services:**
- `services/generation/GenerationService` - Main orchestration
- `services/asset/AssetService` - Asset CRUD
- `services/provider/` - Provider adapters (Pixverse, Sora)

**Providers (`providers/`):**
- `pixverse/` - Pixverse video generation
- `sora/` - OpenAI Sora integration
- `anthropic_llm/`, `openai_llm/` - LLM providers

### Entry Module Exports

```python
from pixsim7.backend.content import (
    # Domain Models
    Asset, AssetVariant, Generation, ProviderSubmission,
    ProviderAccount, ProviderCredit,

    # Enums
    MediaType, GenerationStatus, OperationType,

    # Services
    GenerationService, GenerationCreationService,
    GenerationLifecycleService, GenerationQueryService,
    AssetService,
)
```

---

## Cross-Domain Interfaces

To reduce coupling between domains, the following interface patterns are recommended:

### Game -> Simulation Interface

Instead of simulation importing deep game models:

```python
# Recommended: Use domain entry module
from pixsim7.backend.game import get_npc_entity, GameNPC

# Avoid: Deep internal imports
from pixsim7.backend.main.domain.game.ecs import get_npc_entity
```

### Narrative -> Game Interface

```python
# Recommended: Use game domain for state queries
from pixsim7.backend.game import get_game_state, get_focused_npc, is_conversation_mode

# Narrative can read game state but should not directly modify it
```

### Automation -> Content Interface

```python
# Automation may trigger content generation via the content domain
from pixsim7.backend.content import GenerationService
```

---

## Import Conventions

### Canonical Imports (Preferred)

```python
# Use domain entry modules for external consumers
from pixsim7.backend.game import GameSession, GameNPC
from pixsim7.backend.simulation import WorldScheduler
from pixsim7.backend.automation import ExecutionLoop
from pixsim7.backend.narrative import NarrativeProgram
from pixsim7.backend.content import Asset, GenerationService
```

### Internal Imports (Within Domain)

```python
# Within a domain, relative imports are acceptable
from .models import GameScene
from ..ecs import get_npc_component
```

### Deprecated Patterns (Avoid)

```python
# Avoid: Deep path imports from outside the domain
from pixsim7.backend.main.domain.game.models import GameSession
from pixsim7.backend.main.services.game.game_session_service import GameSessionService

# Avoid: Importing from multiple internal paths
from pixsim7.backend.main.domain.game.ecs import get_npc_entity
from pixsim7.backend.main.domain.game.game_state import get_game_state
```

---

## Test Organization

Tests should be organized to mirror the domain structure.

### Target Structure

```
pixsim7/backend/main/tests/
├── conftest.py              # Shared fixtures (db, auth, etc.)
├── test_game/               # Game domain tests
│   ├── conftest.py          # Game-specific fixtures
│   ├── test_session.py      # GameSession lifecycle
│   ├── test_ecs.py          # ECS component operations
│   ├── test_game_state.py   # Game state management
│   └── test_world.py        # GameWorld operations
├── test_simulation/         # Simulation domain tests
│   ├── conftest.py          # Simulation fixtures
│   ├── test_scheduler.py    # WorldScheduler tests
│   ├── test_behavior.py     # Behavior conditions/effects
│   ├── test_scoring.py      # Activity scoring
│   └── test_routine.py      # Routine resolution
├── test_automation/         # Automation domain tests
│   ├── conftest.py          # Device/agent fixtures
│   ├── test_execution_loop.py
│   ├── test_device_pool.py
│   └── test_presets.py
├── test_narrative/          # Narrative domain tests
│   ├── conftest.py          # Narrative fixtures
│   ├── test_runtime.py      # NarrativeRuntimeEngine
│   ├── test_programs.py     # Program creation/execution
│   └── test_action_blocks.py
├── test_content/            # Content domain tests
│   ├── conftest.py          # Generation fixtures
│   ├── test_generation.py   # Generation workflow
│   ├── test_assets.py       # Asset management
│   └── test_providers.py    # Provider adapters
└── test_integration/        # Cross-domain integration tests
    ├── test_game_simulation.py
    └── test_narrative_game.py
```

### Test Naming Conventions

- Test files: `test_<feature>.py`
- Test classes: `Test<Feature>`
- Test functions: `test_<behavior>` or `test_<action>_<expected_result>`

Example:
```python
# test_game/test_session.py

class TestGameSession:
    async def test_create_session_assigns_default_world(self, db):
        ...

    async def test_save_progress_updates_save_state(self, db, session):
        ...

    async def test_load_session_restores_game_state(self, db, session):
        ...
```

### Domain-Specific Fixtures

Each domain should have its own `conftest.py` with domain-specific fixtures:

```python
# test_game/conftest.py
import pytest
from pixsim7.backend.game import GameSession, GameWorld, GameNPC

@pytest.fixture
async def game_world(db, user):
    world = GameWorld(user_id=user.id, name="Test World")
    db.add(world)
    await db.commit()
    return world

@pytest.fixture
async def game_session(db, user, game_world):
    session = GameSession(user_id=user.id, world_id=game_world.id)
    db.add(session)
    await db.commit()
    return session
```

### Migration Plan

For existing tests:

1. **Phase 1**: Create domain test directories and conftest files
2. **Phase 2**: Move existing domain-related tests to their folders
3. **Phase 3**: Consolidate scattered tests into domain structure
4. **Phase 4**: Add integration tests for cross-domain flows

Current mapping of existing tests:
- `test_startup.py` -> remains at root (infrastructure)
- Future game tests -> `test_game/`
- Future simulation tests -> `test_simulation/`
- Future automation tests -> `test_automation/`

---

## Adding New Functionality

When adding new code to the backend:

1. **Identify the owning domain** - Which domain does this functionality belong to?
2. **Place code in the domain's layer:**
   - Business entities -> `domain/<name>/`
   - Business logic -> `services/<name>/`
   - API endpoints -> `routes/<name>/`
3. **Export from the domain entry module** if external consumers need access
4. **Write tests** in the corresponding `test_<domain>/` folder
5. **Update this document** if you add significant new components

---

## Migration Notes

This organization introduces domain entry modules without requiring mass file moves. Existing deep imports will continue to work, but new code should use the canonical domain imports.

Future iterations may consolidate scattered modules (e.g., move `services/scene/` under game domain) but this is out of scope for the initial organization.
