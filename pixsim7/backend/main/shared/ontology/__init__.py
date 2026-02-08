"""
Ontology package exports.

Canonical ontology authority lives in:
    pixsim7.backend.main.shared.ontology.vocabularies
"""
from pixsim7.backend.main.shared.ontology.vocabularies import (
    VocabularyRegistry,
    get_registry,
    match_keywords,
    reset_registry,
)

__all__ = [
    "VocabularyRegistry",
    "get_registry",
    "match_keywords",
    "reset_registry",
]
