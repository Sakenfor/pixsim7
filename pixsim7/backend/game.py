"""
PixSim7 Game Domain Entry Module

Provides a stable public interface for game-related functionality including:
- Core game models (scenes, sessions, locations, NPCs)
- Entity-Component-System (ECS) helpers for NPC state
- Game state management (mode, focus, current location)
- Game services for session and world management

Usage:
    from pixsim7.backend.game import (
        GameSession, GameNPC, GameLocation,
        get_npc_component, set_npc_component,
        get_game_state, is_conversation_mode,
        GameSessionService,
    )

See docs/backend/game.md for detailed documentation.
"""

# =============================================================================
# Domain Models
# =============================================================================

from pixsim7.backend.main.domain.game import (
    # Core models
    GameScene,
    GameSceneNode,
    GameSceneEdge,
    GameSession,
    GameSessionEvent,
    GameLocation,
    GameNPC,
    NPCSchedule,
    NPCState,
    # World models (for simulation)
    GameWorld,
    GameWorldState,
    # ECS helpers
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
    # Metric registry
    get_metric_registry,
    resolve_metric,
    get_npc_metric,
    set_npc_metric,
    update_npc_metric,
    list_metrics_for_category,
    get_metric_definition,
    # Game state
    GameStateSchema,
    # Scheduler config (for simulation domain)
    WorldSchedulerConfigSchema,
    get_default_world_scheduler_config,
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
    # Interaction types (for narrative domain)
    RelationshipDelta,
    StatDelta,
    FlagChanges,
    InventoryChanges,
    apply_relationship_deltas,
    apply_stat_deltas,
    apply_flag_changes,
    apply_inventory_changes,
)

# =============================================================================
# Services
# =============================================================================

from pixsim7.backend.main.services.game import (
    GameSessionService,
    GameLocationService,
    GameWorldService,
)
from pixsim7.backend.main.services.npc import (
    NpcExpressionService,
)

# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Core Models
    "GameScene",
    "GameSceneNode",
    "GameSceneEdge",
    "GameSession",
    "GameSessionEvent",
    "GameLocation",
    "GameNPC",
    "NPCSchedule",
    "NPCState",
    # World Models
    "GameWorld",
    "GameWorldState",
    # ECS Helpers
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
    # Metric Registry
    "get_metric_registry",
    "resolve_metric",
    "get_npc_metric",
    "set_npc_metric",
    "update_npc_metric",
    "list_metrics_for_category",
    "get_metric_definition",
    # Game State
    "GameStateSchema",
    # Scheduler Config
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
    # Interaction Types
    "RelationshipDelta",
    "StatDelta",
    "FlagChanges",
    "InventoryChanges",
    "apply_relationship_deltas",
    "apply_stat_deltas",
    "apply_flag_changes",
    "apply_inventory_changes",
    # Services
    "GameSessionService",
    "GameLocationService",
    "NpcExpressionService",
    "GameWorldService",
]
