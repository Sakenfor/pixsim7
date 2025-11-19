"""
Game domain models

This module contains all game-related domain models that were consolidated
from the standalone game service into the main backend.
"""
from pixsim7_backend.domain.game.models import (
    GameScene,
    GameSceneNode,
    GameSceneEdge,
    GameSession,
    GameSessionEvent,
    GameLocation,
    GameNPC,
    NPCSchedule,
    NPCState,
)
from pixsim7_backend.domain.game.ecs import (
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
    # Migration & projection
    migrate_relationship_to_components,
    project_components_to_relationship,
    sync_relationship_to_components,
    sync_components_to_relationship,
    ensure_npc_entity_initialized,
)

__all__ = [
    "GameScene",
    "GameSceneNode",
    "GameSceneEdge",
    "GameSession",
    "GameSessionEvent",
    "GameLocation",
    "GameNPC",
    "NPCSchedule",
    "NPCState",
    # ECS helpers
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
    # Metric registry
    "get_metric_registry",
    "resolve_metric",
    "get_npc_metric",
    "set_npc_metric",
    "update_npc_metric",
    "list_metrics_for_category",
    "get_metric_definition",
    # Migration & projection
    "migrate_relationship_to_components",
    "project_components_to_relationship",
    "sync_relationship_to_components",
    "sync_components_to_relationship",
    "ensure_npc_entity_initialized",
]
