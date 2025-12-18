"""
Provider Registry

Plugin discovery, loading, and runtime registry for providers.

This module owns the lifecycle of provider plugins:
- Discovery: Scanning for manifest.py files in the providers directory
- Loading: Importing manifests and provider instances
- Registration: Adding providers to the appropriate registry (video/LLM)
- Runtime access: Getting provider instances by ID
"""

from .provider_registry import (
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
