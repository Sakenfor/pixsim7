"""Default Mapping Configurations for Generic Links.

Registers FieldMapping configurations for standard entity pairs.
Each mapping defines field-level sync behavior between template and runtime entities.

Mapping ID format: "templateKind->runtimeKind" (e.g., "characterInstance->npc").
"""
from typing import Dict

from pixsim7.backend.main.services.links.link_types import get_link_type_registry
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry
from pixsim7.backend.main.services.prompt.context.mapping import FieldMapping


def register_default_mappings() -> None:
    """Register all default entity->entity mappings.

    Mappings for core link types are derived from the link type registry.
    """
    from pixsim7.backend.main.services.links.link_types import register_default_link_types
    register_default_link_types()

    registry = get_mapping_registry()

    for spec in get_link_type_registry().list_specs():
        if spec.mapping_factory:
            registry.register(spec.mapping_id, spec.mapping_factory())

    # Register stub mappings for other entity pairs
    registry.register("propTemplate->prop", get_prop_template_mapping())


def get_prop_template_mapping() -> Dict[str, FieldMapping]:
    """Stub mapping for PropTemplate -> PropInstance.

    This is a placeholder for future prop template/instance linking.
    Expand this as the prop system is developed.
    """
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "name",
                "runtime": "name",
            },
        ),
        "assetId": FieldMapping(
            target_path="visual.assetId",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "asset_id",
                "runtime": "asset_id",
            },
        ),
        "interactionState": FieldMapping(
            target_path="state.interactionState",
            source="runtime",
            fallback="none",
            source_paths={
                "runtime": "interaction_state",
            },
        ),
    }


# Additional mapping factories can be added here for other entity types:
# - get_location_template_mapping()
# - get_building_template_mapping()
# - get_vehicle_template_mapping()
