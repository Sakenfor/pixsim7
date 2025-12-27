"""
Prompt Utilities

Diff, similarity, and template utilities for prompts.
"""

from .diff import (
    generate_unified_diff,
    DiffFormat,
)
from .similarity import (
    calculate_text_similarity,
)
from .template import (
    render_template,
    extract_template_variables,
)

__all__ = [
    "generate_unified_diff",
    "DiffFormat",
    "calculate_text_similarity",
    "render_template",
    "extract_template_variables",
]
