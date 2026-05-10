"""
Prompt Domain

Consolidated prompt versioning domain.

Models:
- PromptFamily: Groups related prompt versions (concept/scene grouping)
- PromptVersion: Individual immutable prompt snapshot (Git commit analog)
- BlockTemplate: Reusable template for composing prompts from block selections
- PromptVersionBlock: Junction table for version→block composition
- PromptVariantFeedback: User feedback on prompt variants

Enums:
- PromptSegmentRole: baseline role IDs (dynamic roles are registered at runtime)
- BlockKind: single_state, transition
- ComplexityLevel: simple, moderate, complex, very_complex
- PromptSourceType: versioned, inline, generated, unknown
"""

# Enums
from .enums import (
    PromptSegmentRole,
    BlockKind,
    ComplexityLevel,
    PromptSourceType,
    BlockIntent,
)

# Core models
from .models import (
    PromptFamily,
    PromptVersion,
    BlockTemplate,
)
from .packs import PromptPackDraft, PromptPackPublication, PromptPackVersion
from .tools import PromptToolPreset

# Relations
from .relations import PromptVersionBlock

# Feedback
from .feedback import PromptVariantFeedback


__all__ = [
    # Enums
    "PromptSegmentRole",
    "BlockKind",
    "ComplexityLevel",
    "PromptSourceType",
    "BlockIntent",
    # Core models
    "PromptFamily",
    "PromptVersion",
    "BlockTemplate",
    "PromptPackDraft",
    "PromptPackPublication",
    "PromptPackVersion",
    "PromptToolPreset",
    # Relations
    "PromptVersionBlock",
    # Feedback
    "PromptVariantFeedback",
]
