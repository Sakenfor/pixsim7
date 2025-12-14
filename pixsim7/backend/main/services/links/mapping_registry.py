"""Mapping Registry for Generic Links

Provides a centralized registry for FieldMapping configurations
that define how template and runtime entities sync via ObjectLinks.

Mapping ID format: "templateKind->runtimeKind" (e.g., "character->npc")

Usage:
    # Register a mapping
    registry = get_mapping_registry()
    registry.register('character->npc', NPC_FIELD_MAPPING)

    # Retrieve a mapping
    mapping = registry.get('character->npc')
"""
from typing import Dict, Optional
from services.prompt_context.mapping import FieldMapping


class MappingRegistry:
    """Registry of FieldMapping configurations for different entity pairs

    Maps mapping IDs (e.g., "character->npc") to FieldMapping dictionaries
    that define field-level sync behavior between template and runtime entities.
    """

    def __init__(self):
        self._mappings: Dict[str, Dict[str, FieldMapping]] = {}

    def register(self, mapping_id: str, field_mappings: Dict[str, FieldMapping]) -> None:
        """Register a FieldMapping config under a mapping ID

        Args:
            mapping_id: Mapping identifier (format: "templateKind->runtimeKind")
            field_mappings: Dictionary of field mappings defining sync behavior

        Example:
            registry.register('character->npc', {
                'name': FieldMapping(...),
                'personality.openness': FieldMapping(...)
            })
        """
        if not mapping_id:
            raise ValueError("mapping_id cannot be empty")

        if '->' not in mapping_id:
            raise ValueError(
                f"Invalid mapping_id format: '{mapping_id}'. "
                "Expected 'templateKind->runtimeKind' (e.g., 'character->npc')"
            )

        self._mappings[mapping_id] = field_mappings

    def get(self, mapping_id: str) -> Optional[Dict[str, FieldMapping]]:
        """Get FieldMapping config by mapping ID

        Args:
            mapping_id: Mapping identifier (format: "templateKind->runtimeKind")

        Returns:
            Dictionary of field mappings, or None if not registered
        """
        return self._mappings.get(mapping_id)

    def list_mappings(self) -> Dict[str, Dict[str, FieldMapping]]:
        """List all registered mappings

        Returns:
            Copy of all registered mappings (mapping_id -> field_mappings)
        """
        return self._mappings.copy()

    def has_mapping(self, mapping_id: str) -> bool:
        """Check if a mapping ID is registered

        Args:
            mapping_id: Mapping identifier

        Returns:
            True if mapping exists, False otherwise
        """
        return mapping_id in self._mappings

    def unregister(self, mapping_id: str) -> bool:
        """Unregister a mapping

        Args:
            mapping_id: Mapping identifier to remove

        Returns:
            True if mapping was removed, False if it didn't exist
        """
        if mapping_id in self._mappings:
            del self._mappings[mapping_id]
            return True
        return False


# Global singleton instance
_mapping_registry = MappingRegistry()


def get_mapping_registry() -> MappingRegistry:
    """Get the global mapping registry instance

    Returns:
        The singleton MappingRegistry instance
    """
    return _mapping_registry
