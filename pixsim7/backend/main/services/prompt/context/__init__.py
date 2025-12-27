"""
Prompt Context Services

Context resolution and mapping for prompt generation.
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
