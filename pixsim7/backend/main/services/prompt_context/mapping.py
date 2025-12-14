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
    - Multiple source types (template, runtime, config, etc.)

    Design:
    - Generic source names work for any entity type
    - source_paths dict allows flexible source naming
    - Backward compatible with instance_path/npc_path for NPCs

    Example (NPC - backward compatible):
        FieldMapping(
            target_path="traits.mood",
            source="instance",
            fallback="npc",
            instance_path="current_state.mood",
            npc_path="state.mood",
        )

    Example (Item - generic):
        FieldMapping(
            target_path="state.durability",
            source="runtime",
            fallback="template",
            source_paths={
                "template": "default_durability",
                "runtime": "state.durability"
            }
        )

    Example (Prop - generic with transform):
        FieldMapping(
            target_path="visual.assetId",
            source="template",
            fallback="none",
            source_paths={"template": "asset_id"},
            transform=lambda value, ctx: f"asset:{value}"
        )
    """

    # Target path in snapshot (dot notation, e.g., "name", "traits.openness", "state.mood")
    target_path: str

    # Source authority (generic names work for any entity)
    # Common values: "template", "runtime", "config", "instance", "npc", "both"
    source: str
    fallback: str = "none"  # Fallback if primary source unavailable

    # Generic source paths (dict allows any source names)
    # Example: {"template": "personality.mood", "runtime": "state.mood", "config": "defaults.mood"}
    source_paths: Optional[Dict[str, str]] = None

    # Backward compatibility: NPC-specific path fields
    # These are auto-added to source_paths if provided
    instance_path: Optional[str] = None  # Path in template/instance (backward compat)
    npc_path: Optional[str] = None       # Path in runtime NPC state (backward compat)

    # Stat engine integration
    stat_axis: Optional[str] = None      # If this field is a stat axis, name of axis
    stat_package_id: Optional[str] = None   # Stat package ID (e.g., "core.personality")

    # Transform hook for per-field reshaping
    # Signature: transform(value: Any, context: Dict[str, Any]) -> Any
    # Context varies by entity type but typically includes sources, state, flags
    transform: Optional[Callable[[Any, Dict[str, Any]], Any]] = field(default=None, repr=False)

    def __post_init__(self):
        """Initialize source_paths from legacy instance_path/npc_path if needed."""
        if self.source_paths is None:
            self.source_paths = {}

        # Backward compatibility: add instance_path and npc_path to source_paths
        if self.instance_path and "instance" not in self.source_paths:
            self.source_paths["instance"] = self.instance_path
        if self.npc_path and "npc" not in self.source_paths:
            self.source_paths["npc"] = self.npc_path

        # Ensure fallback "none" is normalized
        if self.fallback.lower() == "none":
            self.fallback = "none"


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
