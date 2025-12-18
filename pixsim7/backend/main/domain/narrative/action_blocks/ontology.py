"""
OntologyService - Single source of truth for action block vocabulary.

This module re-exports from the central OntologyRegistry for backward compatibility.
All ontology functionality is now centralized in:
    pixsim7.backend.main.shared.ontology_registry

The OntologyRegistry provides:
- Core ontology loading from ontology.yaml
- Plugin pack discovery and merging
- Validation with strict/non-strict modes
- Query helpers for poses, moods, locations, intimacy levels, ratings, etc.

Migration note:
- OntologyService is now an alias for OntologyRegistry
- get_ontology() is now an alias for get_ontology_registry()
- All existing code continues to work unchanged
"""

# Re-export everything from the central registry
from pixsim7.backend.main.shared.ontology_registry import (
    # Main class (aliased for backward compatibility)
    OntologyRegistry as OntologyService,
    OntologyRegistry,
    # Data classes
    PoseDefinition,
    IntimacyLevel,
    ContentRatingDef,
    MoodDefinition,
    BranchIntentDef,
    LocationDefinition,
    ScoringConfig,
    ScoringWeights,
    PartialCredit,
    ChainConstraints,
    DurationConstraints,
    OntologyPackInfo,
    # Singleton access (aliased for backward compatibility)
    get_ontology_registry as get_ontology,
    reset_ontology_registry as reset_ontology,
    # Also export under original names
    get_ontology_registry,
    reset_ontology_registry,
)

__all__ = [
    # Main class (both names for compatibility)
    "OntologyService",
    "OntologyRegistry",
    # Data classes
    "PoseDefinition",
    "IntimacyLevel",
    "ContentRatingDef",
    "MoodDefinition",
    "BranchIntentDef",
    "LocationDefinition",
    "ScoringConfig",
    "ScoringWeights",
    "PartialCredit",
    "ChainConstraints",
    "DurationConstraints",
    "OntologyPackInfo",
    # Singleton access (all names)
    "get_ontology",
    "reset_ontology",
    "get_ontology_registry",
    "reset_ontology_registry",
]
