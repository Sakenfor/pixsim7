"""
Unified concepts domain.

Provides a single interface for accessing all concept kinds.
Providers self-register via the @concept_provider decorator.

To add a new concept kind:
1. Create a new provider class in providers.py with @concept_provider decorator
2. Done - no other files need to be modified

Usage:
    from pixsim7.backend.main.domain.concepts import get_provider, get_all_kinds

    # Get a specific provider
    provider = get_provider("role")
    concepts = provider.get_concepts()

    # List all available kinds
    kinds = get_all_kinds()  # ['role', 'part', 'pose', 'influence_region']
"""
from .registry import (
    get_provider,
    get_registered_providers,
    get_all_kinds,
    get_concept_provider,  # backward-compat alias
    get_all_providers,  # backward-compat
    reset_providers,
    ConceptProvider,
)
from .providers import concept_provider

__all__ = [
    # Primary API
    "get_provider",
    "get_registered_providers",
    "get_all_kinds",
    "ConceptProvider",
    "concept_provider",
    # Backward-compat
    "get_concept_provider",
    "get_all_providers",
    "reset_providers",
]
