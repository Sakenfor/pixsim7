"""
Stats Domain Module

Central registry for stat definitions (relationships, skills, etc.).
Follows the same pattern as the concepts module.

Usage:
    from pixsim7.backend.main.domain.stats import (
        get_world_config,
        get_definition,
        get_registered_definitions,
    )

    # Get complete world config with merged definitions
    config = get_world_config(world.meta)

    # Access pre-computed ordering
    tier_order = config.tier_order  # ['stranger', 'acquaintance', ...]
    level_order = config.level_order  # ['light_flirt', 'deep_flirt', ...]

Plugin Extension:
    Plugins can register additional stat definitions:

    from pixsim7.backend.main.domain.stats import (
        stat_definition_provider,
        StatDefinitionProvider,
        StatDefinition,
    )

    @stat_definition_provider
    class MyCustomStatsProvider(StatDefinitionProvider):
        definition_id = "custom_stats"

        def get_definition(self) -> StatDefinition:
            return StatDefinition(...)
"""

# Import providers to trigger @stat_definition_provider decorator registration
from . import providers as _providers  # noqa: F401

# Re-export registry functions
from .registry import (
    # Registry access
    get_registered_definitions,
    get_definition,
    get_all_definition_ids,
    reset_registry,
    reinitialize_registry,
    # Merging
    get_merged_stats_config,
    get_world_config,
    # Provider decorator
    stat_definition_provider,
    StatDefinitionProvider,
    StatRegistryError,
)

# Re-export models
from .models import (
    # Schema version
    STATS_SCHEMA_VERSION,
    # Core models
    StatAxis,
    StatTier,
    StatLevel,
    StatCondition,
    StatDefinition,
    WorldStatsConfig,
    # Gating models
    IntimacyBandThreshold,
    ContentRatingGate,
    InteractionGate,
    IntimacyGatingConfig,
    # Manifest
    WorldManifest,
    # Response
    WorldConfigResponse,
)


__all__ = [
    # Schema version
    "STATS_SCHEMA_VERSION",
    # Registry access
    "get_registered_definitions",
    "get_definition",
    "get_all_definition_ids",
    "reset_registry",
    "reinitialize_registry",
    # Merging
    "get_merged_stats_config",
    "get_world_config",
    # Provider decorator
    "stat_definition_provider",
    "StatDefinitionProvider",
    "StatRegistryError",
    # Models
    "StatAxis",
    "StatTier",
    "StatLevel",
    "StatCondition",
    "StatDefinition",
    "WorldStatsConfig",
    "IntimacyBandThreshold",
    "ContentRatingGate",
    "InteractionGate",
    "IntimacyGatingConfig",
    "WorldManifest",
    "WorldConfigResponse",
]
