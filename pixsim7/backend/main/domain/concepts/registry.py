"""
Concept provider registry.

This module re-exports registry functions from providers.py.
Providers self-register via the @concept_provider decorator when
the providers module is imported.

For backward compatibility, this module triggers provider registration
on import and re-exports the registry access functions.
"""

# Import providers module to trigger @concept_provider decorator registration
from . import providers as _providers  # noqa: F401

# Re-export registry access functions
from .providers import (
    get_registered_providers,
    get_provider,
    get_all_kinds,
    ConceptProvider,
)

# Backward-compat aliases
get_concept_provider = get_provider
get_all_providers = lambda: list(get_registered_providers().values())


def reset_providers() -> None:
    """Reset the provider registry. Useful for testing."""
    _providers._provider_registry.clear()


__all__ = [
    # Primary API
    "get_provider",
    "get_registered_providers",
    "get_all_kinds",
    "ConceptProvider",
    # Backward-compat
    "get_concept_provider",
    "get_all_providers",
    "reset_providers",
]
