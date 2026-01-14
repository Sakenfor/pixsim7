"""
Ontology utility functions.

Helper functions for keyword matching and ID canonicalization.
Delegates to VocabularyRegistry for actual vocabulary lookups.
"""
from typing import List

from pixsim7.backend.main.shared.ontology.vocabularies import get_registry, match_keywords


__all__ = [
    "match_keywords",
]
