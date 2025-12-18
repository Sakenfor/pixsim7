"""
Action Blocks for Visual Generation

This module provides the action block selection system for generating short 5-8
second video clips from reference images. It works alongside the narrative engine
to create visual content that matches the emotional and relational context.

Architecture:
- OntologyService: Single source of truth for poses, intimacy levels, ratings, etc.
- BlockRegistry: Pure storage for action blocks
- BlockSelector: Orchestrates selection with filters and scorers
- Filters: Pluggable hard requirement checks
- Scorers: Pluggable soft preference scoring with ontology-driven weights

Usage:
    from pixsim7.backend.main.domain.narrative.action_blocks import (
        ActionEngine,
        ActionBlock,
        ActionSelectionContext,
        BlockRegistry,
        BlockSelector,
    )

    # Using ActionEngine (high-level API)
    engine = ActionEngine()
    result = await engine.select_actions(context, db_session)

    # Using BlockSelector directly (low-level API)
    registry = BlockRegistry()
    registry.load_from_directory(Path("blocks/"))
    selector = BlockSelector(registry)
    blocks = selector.select_chain(context)
"""

# Engine (main entry point)
from .engine import ActionEngine

# Ontology service
from .ontology import (
    OntologyService,
    get_ontology,
    PoseDefinition,
    IntimacyLevel,
    ContentRatingDef,
    MoodDefinition,
    BranchIntentDef,
    LocationDefinition,
)

# Unified types
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
    ChainCompatibilityFilter,
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
    # Engine
    "ActionEngine",
    # Ontology
    "OntologyService",
    "get_ontology",
    "PoseDefinition",
    "IntimacyLevel",
    "ContentRatingDef",
    "MoodDefinition",
    "BranchIntentDef",
    "LocationDefinition",
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
    "ChainCompatibilityFilter",
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
