"""
Abstract stat system for flexible game mechanics.

Provides a generic framework for tracking and computing stats, tiers, and levels.
Replaces hardcoded relationship system with configurable stat definitions.

Supports:
- Session-owned stats (player's relationships, skills)
- Entity-owned stats (NPC attributes, item modifiers)
- Hybrid approach (base stats + session overrides)
- Equipment/buff/debuff modifiers

Built-in Stat Packages:
- core.relationships: Affinity, trust, chemistry, tension
- core.personality: Big Five personality traits
- core.mood: Valence-arousal circumplex model
- core.resources: Energy, hunger, stamina, health, stress
- core.drives: Motivational needs (social, rest, achievement, etc.)

Semantic Derivation System:
Packages can declare derivation capabilities that automatically compute
derived stats from semantic types. For example, mood can be derived from
any package providing "positive_sentiment" axes (like relationships.affinity).
This allows packages to work together without hardcoded dependencies.
"""

from .schemas import (
    StatAxis,
    StatTier,
    StatLevel,
    StatCondition,
    StatDefinition,
    WorldStatsConfig,
    # Schema version
    STATS_SCHEMA_VERSION,
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
from .derivation_schemas import (
    DerivationFormula,
    DerivationCapability,
    TransformRule,
    TransformCondition,
    ConditionSpec,
    SEMANTIC_TYPES,
)
from .engine import StatEngine
from .factory import create_stat_engine
from .mixins import HasStats, HasStatsWithMetadata
from .package_registry import (
    StatPackage,
    register_stat_package,
    get_stat_package,
    list_stat_packages,
    find_stat_definitions,
    get_all_semantic_types,
    find_axes_by_semantic_type,
    get_applicable_derivations,
    # World config builder
    get_merged_stats_config,
    get_world_config,
)
from .derivation_engine import (
    DerivationEngine,
    DerivationResult,
    ResolvedAxis,
    get_derivation_engine,
)
# Legacy relationship migration helpers are kept in the migration module;
# only the default relationship definition is exported at the package level
# so the core API stays focused on generic stats.
from .migration import get_default_relationship_definition
from .package_utils import (
    initialize_stat_package_entity,
    merge_stat_package_entity,
    normalize_stat_package_entity,
    normalize_stat_package_all,
)

# Convenience exports for default definitions (import functions, not packages)
from .personality_package import get_default_personality_definition
from .mood_package import get_default_mood_definition
from .resources_package import get_default_resources_definition
from .drives_package import get_default_drives_definition
from .behavior_urgency_package import get_behavior_urgency_definition
from .conversation_style_package import get_conversation_style_definition


# ===================
# Core Package Registration
# ===================

_core_packages_registered = False


def register_core_stat_packages() -> None:
    """
    Register all core stat packages with the registry.

    This is called automatically via the plugin system's STAT_PACKAGES_REGISTER hook.
    Can also be called manually for testing or standalone use.

    Core packages:
    - core.relationships: Social relationships (affinity, trust, chemistry, tension)
    - core.personality: Big Five personality traits
    - core.mood: Valence-arousal circumplex mood model
    - core.resources: Life sim resources (energy, hunger, stamina, health, stress)
    - core.drives: Motivational needs (social, rest, achievement, etc.)
    - core.behavior_urgency: Derived urgency scores for activity selection
    - core.conversation_style: Derived conversation style from personality/mood
    """
    global _core_packages_registered
    if _core_packages_registered:
        return

    # Import and register each package
    from .relationships_package import register_core_relationships_package
    from .personality_package import register_core_personality_package
    from .mood_package import register_core_mood_package
    from .resources_package import register_core_resources_package
    from .drives_package import register_core_drives_package
    from .behavior_urgency_package import register_behavior_urgency_package
    from .conversation_style_package import register_conversation_style_package

    register_core_relationships_package()
    register_core_personality_package()
    register_core_mood_package()
    register_core_resources_package()
    register_core_drives_package()
    register_behavior_urgency_package()
    register_conversation_style_package()

    _core_packages_registered = True


def _on_stat_packages_register(plugin_id: str) -> None:
    """
    Hook handler for STAT_PACKAGES_REGISTER event.

    Called by the plugin system when a plugin loads. We use this to register
    core packages when the first plugin loads (usually the core/app itself).
    """
    # Register core packages if not already done
    register_core_stat_packages()


def setup_stat_package_hooks() -> None:
    """
    Set up hooks for stat package registration with the plugin system.

    Call this during app initialization to enable plugin-based package registration.
    """
    try:
        from pixsim7.backend.main.infrastructure.plugins.types import (
            plugin_hooks,
            PluginEvents,
        )
        plugin_hooks.register(PluginEvents.STAT_PACKAGES_REGISTER, _on_stat_packages_register)
    except ImportError:
        # Plugin system not available (e.g., in tests or standalone use)
        # Fall back to immediate registration
        register_core_stat_packages()

__all__ = [
    # Core schemas
    "StatAxis",
    "StatTier",
    "StatLevel",
    "StatCondition",
    "StatDefinition",
    "WorldStatsConfig",
    # Schema version
    "STATS_SCHEMA_VERSION",
    # Gating models
    "IntimacyBandThreshold",
    "ContentRatingGate",
    "InteractionGate",
    "IntimacyGatingConfig",
    # Manifest
    "WorldManifest",
    # Response
    "WorldConfigResponse",
    # Derivation schemas
    "DerivationFormula",
    "DerivationCapability",
    "TransformRule",
    "TransformCondition",
    "ConditionSpec",
    "SEMANTIC_TYPES",
    # Engine
    "StatEngine",
    "create_stat_engine",
    # Derivation engine
    "DerivationEngine",
    "DerivationResult",
    "ResolvedAxis",
    "get_derivation_engine",
    # Mixins
    "HasStats",
    "HasStatsWithMetadata",
    # Package registry
    "StatPackage",
    "register_stat_package",
    "get_stat_package",
    "list_stat_packages",
    "find_stat_definitions",
    "get_all_semantic_types",
    "find_axes_by_semantic_type",
    "get_applicable_derivations",
    # World config builder
    "get_merged_stats_config",
    "get_world_config",
    # Default definitions
    "get_default_relationship_definition",
    "get_default_personality_definition",
    "get_default_mood_definition",
    "get_default_resources_definition",
    "get_default_drives_definition",
    "get_behavior_urgency_definition",
    "get_conversation_style_definition",
    # Package-style helpers
    "initialize_stat_package_entity",
    "merge_stat_package_entity",
    "normalize_stat_package_entity",
    "normalize_stat_package_all",
    # Package registration (for plugin system integration)
    "register_core_stat_packages",
    "setup_stat_package_hooks",
]
