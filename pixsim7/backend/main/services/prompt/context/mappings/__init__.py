"""
Prompt Context Field Mappings

Entity-specific field mapping configurations for prompt context resolution.
Each mapping defines how entity data flows into prompts.
"""
from .npc import NPC_FIELD_MAPPING, get_npc_field_mapping
from .player import PLAYER_FIELD_MAPPING, get_player_field_mapping
from .item import ITEM_FIELD_MAPPING, get_item_field_mapping
from .prop import PROP_FIELD_MAPPING, get_prop_field_mapping

__all__ = [
    "NPC_FIELD_MAPPING",
    "get_npc_field_mapping",
    "PLAYER_FIELD_MAPPING",
    "get_player_field_mapping",
    "ITEM_FIELD_MAPPING",
    "get_item_field_mapping",
    "PROP_FIELD_MAPPING",
    "get_prop_field_mapping",
]
