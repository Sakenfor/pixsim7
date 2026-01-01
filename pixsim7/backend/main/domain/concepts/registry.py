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
    get_label_kinds,
    reset_providers,
    ConceptProvider,
    ConceptProviderError,
)

# Backward-compat aliases
get_concept_provider = get_provider
get_all_providers = lambda: list(get_registered_providers().values())


__all__ = [
    # Primary API
    "get_provider",
    "get_registered_providers",
    "get_all_kinds",
    "get_label_kinds",
    "reset_providers",
    "ConceptProvider",
    "ConceptProviderError",
    # Backward-compat
    "get_concept_provider",
    "get_all_providers",
]


# Ensure providers are always imported when registry is imported
# This triggers the @concept_provider decorators to register providers
def _ensure_providers_loaded() -> None:
    """Ensure all provider classes have been imported and registered."""
    # The import at the top of this module already triggers registration
    pass
