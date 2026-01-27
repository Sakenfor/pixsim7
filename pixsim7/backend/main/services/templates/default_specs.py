"""
Default Template CRUD Specs - Registration for core template types.

Registers CRUD specifications for:
- LocationTemplate (authoring)
- ItemTemplate (authoring)
- GameLocation (runtime) with nested hotspots
- GameScene (runtime) with nested nodes and edges
- GameNPC (runtime) with nested schedules and expressions
- GameWorld (runtime) with owner scoping
- GameItem (runtime)

Called during application startup to populate the TemplateCRUDRegistry.

Usage:
    from pixsim7.backend.main.services.templates.default_specs import register_default_template_specs

    # In startup.py
    register_default_template_specs()
"""
from __future__ import annotations

from .crud_registry import (
    TemplateCRUDSpec,
    NestedEntitySpec,
    get_template_crud_registry,
    parse_uuid,
    parse_int,
)
from pixsim7.backend.main.services.ownership import OwnershipPolicy, OwnershipScope


def register_default_template_specs() -> None:
    """
    Register CRUD specifications for core template types.

    This should be called once during application startup.
    """
    from pixsim7.backend.main.domain.game.entities.location_template import LocationTemplate
    from pixsim7.backend.main.domain.game.entities.item_template import ItemTemplate

    registry = get_template_crud_registry()

    # ==========================================================================
    # LocationTemplate
    # ==========================================================================
    registry.register_spec(TemplateCRUDSpec(
        kind="locationTemplate",
        model=LocationTemplate,
        url_prefix="location-templates",

        # ID configuration
        id_field="id",
        id_parser=parse_uuid,
        unique_field="location_id",

        # Behavior
        supports_soft_delete=True,
        supports_upsert=True,

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["is_active", "location_id", "location_type"],

        # Metadata
        tags=["templates", "locations"],
        description="Location template definitions for reusable location configurations.",
    ))

    # ==========================================================================
    # ItemTemplate
    # ==========================================================================
    registry.register_spec(TemplateCRUDSpec(
        kind="itemTemplate",
        model=ItemTemplate,
        url_prefix="item-templates",

        # ID configuration
        id_field="id",
        id_parser=parse_uuid,
        unique_field="item_id",

        # Behavior
        supports_soft_delete=True,
        supports_upsert=True,

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["is_active", "item_id", "category"],

        # Metadata
        tags=["templates", "items"],
        description="Item template definitions for reusable item configurations.",
    ))

    # ==========================================================================
    # GameLocation (runtime entity with nested hotspots)
    # ==========================================================================
    from pixsim7.backend.main.domain.game.core.models import GameLocation, GameHotspot

    registry.register_spec(TemplateCRUDSpec(
        kind="gameLocation",
        model=GameLocation,
        url_prefix="locations",

        # ID configuration - integer PK
        id_field="id",
        id_parser=parse_int,
        unique_field="name",

        # Behavior - no soft delete (no is_active field)
        supports_soft_delete=False,
        supports_upsert=False,

        # Ownership - scope to world
        ownership_policy=OwnershipPolicy(
            scope=OwnershipScope.WORLD,
            world_field="world_id",
        ),

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["name", "asset_id"],
        search_fields=["name"],

        # Nested entities (PUT /{id}/hotspots for replace_all is auto-generated)
        nested_entities=[
            NestedEntitySpec(
                kind="hotspot",
                parent_field="location_id",
                url_suffix="hotspots",
                model=GameHotspot,
                id_field="id",
                id_parser=parse_int,
                enable_list=True,
                enable_get=True,
                enable_create=True,
                enable_update=True,
                enable_delete=True,
                cascade_delete=True,
            ),
        ],

        # Metadata
        tags=["runtime", "locations"],
        description="Runtime game locations with hotspots for interactions.",
    ))

    # ==========================================================================
    # GameScene (with nested nodes and edges)
    # ==========================================================================
    from pixsim7.backend.main.domain.game.core.models import (
        GameScene, GameSceneNode, GameSceneEdge,
        GameNPC, NPCSchedule, NpcExpression,
        GameWorld, GameWorldState,
        GameItem,
    )

    registry.register_spec(TemplateCRUDSpec(
        kind="gameScene",
        model=GameScene,
        url_prefix="scenes",

        # ID configuration - integer PK
        id_field="id",
        id_parser=parse_int,
        unique_field="title",

        # Behavior - no soft delete
        supports_soft_delete=False,
        supports_upsert=False,

        # Ownership - scope to world
        ownership_policy=OwnershipPolicy(
            scope=OwnershipScope.WORLD,
            world_field="world_id",
        ),

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["title", "entry_node_id"],
        search_fields=["title", "description"],

        # Nested entities
        nested_entities=[
            NestedEntitySpec(
                kind="node",
                parent_field="scene_id",
                url_suffix="nodes",
                model=GameSceneNode,
                id_field="id",
                id_parser=parse_int,
                enable_list=True,
                enable_get=True,
                enable_create=True,
                enable_update=True,
                enable_delete=True,
                cascade_delete=True,
            ),
            NestedEntitySpec(
                kind="edge",
                parent_field="scene_id",
                url_suffix="edges",
                model=GameSceneEdge,
                id_field="id",
                id_parser=parse_int,
                enable_list=True,
                enable_get=True,
                enable_create=True,
                enable_update=True,
                enable_delete=True,
                cascade_delete=True,
            ),
        ],

        # Metadata
        tags=["runtime", "scenes"],
        description="Game scenes with nodes and edges for branching narratives.",
    ))

    # ==========================================================================
    # GameNPC (with nested schedules and expressions)
    # ==========================================================================
    registry.register_spec(TemplateCRUDSpec(
        kind="gameNPC",
        model=GameNPC,
        url_prefix="npcs",

        # ID configuration - integer PK
        id_field="id",
        id_parser=parse_int,
        unique_field="name",

        # Behavior - no soft delete
        supports_soft_delete=False,
        supports_upsert=False,

        # Ownership - scope to world
        ownership_policy=OwnershipPolicy(
            scope=OwnershipScope.WORLD,
            world_field="world_id",
        ),

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="id",
        list_order_desc=False,
        filterable_fields=["name", "home_location_id"],
        search_fields=["name"],

        # Nested entities
        nested_entities=[
            NestedEntitySpec(
                kind="schedule",
                parent_field="npc_id",
                url_suffix="schedules",
                model=NPCSchedule,
                id_field="id",
                id_parser=parse_int,
                enable_list=True,
                enable_get=True,
                enable_create=True,
                enable_update=True,
                enable_delete=True,
                cascade_delete=True,
            ),
            NestedEntitySpec(
                kind="expression",
                parent_field="npc_id",
                url_suffix="expressions",
                model=NpcExpression,
                id_field="id",
                id_parser=parse_int,
                enable_list=True,
                enable_get=True,
                enable_create=True,
                enable_update=True,
                enable_delete=True,
                cascade_delete=True,
            ),
        ],

        # Metadata
        tags=["runtime", "npcs"],
        description="Game NPCs with schedules and expressions.",
    ))

    # ==========================================================================
    # GameWorld (with nested world state)
    # ==========================================================================
    registry.register_spec(TemplateCRUDSpec(
        kind="gameWorld",
        model=GameWorld,
        url_prefix="worlds",

        # ID configuration - integer PK
        id_field="id",
        id_parser=parse_int,
        unique_field="name",

        # Behavior - no soft delete
        supports_soft_delete=False,
        supports_upsert=False,

        # Ownership - scope to user
        ownership_policy=OwnershipPolicy(
            scope=OwnershipScope.USER,
            owner_field="owner_user_id",
        ),
        owner_field="owner_user_id",

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["name", "owner_user_id"],
        search_fields=["name"],

        # Metadata
        tags=["runtime", "worlds"],
        description="Game worlds owned by users.",
    ))

    # ==========================================================================
    # GameItem (runtime items)
    # ==========================================================================
    registry.register_spec(TemplateCRUDSpec(
        kind="gameItem",
        model=GameItem,
        url_prefix="items",

        # ID configuration - integer PK
        id_field="id",
        id_parser=parse_int,
        unique_field="name",

        # Behavior - no soft delete
        supports_soft_delete=False,
        supports_upsert=False,

        # Ownership - scope to world
        ownership_policy=OwnershipPolicy(
            scope=OwnershipScope.WORLD,
            world_field="world_id",
        ),

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["name"],
        search_fields=["name", "description"],

        # Metadata
        tags=["runtime", "items"],
        description="Runtime game items.",
    ))


def register_character_instance_spec() -> None:
    """
    Register CRUD spec for CharacterInstance.

    Separate function as CharacterInstance has more complex behavior
    (versioning, evolution) that may need custom hooks.
    """
    from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance

    registry = get_template_crud_registry()

    registry.register_spec(TemplateCRUDSpec(
        kind="characterInstance",
        model=CharacterInstance,
        url_prefix="character-instances",

        # ID configuration
        id_field="id",
        id_parser=parse_uuid,
        unique_field="instance_id",

        # Behavior
        supports_soft_delete=True,
        supports_upsert=True,

        # Ownership - scope to world
        ownership_policy=OwnershipPolicy(
            scope=OwnershipScope.WORLD,
            world_field="world_id",
        ),

        # Query configuration
        default_limit=50,
        max_limit=200,
        list_order_by="created_at",
        list_order_desc=True,
        filterable_fields=["is_active", "instance_id", "character_id", "world_id"],

        # Metadata
        tags=["templates", "characters"],
        description="Character instance definitions linking characters to worlds.",
    ))
