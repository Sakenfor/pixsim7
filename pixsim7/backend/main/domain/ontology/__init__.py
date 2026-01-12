"""
Ontology domain package - ConceptRef types and backward compatibility shim.

MIGRATION NOTE:
The canonical source of truth for vocabularies is now:
    pixsim7.backend.main.shared.ontology.vocabularies

This package provides:
- ConceptRef type for type-safe concept references (canonical location)
- Backward compatibility re-exports from VocabularyRegistry

For new code, prefer importing directly from vocabularies:
    from pixsim7.backend.main.shared.ontology.vocabularies import (
        get_registry,
        VocabularyRegistry,
        PoseDef,
        MoodDef,
        ...
    )

Usage (still supported):
    from pixsim7.backend.main.domain.ontology import (
        ConceptRef,
        PoseConceptRef,
        MoodConceptRef,
    )
"""

# ConceptRef types - canonical location
from pixsim7.backend.main.domain.ontology.concept_ref import (
    ConceptRef,
    PoseConceptRef,
    MoodConceptRef,
    LocationConceptRef,
    IntimacyLevelConceptRef,
    ContentRatingConceptRef,
    BranchIntentConceptRef,
    RoleConceptRef,
    concept_ref_field,
    canonicalize_concept_id,
    parse_concept_id,
    strip_concept_prefix,
    normalize_concept_refs,
)

# Re-export from VocabularyRegistry with backward-compatible aliases
from pixsim7.backend.main.shared.ontology.vocabularies import (
    # Registry (aliased for backward compatibility)
    VocabularyRegistry as OntologyRegistry,
    get_registry as get_ontology_registry,
    reset_registry as reset_ontology_registry,
    # Data classes (aliased for backward compatibility)
    PoseDef as PoseDefinition,
    MoodDef as MoodDefinition,
    RatingDef as ContentRatingDef,
    LocationDef as LocationDefinition,
    ProgressionDef as IntimacyLevel,
    ProgressionDef as BranchIntentDef,
    # Scoring config
    ScoringConfig,
    ScoringWeights,
    PartialCredit,
    ChainConstraints,
    DurationConstraints,
    VocabPackInfo as OntologyPackInfo,
)

# Utilities - re-export from vocabularies
from pixsim7.backend.main.shared.ontology.vocabularies import (
    match_keywords,
)

# Legacy utility - kept for backward compatibility
def match_keywords_in_domain(text: str, domain: str = "default"):
    """
    DEPRECATED: Use match_keywords() from vocabularies instead.

    Match keywords in text to vocabulary IDs.
    The domain parameter is ignored (vocabularies don't use domains).
    """
    return match_keywords(text)


__all__ = [
    # Registry (backward compatibility)
    "OntologyRegistry",
    "get_ontology_registry",
    "reset_ontology_registry",
    # Data classes (backward compatibility)
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
    # ConceptRef (canonical)
    "ConceptRef",
    "PoseConceptRef",
    "MoodConceptRef",
    "LocationConceptRef",
    "IntimacyLevelConceptRef",
    "ContentRatingConceptRef",
    "BranchIntentConceptRef",
    "RoleConceptRef",
    "concept_ref_field",
    # ConceptRef utilities
    "canonicalize_concept_id",
    "parse_concept_id",
    "strip_concept_prefix",
    "normalize_concept_refs",
    # Utilities
    "match_keywords_in_domain",
    "match_keywords",
]
