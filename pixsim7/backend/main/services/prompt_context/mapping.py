"""
Generic field mapping infrastructure for prompt context resolution.

Provides entity-agnostic mapping, transforms, and overlays that can be
reused across different entity types (NPCs, locations, props, buildings, etc.).
"""

from typing import Dict, Any, Optional, Literal, Callable
from dataclasses import dataclass, field


@dataclass
class FieldMapping:
    """Entity-agnostic field mapping for prompt context resolution.

    Supports:
    - Declarative source/fallback authority
    - Target path specification (dot notation)
    - Optional per-field transforms
    - Stat engine integration
    - Plugin/link overlays

    Example:
        FieldMapping(
            target_path="traits.mood",
            source="instance",
            fallback="npc",
            instance_path="current_state.mood",
            npc_path="state.mood",
            transform=lambda value, ctx: value.upper()
        )
    """

    # Target path in snapshot (dot notation, e.g., "name", "traits.openness", "state.mood")
    target_path: str

    # Source authority
    source: Literal["instance", "npc", "both"]  # Which entity owns this field
    fallback: Literal["instance", "npc", "none"]  # Fallback if primary source unavailable

    # Paths (dot notation)
    instance_path: Optional[str] = None  # Path in source entity (e.g., "personality_traits.openness")
    npc_path: Optional[str] = None       # Path in runtime entity (e.g., "personality.openness")

    # Stat engine integration
    stat_axis: Optional[str] = None      # If this field is a stat axis, name of axis
    stat_package_id: Optional[str] = None   # Stat package ID (e.g., "core.personality")

    # Transform hook for per-field reshaping
    # Signature: transform(value: Any, context: Dict[str, Any]) -> Any
    # Context varies by entity type but typically includes: instance, runtime entity, state, flags
    transform: Optional[Callable[[Any, Dict[str, Any]], Any]] = field(default=None, repr=False)


def merge_field_mappings(
    base: Dict[str, FieldMapping],
    overlay: Optional[Dict[str, FieldMapping]] = None
) -> Dict[str, FieldMapping]:
    """
    Merge overlay mappings with base mappings.

    Overlay mappings take precedence over base mappings.
    This allows plugins or links to extend/override target paths
    without editing the base configuration.

    Args:
        base: Base field mapping configuration
        overlay: Optional overlay mappings (from plugins, links, etc.)

    Returns:
        Merged field mapping dictionary

    Example:
        base_map = get_npc_field_mapping()
        plugin_map = {"custom_field": FieldMapping(...)}
        merged = merge_field_mappings(base_map, plugin_map)
    """
    if not overlay:
        return dict(base)

    merged = dict(base)
    merged.update(overlay)
    return merged


def set_nested_value(data: Dict[str, Any], path: str, value: Any) -> None:
    """
    Set value in nested dict using dot notation.

    Creates intermediate dicts as needed.

    Args:
        data: Target dictionary
        path: Dot-notation path (e.g., "traits.visual.scars")
        value: Value to set

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

    Args:
        data: Source dictionary
        path: Dot-notation path (e.g., "traits.visual.scars")

    Returns:
        Value at path, or None if not found

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
