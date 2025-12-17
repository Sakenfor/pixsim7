"""
Unified Game Domain Package

This package consolidates all game-related domain logic:
- Core: GameWorld, GameSession, GameLocation, GameScene, ECS
- Entities: Character templates, instances, NPCs, memory models
- Stats: Abstract stat system with packages (relationships, mood, etc.)
- Behavior: Activity simulation, scoring, conditions, effects
- Brain: Cognitive modeling and derivations
- Interactions: NPC interaction mechanics
- Schemas: Pydantic validation schemas

Import patterns:
    # High-level imports (most common)
    from pixsim7.backend.main.domain.game import (
        GameWorld, GameSession, GameNPC,
        Character, CharacterInstance,
        StatEngine, BrainEngine,
    )

    # Subpackage imports (for specialized use)
    from pixsim7.backend.main.domain.game.stats import (
        get_default_mood_definition,
        StatPackage,
    )
    from pixsim7.backend.main.domain.game.behavior import (
        evaluate_condition,
        choose_npc_activity,
    )
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

# Core models and ECS
from .core import (
    GameWorld,
    GameWorldState,
    GameSession,
    GameSessionEvent,
    GameLocation,
    GameScene,
    GameSceneNode,
    GameSceneEdge,
    GameNPC,
    NPCSchedule,
    NPCState,
    NpcExpression,
    GameHotspot,
    # ECS
    get_npc_entity,
    set_npc_entity,
    get_npc_component,
    set_npc_component,
    update_npc_component,
    delete_npc_component,
    has_npc_component,
    list_npc_components,
    get_npc_tags,
    set_npc_tags,
    add_npc_tag,
    remove_npc_tag,
    get_npc_metadata,
    set_npc_metadata,
    update_npc_metadata,
    validate_entity,
    get_metric_registry,
    resolve_metric,
    get_npc_metric,
    set_npc_metric,
    update_npc_metric,
    list_metrics_for_category,
    get_metric_definition,
    register_core_components,
    # Game state
    get_game_state,
    set_game_state,
    update_game_state,
    clear_game_state,
    is_in_mode,
    is_conversation_mode,
    is_scene_mode,
    is_room_mode,
    is_map_mode,
    is_menu_mode,
    get_focused_npc,
    get_active_narrative_program,
    get_current_location,
    get_current_scene,
)

# Entities (characters and NPCs)
from .entities import (
    Character,
    CharacterRelationship,
    CharacterUsage,
    CharacterInstance,
    CharacterNPCLink,
    CharacterCapability,
    SceneCharacterManifest,
    CharacterDialogueProfile,
    get_character_graph,
    find_characters_for_npc,
    find_scenes_for_character,
    find_assets_for_character,
    get_character_usage_stats,
    format_character_ref,
    format_instance_ref,
    parse_character_ref,
    set_scene_role_binding,
    get_scene_role_binding,
    get_all_scene_roles,
    set_asset_character_linkage,
    get_asset_character_linkage,
    ConversationMemory,
    NPCEmotionalState,
    ConversationTopic,
    RelationshipMilestone,
    NPCWorldContext,
    PersonalityEvolutionEvent,
    DialogueAnalytics,
)

# Interactions
from .interactions import (
    RelationshipDelta,
    StatDelta,
    FlagChanges,
    InventoryChanges,
    apply_relationship_deltas,
    apply_stat_deltas,
    apply_flag_changes,
    apply_inventory_changes,
)

# Schemas
from .schemas import (
    GameStateSchema,
    WorldSchedulerConfigSchema,
    get_default_world_scheduler_config,
)

# Stats (selective exports - most use subpackage imports)
from .stats import (
    StatEngine,
    create_stat_engine,
    WorldStatsConfig,
    StatDefinition,
    StatAxis,
    StatTier,
    StatLevel,
    register_core_stat_packages,
)

# Behavior exports are intentionally lazy-loaded via __getattr__.
# Importing behavior modules at package import time triggers registration side effects
# (conditions/effects/scoring), which is undesirable during Alembic migrations.
if TYPE_CHECKING:
    from .behavior import (  # noqa: F401
        evaluate_condition,
        choose_npc_activity,
        apply_activity_to_npc,
        determine_simulation_tier,
    )

# Brain (selective exports)
from .brain import (
    BrainEngine,
    BrainState,
)

__all__ = [
    # Core models
    "GameWorld",
    "GameWorldState",
    "GameSession",
    "GameSessionEvent",
    "GameLocation",
    "GameScene",
    "GameSceneNode",
    "GameSceneEdge",
    "GameNPC",
    "NPCSchedule",
    "NPCState",
    "NpcExpression",
    "GameHotspot",
    # ECS
    "get_npc_entity",
    "set_npc_entity",
    "get_npc_component",
    "set_npc_component",
    "update_npc_component",
    "delete_npc_component",
    "has_npc_component",
    "list_npc_components",
    "get_npc_tags",
    "set_npc_tags",
    "add_npc_tag",
    "remove_npc_tag",
    "get_npc_metadata",
    "set_npc_metadata",
    "update_npc_metadata",
    "validate_entity",
    "get_metric_registry",
    "resolve_metric",
    "get_npc_metric",
    "set_npc_metric",
    "update_npc_metric",
    "list_metrics_for_category",
    "get_metric_definition",
    "register_core_components",
    # Game state
    "GameStateSchema",
    "WorldSchedulerConfigSchema",
    "get_default_world_scheduler_config",
    "get_game_state",
    "set_game_state",
    "update_game_state",
    "clear_game_state",
    "is_in_mode",
    "is_conversation_mode",
    "is_scene_mode",
    "is_room_mode",
    "is_map_mode",
    "is_menu_mode",
    "get_focused_npc",
    "get_active_narrative_program",
    "get_current_location",
    "get_current_scene",
    # Entities - Characters
    "Character",
    "CharacterRelationship",
    "CharacterUsage",
    "CharacterInstance",
    "CharacterNPCLink",
    "CharacterCapability",
    "SceneCharacterManifest",
    "CharacterDialogueProfile",
    "get_character_graph",
    "find_characters_for_npc",
    "find_scenes_for_character",
    "find_assets_for_character",
    "get_character_usage_stats",
    "format_character_ref",
    "format_instance_ref",
    "parse_character_ref",
    "set_scene_role_binding",
    "get_scene_role_binding",
    "get_all_scene_roles",
    "set_asset_character_linkage",
    "get_asset_character_linkage",
    # Entities - NPC Memory
    "ConversationMemory",
    "NPCEmotionalState",
    "ConversationTopic",
    "RelationshipMilestone",
    "NPCWorldContext",
    "PersonalityEvolutionEvent",
    "DialogueAnalytics",
    # Interactions
    "RelationshipDelta",
    "StatDelta",
    "FlagChanges",
    "InventoryChanges",
    "apply_relationship_deltas",
    "apply_stat_deltas",
    "apply_flag_changes",
    "apply_inventory_changes",
    # Stats (selective)
    "StatEngine",
    "create_stat_engine",
    "WorldStatsConfig",
    "StatDefinition",
    "StatAxis",
    "StatTier",
    "StatLevel",
    "register_core_stat_packages",
    # Behavior (selective)
    "evaluate_condition",
    "choose_npc_activity",
    "apply_activity_to_npc",
    "determine_simulation_tier",
    # Brain (selective)
    "BrainEngine",
    "BrainState",
]


def __getattr__(name: str) -> Any:
    if name in {
        "evaluate_condition",
        "choose_npc_activity",
        "apply_activity_to_npc",
        "determine_simulation_tier",
    }:
        from . import behavior as _behavior
        return getattr(_behavior, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
