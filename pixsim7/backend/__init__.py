"""
PixSim7 Backend Services

Namespace package for all backend microservices.

Domain Entry Modules:
---------------------
The backend is organized into well-defined domains with stable public interfaces:

- `pixsim7.backend.game` - Core game world, sessions, NPCs, ECS, state management
- `pixsim7.backend.simulation` - World tick scheduling, NPC simulation, behavior system
- `pixsim7.backend.automation` - Android device control, execution loops, presets
- `pixsim7.backend.narrative` - Story execution, dialogue, narrative programs
- `pixsim7.backend.content` - Asset generation, provider integration, workflows

Usage:
    from pixsim7.backend.game import GameSession, GameNPC, get_npc_component
    from pixsim7.backend.simulation import WorldScheduler, evaluate_condition
    from pixsim7.backend.automation import ExecutionLoop, DevicePoolService
    from pixsim7.backend.narrative import NarrativeProgram, start_program
    from pixsim7.backend.content import Asset, GenerationService

See docs/backend-domain-map.md for the full domain organization.
"""

# Domain entry modules are imported lazily to avoid circular imports.
# Use explicit imports: from pixsim7.backend.game import ...
