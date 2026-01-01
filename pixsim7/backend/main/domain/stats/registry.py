"""
Stat Definition Registry

Central registry for stat definitions. Plugins register their stat definitions
using the @stat_definition_provider decorator.

Similar to the concepts registry pattern.
"""
from typing import Dict, List, Optional, Type, TypeVar, Callable, Any
from copy import deepcopy

from .models import (
    StatDefinition,
    StatTier,
    StatLevel,
    StatAxis,
    StatCondition,
    WorldStatsConfig,
    IntimacyGatingConfig,
    WorldManifest,
    WorldConfigResponse,
    STATS_SCHEMA_VERSION,
)


# =============================================================================
# Registry State
# =============================================================================

# Base stat definitions (registered by providers)
_definition_registry: Dict[str, StatDefinition] = {}

# Track registered provider classes for re-initialization after reset
_provider_classes: List[Type["StatDefinitionProvider"]] = []

T = TypeVar("T", bound="StatDefinitionProvider")


# =============================================================================
# Errors
# =============================================================================

class StatRegistryError(Exception):
    """Error during stat definition registration or operation."""
    pass


# =============================================================================
# Provider Base Class
# =============================================================================

class StatDefinitionProvider:
    """Base class for stat definition providers.

    Subclass and use @stat_definition_provider decorator to auto-register.
    """
    # Subclasses must set this
    definition_id: str = ""

    def get_definition(self) -> StatDefinition:
        """Return the stat definition. Must be implemented by subclass."""
        raise NotImplementedError


# =============================================================================
# Decorator
# =============================================================================

def stat_definition_provider(cls: Type[T]) -> Type[T]:
    """Decorator that auto-registers a StatDefinitionProvider subclass.

    Usage:
        @stat_definition_provider
        class RelationshipStatsProvider(StatDefinitionProvider):
            definition_id = "relationships"

            def get_definition(self) -> StatDefinition:
                return StatDefinition(...)

    Raises:
        StatRegistryError: If definition_id is empty or already registered.
    """
    instance = cls()

    if not instance.definition_id:
        raise StatRegistryError(
            f"Provider {cls.__name__} has empty 'definition_id'. "
            "Set definition_id = 'your_id' as a class attribute."
        )

    if instance.definition_id in _definition_registry:
        existing = _definition_registry[instance.definition_id]
        raise StatRegistryError(
            f"Duplicate stat definition '{instance.definition_id}': "
            f"{cls.__name__} conflicts with existing definition"
        )

    # Get and validate the definition
    definition = instance.get_definition()
    if definition.id != instance.definition_id:
        raise StatRegistryError(
            f"Provider {cls.__name__} definition_id '{instance.definition_id}' "
            f"doesn't match definition.id '{definition.id}'"
        )

    # Register
    _definition_registry[instance.definition_id] = definition
    _provider_classes.append(cls)

    return cls


# =============================================================================
# Registry Access Functions
# =============================================================================

def get_registered_definitions() -> Dict[str, StatDefinition]:
    """Get all registered stat definitions (copy)."""
    return dict(_definition_registry)


def get_definition(definition_id: str) -> Optional[StatDefinition]:
    """Get a stat definition by ID."""
    return _definition_registry.get(definition_id)


def get_all_definition_ids() -> List[str]:
    """Get all registered definition IDs."""
    return list(_definition_registry.keys())


def reset_registry() -> None:
    """Reset the registry (for testing)."""
    global _definition_registry, _provider_classes
    _definition_registry = {}
    _provider_classes = []


def reinitialize_registry() -> None:
    """Re-initialize all registered providers (for testing)."""
    global _definition_registry
    _definition_registry = {}
    for cls in _provider_classes:
        instance = cls()
        definition = instance.get_definition()
        _definition_registry[instance.definition_id] = definition


# =============================================================================
# Merging with World Overrides
# =============================================================================

def get_merged_stats_config(world_meta: Optional[Dict[str, Any]] = None) -> WorldStatsConfig:
    """Get stats config merged with world overrides.

    Starts with registered base definitions, then merges any world-specific
    overrides from world.meta.stats_config.

    Args:
        world_meta: The world's meta dict (optional)

    Returns:
        WorldStatsConfig with merged definitions
    """
    # Start with base definitions
    merged_definitions = {}
    for def_id, defn in _definition_registry.items():
        merged_definitions[def_id] = defn.model_copy(deep=True)

    # Apply world overrides if present
    if world_meta:
        world_stats = world_meta.get("stats_config", {})
        world_defs = world_stats.get("definitions", {})

        for def_id, override in world_defs.items():
            if def_id in merged_definitions:
                # Merge override into existing definition
                base = merged_definitions[def_id]
                merged_definitions[def_id] = _merge_definition(base, override)
            else:
                # New definition from world (no base)
                try:
                    merged_definitions[def_id] = StatDefinition.model_validate(override)
                except Exception:
                    pass  # Skip invalid definitions

    return WorldStatsConfig(
        version=STATS_SCHEMA_VERSION,
        definitions=merged_definitions
    )


def _merge_definition(base: StatDefinition, override: Dict[str, Any]) -> StatDefinition:
    """Merge an override dict into a base definition."""
    merged = base.model_copy(deep=True)

    # Merge simple fields
    if "display_name" in override:
        merged.display_name = override["display_name"]
    if "description" in override:
        merged.description = override["description"]

    # Merge tiers (add/replace by ID)
    if "tiers" in override:
        tier_map = {t.id: t for t in merged.tiers}
        for tier_data in override["tiers"]:
            try:
                tier = StatTier.model_validate(tier_data)
                tier_map[tier.id] = tier
            except Exception:
                pass
        merged.tiers = list(tier_map.values())

    # Merge levels (add/replace by ID)
    if "levels" in override:
        level_map = {l.id: l for l in merged.levels}
        for level_data in override["levels"]:
            try:
                level = StatLevel.model_validate(level_data)
                level_map[level.id] = level
            except Exception:
                pass
        merged.levels = list(level_map.values())

    return merged


# =============================================================================
# Complete World Config
# =============================================================================

def get_world_config(world_meta: Optional[Dict[str, Any]] = None) -> WorldConfigResponse:
    """Get complete world configuration.

    Merges registered definitions with world overrides and returns
    a complete config response with pre-computed ordering.

    Args:
        world_meta: The world's meta dict (optional)

    Returns:
        WorldConfigResponse with all config and pre-computed orders
    """
    meta = world_meta or {}

    # Get merged stats config
    stats_config = get_merged_stats_config(meta)

    # Parse manifest
    manifest_data = meta.get("manifest", {})
    try:
        manifest = WorldManifest.model_validate(manifest_data)
    except Exception:
        manifest = WorldManifest()

    # Parse intimacy gating
    gating_data = meta.get("intimacy_gating", {})
    try:
        intimacy_gating = IntimacyGatingConfig.model_validate(gating_data)
    except Exception:
        intimacy_gating = IntimacyGatingConfig()

    # Pre-compute ordering for relationships (primary stat definition)
    tier_order = stats_config.get_tier_order("relationships")
    level_order = stats_config.get_level_order("relationships")

    return WorldConfigResponse(
        schema_version=STATS_SCHEMA_VERSION,
        stats_config=stats_config,
        manifest=manifest,
        intimacy_gating=intimacy_gating,
        tier_order=tier_order,
        level_order=level_order,
    )
