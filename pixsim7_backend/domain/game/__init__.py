"""
Game domain models

This module contains all game-related domain models that were consolidated
from the standalone game service into the main backend.
"""
from pixsim7_backend.domain.game.models import (
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

__all__ = [
    "GameScene",
    "GameSceneNode",
    "GameSceneEdge",
    "GameSession",
    "GameSessionEvent",
    "GameLocation",
    "GameNPC",
    "NPCSchedule",
    "NPCState",
]
