"""
Prompt domain enums

Centralized enums for the prompt domain. All enums use str mixin
for JSON serialization compatibility.
"""
from enum import Enum


class PromptSegmentRole(str, Enum):
    """Coarse role classification for prompt segments/blocks.

    Used by both the parser (PromptSegment) and storage (PromptBlock).
    """
    CHARACTER = "character"
    ACTION = "action"
    SETTING = "setting"
    MOOD = "mood"
    ROMANCE = "romance"
    OTHER = "other"


class BlockSourceType(str, Enum):
    """How a PromptBlock was created."""
    LIBRARY = "library"           # From curated block library
    PARSED = "parsed"             # Auto-extracted by parser
    AI_EXTRACTED = "ai_extracted" # Extracted by LLM
    USER_CREATED = "user_created" # Manually created by user
    MIGRATED = "migrated"         # Imported from legacy system
    IMPORTED = "imported"         # Imported from external source


class CurationStatus(str, Enum):
    """Block lifecycle/curation status."""
    RAW = "raw"           # Just extracted, unreviewed
    REVIEWED = "reviewed" # Human reviewed but not finalized
    CURATED = "curated"   # Production-ready


class BlockKind(str, Enum):
    """Type of block for generation."""
    SINGLE_STATE = "single_state"  # Static pose/scene
    TRANSITION = "transition"       # Movement between states


class ComplexityLevel(str, Enum):
    """Block complexity based on character count."""
    SIMPLE = "simple"           # 200-300 chars
    MODERATE = "moderate"       # 300-600 chars
    COMPLEX = "complex"         # 600-1000 chars
    VERY_COMPLEX = "very_complex"  # 1000+ chars


class PromptSourceType(str, Enum):
    """How a prompt was provided to a generation."""
    VERSIONED = "versioned"   # From PromptVersion
    INLINE = "inline"         # Direct inline text (deprecated)
    GENERATED = "generated"   # AI-generated
    UNKNOWN = "unknown"       # Legacy/unknown source
