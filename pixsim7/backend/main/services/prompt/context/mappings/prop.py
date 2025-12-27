"""
Prop-specific prompt context field mapping configuration.

Placeholder for future prop entity support.
Shows how props would integrate with the generic mapping infrastructure.
"""

from typing import Dict
from ..mapping import FieldMapping


# Prop Prompt Context Mapping Configuration (Placeholder)
#
# When implementing props, this would define how prop data flows into prompts:
# - Template source: PropDefinition (from content/templates)
# - Runtime source: PropInstance/PropState (from game state)
# - Config source: Location prop configuration
#
# Example mapping:
# PROP_FIELD_MAPPING: Dict[str, FieldMapping] = {
#     "name": FieldMapping(
#         target_path="name",
#         source="template",
#         fallback="runtime",
#         source_paths={
#             "template": "name",
#             "runtime": "override_name"
#         }
#     ),
#     "interactionState": FieldMapping(
#         target_path="state.interaction",
#         source="runtime",
#         fallback="template",
#         source_paths={
#             "template": "default_state",
#             "runtime": "interaction_state"
#         }
#     ),
#     "assetId": FieldMapping(
#         target_path="visual.assetId",
#         source="template",
#         fallback="none",
#         source_paths={"template": "asset_id"},
#         transform=lambda value, ctx: f"asset:{value}" if value else None
#     ),
# }

PROP_FIELD_MAPPING: Dict[str, FieldMapping] = {
    # Placeholder: Add prop-specific field mappings here
    # Example:
    # "name": FieldMapping(
    #     target_path="name",
    #     source="template",
    #     fallback="runtime",
    #     source_paths={"template": "name", "runtime": "override_name"}
    # ),
}


def get_prop_field_mapping() -> Dict[str, FieldMapping]:
    """Get the prop-specific field mapping configuration."""
    return PROP_FIELD_MAPPING
