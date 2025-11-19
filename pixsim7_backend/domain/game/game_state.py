"""
Game State helpers for managing GameContext in GameSession.flags
Task 22 - Game Mode & ViewState Model
"""

from typing import Optional
from pixsim7_backend.domain.game.schemas import GameStateSchema


def get_game_state(session_flags: dict) -> Optional[GameStateSchema]:
    """
    Get the current game state from session flags.

    Args:
        session_flags: The session.flags dictionary

    Returns:
        GameStateSchema if present, None otherwise
    """
    game_state_dict = session_flags.get("gameState")
    if game_state_dict is None:
        return None

    try:
        return GameStateSchema(**game_state_dict)
    except Exception:
        # If validation fails, return None
        return None


def set_game_state(
    session_flags: dict,
    mode: str,
    world_id: int,
    session_id: int,
    location_id: Optional[str] = None,
    scene_id: Optional[int] = None,
    npc_id: Optional[int] = None,
    narrative_program_id: Optional[str] = None,
) -> dict:
    """
    Set or update the game state in session flags.

    Args:
        session_flags: The session.flags dictionary (will be modified)
        mode: Game mode (map, room, scene, conversation, menu)
        world_id: Current world ID
        session_id: Current session ID
        location_id: Optional location ID
        scene_id: Optional scene ID
        npc_id: Optional NPC ID
        narrative_program_id: Optional narrative program ID

    Returns:
        Updated session_flags dictionary
    """
    game_state = GameStateSchema(
        mode=mode,
        world_id=world_id,
        session_id=session_id,
        location_id=location_id,
        scene_id=scene_id,
        npc_id=npc_id,
        narrative_program_id=narrative_program_id,
    )

    session_flags["gameState"] = game_state.model_dump(exclude_none=False)
    return session_flags


def update_game_state(session_flags: dict, **updates) -> dict:
    """
    Update specific fields in the game state.

    Args:
        session_flags: The session.flags dictionary
        **updates: Fields to update (mode, location_id, scene_id, etc.)

    Returns:
        Updated session_flags dictionary
    """
    current_state = get_game_state(session_flags)
    if current_state is None:
        raise ValueError("No game state to update. Use set_game_state first.")

    # Convert to dict, update, and validate
    state_dict = current_state.model_dump()
    state_dict.update(updates)

    updated_state = GameStateSchema(**state_dict)
    session_flags["gameState"] = updated_state.model_dump(exclude_none=False)
    return session_flags


def clear_game_state(session_flags: dict) -> dict:
    """
    Clear the game state from session flags.

    Args:
        session_flags: The session.flags dictionary

    Returns:
        Updated session_flags dictionary
    """
    session_flags.pop("gameState", None)
    return session_flags


def is_in_mode(session_flags: dict, mode: str) -> bool:
    """
    Check if the session is currently in the specified mode.

    Args:
        session_flags: The session.flags dictionary
        mode: Mode to check (map, room, scene, conversation, menu)

    Returns:
        True if in the specified mode, False otherwise
    """
    game_state = get_game_state(session_flags)
    return game_state is not None and game_state.mode == mode


def is_conversation_mode(session_flags: dict) -> bool:
    """Check if currently in conversation mode."""
    return is_in_mode(session_flags, "conversation")


def is_scene_mode(session_flags: dict) -> bool:
    """Check if currently in scene mode."""
    return is_in_mode(session_flags, "scene")


def is_room_mode(session_flags: dict) -> bool:
    """Check if currently in room mode."""
    return is_in_mode(session_flags, "room")


def is_map_mode(session_flags: dict) -> bool:
    """Check if currently in map mode."""
    return is_in_mode(session_flags, "map")


def is_menu_mode(session_flags: dict) -> bool:
    """Check if currently in menu mode."""
    return is_in_mode(session_flags, "menu")


def get_focused_npc(session_flags: dict) -> Optional[int]:
    """
    Get the currently focused NPC ID if any.

    Args:
        session_flags: The session.flags dictionary

    Returns:
        NPC ID if focused, None otherwise
    """
    game_state = get_game_state(session_flags)
    return game_state.npc_id if game_state else None


def get_active_narrative_program(session_flags: dict) -> Optional[str]:
    """
    Get the active narrative program ID if any.

    Args:
        session_flags: The session.flags dictionary

    Returns:
        Narrative program ID if active, None otherwise
    """
    game_state = get_game_state(session_flags)
    return game_state.narrative_program_id if game_state else None


def get_current_location(session_flags: dict) -> Optional[str]:
    """
    Get the current location ID if in room mode.

    Args:
        session_flags: The session.flags dictionary

    Returns:
        Location ID if in room, None otherwise
    """
    game_state = get_game_state(session_flags)
    return game_state.location_id if game_state else None


def get_current_scene(session_flags: dict) -> Optional[int]:
    """
    Get the current scene ID if in scene mode.

    Args:
        session_flags: The session.flags dictionary

    Returns:
        Scene ID if in scene, None otherwise
    """
    game_state = get_game_state(session_flags)
    return game_state.scene_id if game_state else None
