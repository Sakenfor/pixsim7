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
from .resolver import (
    EnricherFn,
    PromptContextRequest,
    PromptContextService,
    PromptContextSnapshot,
)

__all__ = [
    # Mapping
    "FieldMapping",
    "merge_field_mappings",
    "set_nested_value",
    "get_nested_value",
    # Resolver
    "EnricherFn",
    "PromptContextRequest",
    "PromptContextService",
    "PromptContextSnapshot",
]
