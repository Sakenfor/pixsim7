"""Character and NPC entity models"""

from .character import (
    Character,
    CharacterRelationship,
    CharacterUsage,
)

from .character_integrations import (
    CharacterInstance,
    CharacterNPCLink,
    CharacterCapability,
    SceneCharacterManifest,
    CharacterDialogueProfile,
)

from .character_graph import (
    get_character_graph,
    find_characters_for_npc,
    find_scenes_for_character,
    find_assets_for_character,
    get_character_usage_stats,
)

from .character_linkage import (
    format_character_ref,
    format_instance_ref,
    parse_character_ref,
    set_scene_role_binding,
    get_scene_role_binding,
    get_all_scene_roles,
    set_asset_character_linkage,
    get_asset_character_linkage,
)

from .npc_memory import (
    ConversationMemory,
    NPCEmotionalState,
    ConversationTopic,
    RelationshipMilestone,
    NPCWorldContext,
    PersonalityEvolutionEvent,
    DialogueAnalytics,
)

__all__ = [
    # Character models
    "Character",
    "CharacterRelationship",
    "CharacterUsage",
    # Character integrations
    "CharacterInstance",
    "CharacterNPCLink",
    "CharacterCapability",
    "SceneCharacterManifest",
    "CharacterDialogueProfile",
    # Character graph
    "get_character_graph",
    "find_characters_for_npc",
    "find_scenes_for_character",
    "find_assets_for_character",
    "get_character_usage_stats",
    # Character linkage
    "format_character_ref",
    "format_instance_ref",
    "parse_character_ref",
    "set_scene_role_binding",
    "get_scene_role_binding",
    "get_all_scene_roles",
    "set_asset_character_linkage",
    "get_asset_character_linkage",
    # NPC memory
    "ConversationMemory",
    "NPCEmotionalState",
    "ConversationTopic",
    "RelationshipMilestone",
    "NPCWorldContext",
    "PersonalityEvolutionEvent",
    "DialogueAnalytics",
]
