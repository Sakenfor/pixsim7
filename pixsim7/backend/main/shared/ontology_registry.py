"""
DEPRECATED: This module has been moved to pixsim7.backend.main.shared.ontology.vocabularies.

This is a backward compatibility shim. Please update your imports to:
    from pixsim7.backend.main.shared.ontology.vocabularies import get_registry, VocabularyRegistry, ...

Or for ConceptRef types:
    from pixsim7.backend.main.domain.ontology import ConceptRef, PoseConceptRef, ...
"""

# Re-export from vocabularies with backward-compatible aliases
from pixsim7.backend.main.shared.ontology.vocabularies import (
    VocabularyRegistry as OntologyRegistry,
    get_registry as get_ontology_registry,
    reset_registry as reset_ontology_registry,
    PoseDef as PoseDefinition,
    MoodDef as MoodDefinition,
    RatingDef as ContentRatingDef,
    LocationDef as LocationDefinition,
    ProgressionDef as IntimacyLevel,
    ProgressionDef as BranchIntentDef,
    ScoringConfig,
    ScoringWeights,
    PartialCredit,
    ChainConstraints,
    DurationConstraints,
    VocabPackInfo as OntologyPackInfo,
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
