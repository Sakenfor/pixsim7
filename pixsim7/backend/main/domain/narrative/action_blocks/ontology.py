"""
OntologyService - Single source of truth for action block vocabulary.

This module provides the vocabulary registry for action block selection.
All vocabulary functionality is centralized in:
    pixsim7.backend.main.shared.ontology.vocabularies

The VocabularyRegistry provides:
- Vocabulary loading from YAML files (poses, moods, locations, ratings, etc.)
- Plugin vocabulary discovery and merging
- Scoring configuration (weights, partial credit, chain/duration constraints)
- Query helpers for poses, moods, locations, intimacy levels, ratings, etc.

Usage:
    from pixsim7.backend.main.domain.narrative.action_blocks.ontology import (
        get_ontology,
        OntologyService,
    )

    ontology = get_ontology()
    pose = ontology.get_pose("pose:standing_neutral")
    chain_cfg = ontology.chain_constraints
"""

# Re-export from the unified vocabulary system
from pixsim7.backend.main.shared.ontology.vocabularies import (
    # Main class (aliased for backward compatibility)
    VocabularyRegistry as OntologyService,
    VocabularyRegistry,
    # Data classes
    PoseDef as PoseDefinition,
    PoseDef,
    MoodDef as MoodDefinition,
    MoodDef,
    RatingDef as ContentRatingDef,
    RatingDef,
    LocationDef as LocationDefinition,
    LocationDef,
    ProgressionDef as IntimacyLevel,  # Intimacy levels are stored in progression
    ProgressionDef as BranchIntentDef,
    ProgressionDef,
    # Scoring config
    ScoringConfig,
    ScoringWeights,
    PartialCredit,
    ChainConstraints,
    DurationConstraints,
    VocabPackInfo as OntologyPackInfo,
    VocabPackInfo,
    # Singleton access (aliased for backward compatibility)
    get_registry as get_ontology,
    reset_registry as reset_ontology,
    # Also export under original names
    get_registry,
    reset_registry,
)

__all__ = [
    # Main class (both names for compatibility)
    "OntologyService",
    "VocabularyRegistry",
    # Data classes (both old and new names)
    "PoseDefinition",
    "PoseDef",
    "MoodDefinition",
    "MoodDef",
    "ContentRatingDef",
    "RatingDef",
    "LocationDefinition",
    "LocationDef",
    "IntimacyLevel",
    "BranchIntentDef",
    "ProgressionDef",
    # Scoring config
    "ScoringConfig",
    "ScoringWeights",
    "PartialCredit",
    "ChainConstraints",
    "DurationConstraints",
    "OntologyPackInfo",
    "VocabPackInfo",
    # Singleton access (all names)
    "get_ontology",
    "reset_ontology",
    "get_registry",
    "reset_registry",
]
