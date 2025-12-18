"""
DEPRECATED: This module has been moved to pixsim7.backend.main.domain.ontology.

This is a backward compatibility shim. Please update your imports to:
    from pixsim7.backend.main.domain.ontology import ConceptRef, PoseConceptRef, ...
"""

# Re-export everything from the new location
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

__all__ = [
    "ConceptRef",
    "PoseConceptRef",
    "MoodConceptRef",
    "LocationConceptRef",
    "IntimacyLevelConceptRef",
    "ContentRatingConceptRef",
    "BranchIntentConceptRef",
    "concept_ref_field",
    "canonicalize_concept_id",
    "parse_concept_id",
    "strip_concept_prefix",
]
