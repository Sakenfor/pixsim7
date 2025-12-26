"""
Prompt Context Services

Context resolution and mapping for prompt generation.
"""

# Re-export from old location during migration
from pixsim7.backend.main.services.prompt_context.mapping import (
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
