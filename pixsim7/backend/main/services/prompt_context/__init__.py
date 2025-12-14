"""
Generic prompt context mapping infrastructure.

Provides entity-agnostic field mapping, transforms, and overlays
that can be reused across different entity types (NPCs, locations, props, etc.).
"""

from .mapping import (
    FieldMapping,
    merge_field_mappings,
    set_nested_value,
    get_nested_value,
)

__all__ = [
    "FieldMapping",
    "merge_field_mappings",
    "set_nested_value",
    "get_nested_value",
]
