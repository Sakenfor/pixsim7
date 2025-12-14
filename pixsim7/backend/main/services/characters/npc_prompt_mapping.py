"""
NPC prompt context field mapping configuration.

Declares which fields come from CharacterInstance vs GameNPC,
which fields map to stat axes, and fallback behavior.
"""

from typing import Dict, Any, Optional, Literal
from dataclasses import dataclass


@dataclass
class FieldMapping:
    """Mapping for a single field in prompt context (entity-agnostic)."""

    # Target path in snapshot (dot notation, e.g., "name", "traits.openness", "state.mood")
    target_path: str

    # Source authority
    source: Literal["instance", "npc", "both"]  # Which entity owns this field
    fallback: Literal["instance", "npc", "none"]  # Fallback if primary source unavailable

    # Paths (dot notation)
    instance_path: Optional[str] = None  # Path in CharacterInstance (e.g., "personality_traits.openness")
    npc_path: Optional[str] = None       # Path in GameNPC (e.g., "personality.openness")

    # Stat engine integration
    stat_axis: Optional[str] = None      # If this field is a stat axis, name of axis
    stat_package_id: Optional[str] = None   # Stat package ID (e.g., "core.personality") - resolved via registry

    # Note: normalize flag is optional - if stat_axis is present, normalization happens automatically


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
}


def get_npc_field_mapping() -> Dict[str, FieldMapping]:
    """Get the NPC field mapping configuration."""
    return NPC_FIELD_MAPPING


def set_nested_value(data: Dict[str, Any], path: str, value: Any) -> None:
    """
    Set value in nested dict using dot notation.

    Creates intermediate dicts as needed.

    Example:
        data = {}
        set_nested_value(data, "traits.visual.scars", ["scar1"])
        # Result: {"traits": {"visual": {"scars": ["scar1"]}}}
    """
    keys = path.split(".")
    target = data

    # Navigate/create path to target
    for key in keys[:-1]:
        if key not in target:
            target[key] = {}
        target = target[key]

    # Set the final value
    target[keys[-1]] = value


def get_nested_value(data: Dict, path: str) -> Any:
    """
    Get value from nested dict using dot notation.

    Example:
        data = {"traits": {"visual": {"scars": ["scar1"]}}}
        get_nested_value(data, "traits.visual.scars")
        # Result: ["scar1"]
    """
    keys = path.split(".")
    value = data
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
        if value is None:
            return None
    return value
