"""
Action Blocks for Visual Generation

This module provides the action prompt engine for generating short 5-8 second
video clips from reference images. It works alongside the narrative engine
to create visual content that matches the emotional and relational context.

Architecture (v2):
- BlockRegistry: Pure storage for action blocks
- BlockSelector: Orchestrates selection with filters and scorers
- Filters: Pluggable hard requirement checks
- Scorers: Pluggable soft preference scoring

The unified ActionBlock type (from types_unified) combines v1 and v2 features
with optional fields, eliminating hasattr() checks.
"""

# Legacy imports (v1 types) - for backward compatibility
from .types import (
    ActionBlock as LegacyActionBlock,
    SingleStateBlock as LegacySingleStateBlock,
    TransitionBlock as LegacyTransitionBlock,
    ActionBlockTags as LegacyActionBlockTags,
    ReferenceImage as LegacyReferenceImage,
    TransitionEndpoint as LegacyTransitionEndpoint,
    BranchIntent as LegacyBranchIntent,
    ActionSelectionContext as LegacyActionSelectionContext,
)
from .engine import ActionEngine
from .pose_taxonomy import PoseTaxonomy, POSE_TAXONOMY

# New unified types (v2)
from .types_unified import (
    # Enums
    BranchIntent,
    CameraMovementType,
    CameraSpeed,
    CameraPath,
    ContentRating,
    IntensityPattern,
    # Component schemas
    ReferenceImage,
    TransitionEndpoint,
    CameraMovement,
    ConsistencyFlags,
    IntensityProgression,
    ActionBlockTags,
    # Main types
    ActionBlock,
    ActionSelectionContext,
    ActionSelectionResult,
    # Backward compatibility aliases
    SingleStateBlock,
    TransitionBlock,
    EnhancedSingleStateBlock,
    EnhancedTransitionBlock,
)

# Registry
from .registry import BlockRegistry

# Filters
from .filters import (
    BlockFilter,
    WorldFilter,
    ContentRatingFilter,
    RequiredTagsFilter,
    ExcludeTagsFilter,
    LocationFilter,
    BranchIntentFilter,
    IntimacyLevelFilter,
    CompositeFilter,
    create_default_filters,
)

# Scorers
from .scorers import (
    ScoringConfig,
    BlockScorer,
    LocationScorer,
    PoseScorer,
    IntimacyScorer,
    MoodScorer,
    BranchIntentScorer,
    ChainCompatibilityScorer,
    CompositeScorer,
    create_default_scorers,
)

# Selector
from .selector import (
    BlockSelector,
    create_selector,
)

__all__ = [
    # Legacy engine (still works)
    "ActionEngine",
    "PoseTaxonomy",
    "POSE_TAXONOMY",
    # Enums
    "BranchIntent",
    "CameraMovementType",
    "CameraSpeed",
    "CameraPath",
    "ContentRating",
    "IntensityPattern",
    # Component schemas
    "ReferenceImage",
    "TransitionEndpoint",
    "CameraMovement",
    "ConsistencyFlags",
    "IntensityProgression",
    "ActionBlockTags",
    # Main types
    "ActionBlock",
    "ActionSelectionContext",
    "ActionSelectionResult",
    # Backward compat type aliases
    "SingleStateBlock",
    "TransitionBlock",
    "EnhancedSingleStateBlock",
    "EnhancedTransitionBlock",
    # Registry
    "BlockRegistry",
    # Filters
    "BlockFilter",
    "WorldFilter",
    "ContentRatingFilter",
    "RequiredTagsFilter",
    "ExcludeTagsFilter",
    "LocationFilter",
    "BranchIntentFilter",
    "IntimacyLevelFilter",
    "CompositeFilter",
    "create_default_filters",
    # Scorers
    "ScoringConfig",
    "BlockScorer",
    "LocationScorer",
    "PoseScorer",
    "IntimacyScorer",
    "MoodScorer",
    "BranchIntentScorer",
    "ChainCompatibilityScorer",
    "CompositeScorer",
    "create_default_scorers",
    # Selector
    "BlockSelector",
    "create_selector",
]