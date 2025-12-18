"""
DEPRECATED: This module has been moved to pixsim7.backend.main.domain.ontology.

This is a backward compatibility shim. Please update your imports to:
    from pixsim7.backend.main.domain.ontology import get_ontology_registry, OntologyRegistry, ...
"""

# Re-export everything from the new location
from pixsim7.backend.main.domain.ontology.registry import (
    OntologyRegistry,
    get_ontology_registry,
    reset_ontology_registry,
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
)

__all__ = [
    "OntologyRegistry",
    "get_ontology_registry",
    "reset_ontology_registry",
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
]
