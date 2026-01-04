"""
Game Actions API

Exposes the game action type registry for frontend consumption.
This enables dynamic UI generation without hardcoding action types.
"""

from fastapi import APIRouter

from pixsim7.backend.main.domain.game.core.actions import (
    GameActionTypesResponse,
    game_action_registry,
)

router = APIRouter()


@router.get("/", response_model=GameActionTypesResponse)
async def list_action_types() -> GameActionTypesResponse:
    """
    Get all available game action types.

    Returns metadata for each action type including:
    - type: Action type identifier (e.g., 'play_scene')
    - label: Human-readable label for UI
    - icon: Emoji/icon for display
    - surface: Interaction surface (scene, world, dialogue)
    - required_field: Field that must be present in action

    This endpoint enables dynamic UI generation for action builders.
    """
    return game_action_registry.to_api_response()
