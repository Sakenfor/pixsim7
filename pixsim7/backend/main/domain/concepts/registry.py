"""
Concept provider registry.

Maintains a registry of concept providers that can be queried by kind.
Providers are automatically registered on module import.
"""
from typing import Dict, List, Optional

from .providers import (
    ConceptProvider,
    RoleConceptProvider,
    PartConceptProvider,
    BodyRegionConceptProvider,
    PoseConceptProvider,
    InfluenceRegionConceptProvider,
)

# Global provider registry
_providers: Dict[str, ConceptProvider] = {}
_initialized: bool = False


def register_concept_provider(provider: ConceptProvider) -> None:
    """Register a concept provider.

    Args:
        provider: Provider instance to register.
                 Will be keyed by provider.kind.
    """
    _providers[provider.kind] = provider


def get_concept_provider(kind: str) -> Optional[ConceptProvider]:
    """Get a provider by concept kind.

    Args:
        kind: Concept kind (e.g., 'role', 'part', 'pose')

    Returns:
        Provider instance or None if not found.
    """
    _ensure_initialized()
    return _providers.get(kind)


def get_all_kinds() -> List[str]:
    """Get all registered concept kinds."""
    _ensure_initialized()
    return list(_providers.keys())


def get_all_providers() -> List[ConceptProvider]:
    """Get all registered providers."""
    _ensure_initialized()
    return list(_providers.values())


def _init_default_providers() -> None:
    """Initialize and register the default providers.

    Called automatically on first access.
    """
    global _initialized

    if _initialized:
        return

    # Register default providers
    register_concept_provider(RoleConceptProvider())
    register_concept_provider(PartConceptProvider())
    register_concept_provider(BodyRegionConceptProvider())
    register_concept_provider(PoseConceptProvider())
    register_concept_provider(InfluenceRegionConceptProvider())

    _initialized = True


def _ensure_initialized() -> None:
    """Ensure providers are initialized."""
    if not _initialized:
        _init_default_providers()


def reset_providers() -> None:
    """Reset the provider registry. Useful for testing."""
    global _providers, _initialized
    _providers = {}
    _initialized = False


__all__ = [
    "register_concept_provider",
    "get_concept_provider",
    "get_all_kinds",
    "get_all_providers",
    "reset_providers",
]
