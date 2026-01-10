"""Entity Reference Registry.

Central registry mapping field names to their expected entity types.
This is the single source of truth for *_id field -> entity type resolution.

Usage:
    from pixsim7.backend.main.services.refs.entity_ref_registry import (
        get_entity_ref_registry,
        register_default_ref_mappings,
    )

    # On startup
    register_default_ref_mappings()

    # Lookup entity type for a field
    registry = get_entity_ref_registry()
    entity_type = registry.get_entity_type("asset_id")  # -> "asset"
    # entity_type = registry.get_entity_type("scene_id")  # -> "scene"

Adding new mappings:
    # Global mapping (applies everywhere)
    registry.register("asset_id", "asset")

    # Model-specific mapping (overrides global for specific DTO)
    # registry.register("scene_id", "scene", model="GameHotspotDTO")

    # Pattern-based mapping (regex)
    registry.register_pattern(r".*_asset_id$", "asset")
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from pixsim7.backend.main.lib.registry.nested import NestedRegistry


@dataclass
class FieldRefConfig:
    """Configuration for a field that contains entity references."""

    entity_type: str
    """The entity type (e.g., 'asset', 'scene')"""

    field_pattern: Optional[str] = None
    """Regex pattern for field name matching (if pattern-based)"""

    description: Optional[str] = None
    """Human-readable description"""


class EntityRefRegistry:
    """Registry mapping field names to their expected entity types.

    Supports:
    - Exact field name matching: "asset_id" -> "asset"
    - Model-scoped overrides: "GameHotspotDTO.scene_id" -> "scene"
    - Pattern matching: "*_asset_id" -> "asset"

    Priority order:
    1. Model-specific exact match
    2. Global exact match
    3. Pattern match (first match wins)
    """

    def __init__(self):
        self._exact_mappings: Dict[str, FieldRefConfig] = {}
        # Model-scoped mappings: model_name -> field_name -> config
        self._model_mappings: NestedRegistry[str, str, FieldRefConfig] = NestedRegistry(
            name="entity_ref_model_mappings",
            allow_overwrite=True,  # Allow re-registration
            log_operations=False,  # Too noisy
        )
        self._patterns: List[Tuple[re.Pattern, FieldRefConfig]] = []

    def register(
        self,
        field_name: str,
        entity_type: str,
        model: Optional[str] = None,
        description: Optional[str] = None,
    ) -> None:
        """Register exact field name -> entity type mapping.

        Args:
            field_name: Field name to match (e.g., 'asset_id')
            entity_type: Entity type for this field (e.g., 'asset')
            model: Optional model name for scoped mapping (e.g., 'GameHotspotDTO')
            description: Human-readable description

        Example:
            registry.register("asset_id", "asset")
            registry.register("scene_id", "scene", model="GameHotspotDTO")
        """
        config = FieldRefConfig(entity_type=entity_type, description=description)
        if model:
            self._model_mappings.register(model, field_name, config)
        else:
            self._exact_mappings[field_name] = config

    def register_pattern(
        self,
        pattern: str,
        entity_type: str,
        description: Optional[str] = None,
    ) -> None:
        """Register regex pattern -> entity type mapping.

        Args:
            pattern: Regex pattern to match field names
            entity_type: Entity type for matching fields
            description: Human-readable description

        Example:
            registry.register_pattern(r".*_asset_id$", "asset")
        """
        compiled = re.compile(pattern)
        config = FieldRefConfig(
            entity_type=entity_type, field_pattern=pattern, description=description
        )
        self._patterns.append((compiled, config))

    def get_entity_type(
        self,
        field_name: str,
        model: Optional[str] = None,
    ) -> Optional[str]:
        """Lookup entity type for a field.

        Args:
            field_name: Field name to lookup
            model: Optional model name for scoped lookup

        Returns:
            Entity type string or None if not found

        Priority:
        1. Model-specific exact match
        2. Global exact match
        3. Pattern match (first match wins)
        """
        # 1. Model-specific exact match
        if model:
            config = self._model_mappings.get(model, field_name)
            if config:
                return config.entity_type

        # 2. Global exact match
        if field_name in self._exact_mappings:
            return self._exact_mappings[field_name].entity_type

        # 3. Pattern match
        for compiled_pattern, config in self._patterns:
            if compiled_pattern.match(field_name):
                return config.entity_type

        return None

    def get_config(
        self,
        field_name: str,
        model: Optional[str] = None,
    ) -> Optional[FieldRefConfig]:
        """Get full configuration for a field.

        Args:
            field_name: Field name to lookup
            model: Optional model name for scoped lookup

        Returns:
            FieldRefConfig or None if not found
        """
        # 1. Model-specific exact match
        if model:
            config = self._model_mappings.get(model, field_name)
            if config:
                return config

        # 2. Global exact match
        if field_name in self._exact_mappings:
            return self._exact_mappings[field_name]

        # 3. Pattern match
        for compiled_pattern, config in self._patterns:
            if compiled_pattern.match(field_name):
                return config

        return None

    def list_mappings(self) -> Dict[str, str]:
        """List all registered mappings (for debugging/introspection).

        Returns:
            Dict mapping field names (or "Model.field") to entity types
        """
        result: Dict[str, str] = {}

        # Global exact mappings
        for name, config in self._exact_mappings.items():
            result[name] = config.entity_type

        # Model-specific mappings
        for model, field, config in self._model_mappings.all_items():
            result[f"{model}.{field}"] = config.entity_type

        # Pattern mappings
        for compiled_pattern, config in self._patterns:
            result[f"pattern:{compiled_pattern.pattern}"] = config.entity_type

        return result

    def has_mapping(self, field_name: str, model: Optional[str] = None) -> bool:
        """Check if a mapping exists for a field.

        Args:
            field_name: Field name to check
            model: Optional model name for scoped check

        Returns:
            True if mapping exists, False otherwise
        """
        return self.get_entity_type(field_name, model) is not None

    def unregister(self, field_name: str, model: Optional[str] = None) -> bool:
        """Unregister a field mapping.

        Args:
            field_name: Field name to unregister
            model: Optional model name for scoped unregister

        Returns:
            True if mapping was removed, False if it didn't exist
        """
        if model:
            removed = self._model_mappings.unregister(model, field_name)
            if removed is not None:
                # Clean up empty namespace
                if self._model_mappings.count_of(model) == 0:
                    self._model_mappings.remove_namespace(model)
                return True
            return False

        if field_name in self._exact_mappings:
            del self._exact_mappings[field_name]
            return True
        return False


# Global singleton instance
_entity_ref_registry: Optional[EntityRefRegistry] = None


def get_entity_ref_registry() -> EntityRefRegistry:
    """Get the global EntityRefRegistry singleton.

    Returns:
        The singleton EntityRefRegistry instance
    """
    global _entity_ref_registry
    if _entity_ref_registry is None:
        _entity_ref_registry = EntityRefRegistry()
    return _entity_ref_registry


def register_default_ref_mappings() -> None:
    """Register default field -> entity type mappings.

    Call on service startup to register mappings for core fields.
    Domain-specific mappings can be registered in their respective modules.
    """
    registry = get_entity_ref_registry()

    # Common field name -> entity type mappings
    registry.register("asset_id", "asset", description="Reference to assets table")
    registry.register("user_id", "user", description="Reference to users table")
    registry.register("npc_id", "npc", description="Reference to game_npcs table")
    registry.register(
        "location_id", "location", description="Reference to game_locations table"
    )
    registry.register("scene_id", "scene", description="Reference to game_scenes table")
    registry.register(
        "session_id", "session", description="Reference to game_sessions table"
    )
    registry.register("world_id", "world", description="Reference to game_worlds table")

    # Model-specific overrides
    # registry.register(
    #     "scene_id",
    #     "scene",
    #     model="GameHotspotDTO",
    #     description="Hotspot action scene reference",
    # )

    # Pattern-based mappings for less common fields
    registry.register_pattern(r".*_asset_id$", "asset")
    registry.register_pattern(r".*_npc_id$", "npc")
    registry.register_pattern(r".*_location_id$", "location")
    registry.register_pattern(r".*_scene_id$", "scene")
