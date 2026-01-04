"""
Game Action Registry

Centralized registry for game action types (hotspot/trigger actions).
Provides metadata and validation for action types like play_scene, change_location, npc_talk.

Usage:
    # Get action metadata
    meta = game_action_registry.get("play_scene")
    print(meta.label, meta.icon)

    # Validate an action dict
    game_action_registry.validate_action({"type": "play_scene", "scene_id": 123})

    # Check if action type exists
    if game_action_registry.has("play_scene"):
        ...
"""

from typing import Optional, Dict, Any, Callable, Type, Literal, List
from dataclasses import dataclass
from enum import Enum
from pydantic import BaseModel, Field

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry


class GameActionType(str, Enum):
    """Available game action types."""
    PLAY_SCENE = "play_scene"
    CHANGE_LOCATION = "change_location"
    NPC_TALK = "npc_talk"


class GameActionSurface(str, Enum):
    """Interaction surface for game actions."""
    SCENE = "scene"
    WORLD = "world"
    DIALOGUE = "dialogue"
    INLINE = "inline"


class GameActionTypeInfo(BaseModel):
    """API response model for game action type metadata."""
    type: str = Field(description="Action type identifier")
    label: str = Field(description="Human-readable label for UI")
    icon: str = Field(description="Emoji or icon identifier")
    surface: GameActionSurface = Field(description="Interaction surface type")
    required_field: str = Field(description="Field name that must be present")
    description: Optional[str] = Field(default=None, description="Description for documentation")


class GameActionTypesResponse(BaseModel):
    """API response for listing all game action types."""
    types: List[GameActionTypeInfo] = Field(description="All registered action types")
    total: int = Field(description="Total count of action types")


@dataclass(frozen=True)
class GameActionMeta:
    """Metadata for a game action type."""

    type: str
    """Action type identifier (e.g., 'play_scene')."""

    label: str
    """Human-readable label for UI."""

    icon: str
    """Emoji or icon identifier."""

    surface: str
    """Interaction surface type (scene, world, dialogue)."""

    required_field: str
    """Field name that must be present (e.g., 'scene_id')."""

    field_type: Type = int
    """Expected type for the required field."""

    description: Optional[str] = None
    """Optional description for documentation."""


class GameActionRegistry(SimpleRegistry[str, GameActionMeta]):
    """
    Registry for game action types.

    Provides:
    - Action metadata lookup (label, icon, surface)
    - Validation of action dicts
    - Type checking for required fields
    """

    def __init__(self):
        super().__init__(
            name="GameActionRegistry",
            allow_overwrite=False,
            seed_on_init=True,
            log_operations=False,
        )

    def _get_item_key(self, item: GameActionMeta) -> str:
        return item.type

    def _seed_defaults(self) -> None:
        """Register built-in game action types."""
        self.register_item(
            GameActionMeta(
                type="play_scene",
                label="Start Scene",
                icon="🎬",
                surface="scene",
                required_field="scene_id",
                field_type=int,
                description="Play a scene with an NPC",
            )
        )
        self.register_item(
            GameActionMeta(
                type="change_location",
                label="Go",
                icon="🚪",
                surface="world",
                required_field="target_location_id",
                field_type=int,
                description="Navigate to a different location",
            )
        )
        self.register_item(
            GameActionMeta(
                type="npc_talk",
                label="Talk",
                icon="💬",
                surface="dialogue",
                required_field="npc_id",
                field_type=int,
                description="Start a conversation with an NPC",
            )
        )

    def validate_action(self, action: Dict[str, Any]) -> None:
        """
        Validate an action dict against registry metadata.

        Args:
            action: Action dict with 'type' and required fields.

        Raises:
            ValueError: If action type unknown or required field missing/invalid.
        """
        action_type = action.get("type")
        if not action_type:
            raise ValueError("Action must have a 'type' field")

        meta = self.get_or_none(action_type)
        if not meta:
            raise ValueError(f"Unknown action type: {action_type}")

        value = action.get(meta.required_field)
        if value is None:
            raise ValueError(
                f"{meta.required_field} is required for {action_type} action"
            )

        if not isinstance(value, meta.field_type):
            raise ValueError(
                f"{meta.required_field} must be {meta.field_type.__name__}, "
                f"got {type(value).__name__}"
            )

    def get_all_types(self) -> list[str]:
        """Get list of all registered action types."""
        return list(self.keys())

    def to_api_response(self) -> GameActionTypesResponse:
        """Convert registry to API response format."""
        types = [
            GameActionTypeInfo(
                type=meta.type,
                label=meta.label,
                icon=meta.icon,
                surface=GameActionSurface(meta.surface),
                required_field=meta.required_field,
                description=meta.description,
            )
            for meta in self.values()
        ]
        return GameActionTypesResponse(types=types, total=len(types))


# Global singleton instance
game_action_registry = GameActionRegistry()
