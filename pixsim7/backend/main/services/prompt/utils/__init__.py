"""
Prompt Utilities

Diff, similarity, and template utilities for prompts.
"""

# Re-export from old location during migration
from pixsim7.backend.main.services.prompts.diff_utils import (
    generate_unified_diff,
    DiffFormat,
)
from pixsim7.backend.main.services.prompts.similarity_utils import (
    calculate_text_similarity,
)
from pixsim7.backend.main.services.prompts.template_utils import (
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
