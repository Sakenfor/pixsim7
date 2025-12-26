"""
Prompt Domain

Consolidated prompt versioning and reusable blocks domain.

Models:
- PromptFamily: Groups related prompt versions (concept/scene grouping)
- PromptVersion: Individual immutable prompt snapshot (Git commit analog)
- PromptBlock: Reusable prompt component (extracted or curated)
- PromptVersionBlock: Junction table for version→block composition
- PromptVariantFeedback: User feedback on prompt variants

Enums:
- PromptSegmentRole: character, action, setting, mood, romance, other
- BlockSourceType: library, parsed, ai_extracted, user_created, etc.
- CurationStatus: raw, reviewed, curated
- BlockKind: single_state, transition
- ComplexityLevel: simple, moderate, complex, very_complex
- PromptSourceType: versioned, inline, generated, unknown
"""

# Enums
from .enums import (
    PromptSegmentRole,
    BlockSourceType,
    CurationStatus,
    BlockKind,
    ComplexityLevel,
    PromptSourceType,
)

# Core models
from .models import (
    PromptFamily,
    PromptVersion,
    PromptBlock,
)

# Relations
from .relations import PromptVersionBlock

# Feedback
from .feedback import PromptVariantFeedback


__all__ = [
    # Enums
    "PromptSegmentRole",
    "BlockSourceType",
    "CurationStatus",
    "BlockKind",
    "ComplexityLevel",
    "PromptSourceType",
    # Core models
    "PromptFamily",
    "PromptVersion",
    "PromptBlock",
    # Relations
    "PromptVersionBlock",
    # Feedback
    "PromptVariantFeedback",
]
