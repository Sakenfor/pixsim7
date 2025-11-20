"""
Game Domain Models Package

Registers game domain models with SQLModel.
Includes scenes, sessions, NPCs, locations.
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Import models from existing domain module
from pixsim7.backend.main.domain.game import (
    GameScene,
    GameSceneNode,
    GameSceneEdge,
    GameSession,
    GameSessionEvent,
    GameLocation,
    GameNPC,
    NPCSchedule,
    NPCState,
)

# Manifest
manifest = DomainModelManifest(
    id="game_models",
    name="Game Domain Models",
    description="Game domain models (scenes, sessions, NPCs, locations)",
    models=[
        "GameScene",
        "GameSceneNode",
        "GameSceneEdge",
        "GameSession",
        "GameSessionEvent",
        "GameLocation",
        "GameNPC",
        "NPCSchedule",
        "NPCState",
    ],
    enabled=True,
    dependencies=["core_models"],  # Game models may reference User, Asset
)
