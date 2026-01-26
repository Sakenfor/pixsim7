"""
Default Template CRUD Specs - Registration for core template types.

Registers CRUD specifications for:
- LocationTemplate
- ItemTemplate

Called during application startup to populate the TemplateCRUDRegistry.

Usage:
    from pixsim7.backend.main.services.templates.default_specs import register_default_template_specs

    # In startup.py
    register_default_template_specs()
"""
from __future__ import annotations

from .crud_registry import (
    TemplateCRUDSpec,
    get_template_crud_registry,
    parse_uuid,
)


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
