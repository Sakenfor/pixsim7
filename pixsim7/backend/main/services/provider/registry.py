"""
Provider registry - manages available providers

BACKWARD COMPATIBILITY NOTICE:
This file now re-exports from domain/providers/registry/ for backward compatibility.
New code should import from:
    from pixsim7.backend.main.domain.providers.registry import registry, register_default_providers

The canonical location is now domain/providers/registry/provider_registry.py.
"""

# Re-export from new canonical location
from pixsim7.backend.main.domain.providers.registry import (
    ProviderRegistry,
    registry,
    discover_providers,
    load_provider_plugin,
    register_providers_from_plugins,
    register_default_providers,
)

__all__ = [
    "ProviderRegistry",
    "registry",
    "discover_providers",
    "load_provider_plugin",
    "register_providers_from_plugins",
    "register_default_providers",
]
