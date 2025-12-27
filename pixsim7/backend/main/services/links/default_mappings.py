"""Default Mapping Configurations for Generic Links

Registers FieldMapping configurations for standard entity pairs.
Each mapping defines field-level sync behavior between template and runtime entities.

Mapping ID format: "templateKind->runtimeKind" (e.g., "characterInstance->npc")

This module should be called on service startup to register default mappings.
Domain-specific mappings can be added in their respective modules.
"""
from typing import Dict
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry
from pixsim7.backend.main.services.characters.npc_prompt_mapping import NPC_FIELD_MAPPING
from pixsim7.backend.main.services.prompt.context.mapping import FieldMapping


def register_default_mappings():
    """Register all default entity->entity mappings

    This function should be called on service startup to register
    FieldMapping configurations for core entity type pairs.

    Registered mappings:
    - characterInstance->npc: CharacterInstance ↔ GameNPC (existing)
    - itemTemplate->item: ItemTemplate ↔ ItemInstance (stub)
    - propTemplate->prop: PropTemplate ↔ PropInstance (stub)
    """
    registry = get_mapping_registry()

    # Register existing NPC mapping under 'characterInstance->npc'
    # This reuses the existing npc_prompt_mapping configuration
    registry.register('characterInstance->npc', NPC_FIELD_MAPPING)

    # Register stub mappings for other entity pairs
    # These can be expanded as the corresponding entity types are implemented
    registry.register('itemTemplate->item', get_item_template_mapping())
    registry.register('propTemplate->prop', get_prop_template_mapping())


def get_item_template_mapping() -> Dict[str, FieldMapping]:
    """Stub mapping for ItemTemplate → ItemInstance

    This is a placeholder for future item template/instance linking.
    Expand this as the item system is developed.

    Authority pattern (example):
    - Name, description, base stats: Template authoritative
    - Quantity, durability, state: Runtime authoritative

    Returns:
        Dictionary of field mappings for item template->instance links
    """
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "name",
                "runtime": "name"
            }
        ),
        "description": FieldMapping(
            target_path="description",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "description",
                "runtime": "description"
            }
        ),
        "quantity": FieldMapping(
            target_path="state.quantity",
            source="runtime",
            fallback="template",
            source_paths={
                "template": "default_quantity",
                "runtime": "quantity"
            }
        ),
        "durability": FieldMapping(
            target_path="state.durability",
            source="runtime",
            fallback="template",
            source_paths={
                "template": "max_durability",
                "runtime": "durability"
            }
        ),
        # Add more item-specific mappings as needed
    }


def get_prop_template_mapping() -> Dict[str, FieldMapping]:
    """Stub mapping for PropTemplate → PropInstance

    This is a placeholder for future prop template/instance linking.
    Expand this as the prop system is developed.

    Authority pattern (example):
    - Name, visual config, interaction type: Template authoritative
    - State, interaction count, animation state: Runtime authoritative

    Returns:
        Dictionary of field mappings for prop template->instance links
    """
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "name",
                "runtime": "name"
            }
        ),
        "assetId": FieldMapping(
            target_path="visual.assetId",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "asset_id",
                "runtime": "asset_id"
            }
        ),
        "interactionState": FieldMapping(
            target_path="state.interactionState",
            source="runtime",
            fallback="none",
            source_paths={
                "runtime": "interaction_state"
            }
        ),
        # Add more prop-specific mappings as needed
    }


# Additional mapping factories can be added here for other entity types:
# - get_location_template_mapping()
# - get_building_template_mapping()
# - get_vehicle_template_mapping()
# etc.
