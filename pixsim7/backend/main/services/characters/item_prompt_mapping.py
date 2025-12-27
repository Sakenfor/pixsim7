"""
Item-specific prompt context field mapping configuration.

Placeholder for future item entity support.
Shows how items would integrate with the generic mapping infrastructure.
"""

from typing import Dict
from pixsim7.backend.main.services.prompt.context.mapping import FieldMapping


# Item Prompt Context Mapping Configuration (Placeholder)
#
# When implementing items, this would define how item data flows into prompts:
# - Template source: ItemDefinition (from content/templates)
# - Runtime source: ItemInstance (from game state)
# - Config source: World/location item configuration
#
# Example mapping:
# ITEM_FIELD_MAPPING: Dict[str, FieldMapping] = {
#     "name": FieldMapping(
#         target_path="name",
#         source="template",
#         fallback="runtime",
#         source_paths={
#             "template": "name",
#             "runtime": "override_name"
#         }
#     ),
#     "durability": FieldMapping(
#         target_path="state.durability",
#         source="runtime",
#         fallback="template",
#         source_paths={
#             "template": "default_durability",
#             "runtime": "durability"
#         }
#     ),
#     "quantity": FieldMapping(
#         target_path="state.quantity",
#         source="runtime",
#         fallback="none",
#         source_paths={"runtime": "quantity"}
#     ),
# }

ITEM_FIELD_MAPPING: Dict[str, FieldMapping] = {
    # Placeholder: Add item-specific field mappings here
    # Example:
    # "name": FieldMapping(
    #     target_path="name",
    #     source="template",
    #     fallback="runtime",
    #     source_paths={"template": "name", "runtime": "override_name"}
    # ),
}


def get_item_field_mapping() -> Dict[str, FieldMapping]:
    """Get the item-specific field mapping configuration."""
    return ITEM_FIELD_MAPPING
