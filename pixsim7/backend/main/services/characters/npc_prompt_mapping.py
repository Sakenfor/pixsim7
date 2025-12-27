"""
NPC-specific prompt context field mapping configuration.

Declares which fields come from CharacterInstance vs GameNPC,
which fields map to stat axes, and fallback behavior.

This is one implementation example. The generic infrastructure lives in
services.prompt.context.mapping and can be reused for other entity types
(locations, props, buildings, etc.).
"""

from typing import Dict
from pixsim7.backend.main.services.prompt.context.mapping import FieldMapping


# NPC Prompt Context Mapping Configuration
NPC_FIELD_MAPPING: Dict[str, FieldMapping] = {
    # Name: Instance authoritative, fallback to NPC
    "name": FieldMapping(
        target_path="name",
        source="instance",
        fallback="npc",
        instance_path="name",
        npc_path="name",
    ),

    # Personality axes: Instance authoritative, normalize via StatEngine
    # Note: stat_axis presence triggers automatic normalization
    "personality.openness": FieldMapping(
        target_path="traits.openness",
        source="instance",
        fallback="npc",
        instance_path="personality_traits.openness",
        npc_path="personality.openness",
        stat_axis="openness",
        stat_package_id="core.personality",
    ),
    "personality.conscientiousness": FieldMapping(
        target_path="traits.conscientiousness",
        source="instance",
        fallback="npc",
        instance_path="personality_traits.conscientiousness",
        npc_path="personality.conscientiousness",
        stat_axis="conscientiousness",
        stat_package_id="core.personality",
    ),
    "personality.extraversion": FieldMapping(
        target_path="traits.extraversion",
        source="instance",
        fallback="npc",
        instance_path="personality_traits.extraversion",
        npc_path="personality.extraversion",
        stat_axis="extraversion",
        stat_package_id="core.personality",
    ),
    "personality.agreeableness": FieldMapping(
        target_path="traits.agreeableness",
        source="instance",
        fallback="npc",
        instance_path="personality_traits.agreeableness",
        npc_path="personality.agreeableness",
        stat_axis="agreeableness",
        stat_package_id="core.personality",
    ),
    "personality.neuroticism": FieldMapping(
        target_path="traits.neuroticism",
        source="instance",
        fallback="npc",
        instance_path="personality_traits.neuroticism",
        npc_path="personality.neuroticism",
        stat_axis="neuroticism",
        stat_package_id="core.personality",
    ),

    # Visual traits: Instance authoritative
    "visual_traits.scars": FieldMapping(
        target_path="traits.visual.scars",
        source="instance",
        fallback="none",
        instance_path="visual_overrides.scars",
        npc_path="personality.appearance.scars",
    ),
    "visual_traits.build": FieldMapping(
        target_path="traits.visual.build",
        source="instance",
        fallback="none",
        instance_path="visual_overrides.build",
        npc_path="personality.appearance.build",
    ),

    # State: NPC authoritative (runtime state)
    "state.mood": FieldMapping(
        target_path="state.mood",
        source="npc",
        fallback="instance",
        instance_path="current_state.mood",
        npc_path="state.mood",
    ),
    "state.health": FieldMapping(
        target_path="state.health",
        source="npc",
        fallback="instance",
        instance_path="current_state.health",
        npc_path="state.health",
    ),

    # Location: NPC authoritative (runtime)
    "location_id": FieldMapping(
        target_path="location_id",
        source="npc",
        fallback="none",
        npc_path="current_location_id",  # From NPCState
    ),

    # Spatial transform: NPC authoritative (runtime)
    # Contains position, orientation, scale within world/location
    "transform": FieldMapping(
        target_path="spatial.transform",
        source="npc",
        fallback="none",
        npc_path="transform",  # From NPCState.transform (JSON field)
    ),
}


def get_npc_field_mapping() -> Dict[str, FieldMapping]:
    """Get the NPC-specific field mapping configuration."""
    return NPC_FIELD_MAPPING
