"""
Player-specific prompt context field mapping configuration.

Placeholder for future player entity support.
Shows how players would integrate with the generic mapping infrastructure.
"""

from typing import Dict
from pixsim7.backend.main.services.prompt.context.mapping import FieldMapping


# Player Prompt Context Mapping Configuration (Placeholder)
#
# When implementing players, this would define how player data flows into prompts:
# - Template source: PlayerProfile (user preferences, character template)
# - Runtime source: PlayerState (current session state)
# - Config source: World/session player configuration
#
# Example mapping:
# PLAYER_FIELD_MAPPING: Dict[str, FieldMapping] = {
#     "name": FieldMapping(
#         target_path="name",
#         source="runtime",
#         fallback="template",
#         source_paths={
#             "template": "character_name",
#             "runtime": "display_name"
#         }
#     ),
#     "inputState": FieldMapping(
#         target_path="state.input",
#         source="runtime",
#         fallback="none",
#         source_paths={"runtime": "input_state"}
#     ),
#     "preferences": FieldMapping(
#         target_path="preferences",
#         source="template",
#         fallback="runtime",
#         source_paths={
#             "template": "user_preferences",
#             "runtime": "session_preferences"
#         }
#     ),
# }

PLAYER_FIELD_MAPPING: Dict[str, FieldMapping] = {
    # Placeholder: Add player-specific field mappings here
    # Example:
    # "name": FieldMapping(
    #     target_path="name",
    #     source="runtime",
    #     fallback="template",
    #     source_paths={"template": "character_name", "runtime": "display_name"}
    # ),
}


def get_player_field_mapping() -> Dict[str, FieldMapping]:
    """Get the player-specific field mapping configuration."""
    return PLAYER_FIELD_MAPPING
