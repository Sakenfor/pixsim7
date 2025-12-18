"""
Ontology domain package - Single source of truth for ontology concepts.

This package provides:
- Ontology registry with plugin pack support
- ConceptRef type for type-safe concept references
- Data classes for all concept types (Pose, Mood, Location, etc.)
- Utility functions for keyword matching and lookups

Usage:
    from pixsim7.backend.main.domain.ontology import (
        get_ontology_registry,
        ConceptRef,
        PoseConceptRef,
        MoodConceptRef,
        PoseDefinition,
        MoodDefinition,
    )

    # Get the registry
    registry = get_ontology_registry()

    # Check if a concept exists
    if registry.is_known_concept("pose", "standing_neutral"):
        pose = registry.get_pose("standing_neutral")

    # Use ConceptRef in data models
    concept = ConceptRef(kind="pose", id="standing_neutral")
"""

# Registry and singleton
from pixsim7.backend.main.domain.ontology.registry import (
    OntologyRegistry,
    get_ontology_registry,
    reset_ontology_registry,
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
)

# ConceptRef types
from pixsim7.backend.main.domain.ontology.concept_ref import (
    ConceptRef,
    PoseConceptRef,
    MoodConceptRef,
    LocationConceptRef,
    IntimacyLevelConceptRef,
    ContentRatingConceptRef,
    BranchIntentConceptRef,
    concept_ref_field,
    canonicalize_concept_id,
    parse_concept_id,
    strip_concept_prefix,
)

# Utilities
from pixsim7.backend.main.domain.ontology.utils import (
    match_keywords_in_domain,
)


__all__ = [
    # Registry
    "OntologyRegistry",
    "get_ontology_registry",
    "reset_ontology_registry",
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
    # ConceptRef
    "ConceptRef",
    "PoseConceptRef",
    "MoodConceptRef",
    "LocationConceptRef",
    "IntimacyLevelConceptRef",
    "ContentRatingConceptRef",
    "BranchIntentConceptRef",
    "concept_ref_field",
    # ConceptRef utilities
    "canonicalize_concept_id",
    "parse_concept_id",
    "strip_concept_prefix",
    # Utilities
    "match_keywords_in_domain",
]
