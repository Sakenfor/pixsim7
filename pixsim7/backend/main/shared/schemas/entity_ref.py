"""EntityRef - Canonical reference type for API/DTO boundaries.

Provides type-safe entity references replacing raw *_id integers.
Supports backward-compatible parsing of multiple formats.

Usage in DTOs:
    from pydantic import BaseModel, Field, AliasChoices
    from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef, SceneRef

    class GameLocationSummary(BaseModel):
        # Use AliasChoices to accept both new field name and legacy _id format
        asset: Optional[AssetRef] = Field(
            default=None,
            validation_alias=AliasChoices("asset", "asset_id"),
        )

Accepts (via BeforeValidator):
    - EntityRef instance
    - {"type": "asset", "id": 123}
    - {"type": "asset", "id": 123, "meta": {"label": "Background"}}
    - "asset:123"
    - 123 (raw int, uses the type alias's default type)
    - None
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Union, Annotated

from pydantic import BaseModel, Field, BeforeValidator


class EntityRef(BaseModel):
    """Canonical reference to an entity in the system.

    Attributes:
        type: Entity type identifier (e.g., 'asset', 'scene', 'npc')
        id: Entity ID (integer primary key)
        meta: Optional metadata for context-specific information
    """

    type: str = Field(..., description="Entity type (e.g., 'asset', 'scene', 'npc')")
    id: int = Field(..., description="Entity ID")
    meta: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional metadata"
    )

    model_config = {
        "frozen": True,  # Immutable for safety
        "json_schema_extra": {
            "examples": [
                {"type": "asset", "id": 123},
                {"type": "scene", "id": 456, "meta": {"label": "Main Scene"}},
            ]
        },
    }

    @classmethod
    def parse_flexible(
        cls,
        value: Union[Dict[str, Any], str, int, "EntityRef", None],
        default_type: Optional[str] = None,
    ) -> Optional["EntityRef"]:
        """Parse EntityRef from various input formats.

        Args:
            value: Input in any supported format:
                - EntityRef instance (returned as-is)
                - Dict with 'type' and 'id' keys
                - String in "type:id" format
                - Integer (requires default_type)
                - None (returns None)
            default_type: Type to use for legacy int format

        Returns:
            EntityRef instance or None if value is None

        Raises:
            ValueError: If format is invalid or default_type required but not provided
        """
        if value is None:
            return None

        if isinstance(value, EntityRef):
            return value

        if isinstance(value, int):
            if not default_type:
                raise ValueError(
                    f"Cannot parse raw int {value} without default_type. "
                    "Use a typed field (e.g., AssetRef) or provide explicit type."
                )
            return cls(type=default_type, id=value)

        if isinstance(value, str):
            if ":" not in value:
                raise ValueError(
                    f"Invalid EntityRef string format: '{value}'. Expected 'type:id'"
                )
            parts = value.split(":", 1)
            try:
                return cls(type=parts[0], id=int(parts[1]))
            except ValueError:
                raise ValueError(
                    f"Invalid EntityRef string format: '{value}'. ID must be integer"
                )

        if isinstance(value, dict):
            # Allow both 'type' and 'entity_type' for flexibility
            entity_type = value.get("type") or value.get("entity_type")
            entity_id = value.get("id")
            if entity_type is not None and entity_id is not None:
                return cls(
                    type=entity_type,
                    id=int(entity_id),
                    meta=value.get("meta"),
                )
            raise ValueError(
                f"Invalid EntityRef dict: missing 'type' or 'id'. Got: {value}"
            )

        raise ValueError(f"Cannot parse EntityRef from {type(value).__name__}: {value}")

    def to_string(self) -> str:
        """Serialize to 'type:id' format."""
        return f"{self.type}:{self.id}"

    def __str__(self) -> str:
        return self.to_string()

    def __repr__(self) -> str:
        meta_str = f", meta={self.meta}" if self.meta else ""
        return f"EntityRef({self.type}:{self.id}{meta_str})"

    def __hash__(self) -> int:
        return hash((self.type, self.id))


def _make_entity_ref_validator(entity_type: str):
    """Create a validator that converts various formats to EntityRef."""

    def validate(value: Any) -> Optional[EntityRef]:
        if value is None:
            return None
        return EntityRef.parse_flexible(value, default_type=entity_type)

    return validate


# Type aliases for common entity types
# These use Annotated + BeforeValidator to automatically parse input
AssetRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("asset"))
]
SceneRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("scene"))
]
NpcRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("npc"))
]
LocationRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("location"))
]
WorldRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("world"))
]
SessionRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("session"))
]
UserRef = Annotated[
    Optional[EntityRef], BeforeValidator(_make_entity_ref_validator("user"))
]


def entity_ref_field(entity_type: str) -> type:
    """Create an annotated type for EntityRef fields with automatic parsing.

    Use this for entity types not covered by the pre-defined aliases.

    Usage:
        class MyDTO(BaseModel):
            custom_entity: Optional[entity_ref_field("custom")] = None

    Args:
        entity_type: The entity type string for this reference

    Returns:
        Annotated type alias for Optional[EntityRef]
    """
    return Annotated[
        Optional[EntityRef], BeforeValidator(_make_entity_ref_validator(entity_type))
    ]


__all__ = [
    "EntityRef",
    "AssetRef",
    "SceneRef",
    "NpcRef",
    "LocationRef",
    "WorldRef",
    "SessionRef",
    "UserRef",
    "entity_ref_field",
]
