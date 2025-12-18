"""
Provider schemas - shared types for provider plugins

BACKWARD COMPATIBILITY NOTICE:
This file now re-exports from domain/providers/schemas/ for backward compatibility.
New code should import from:
    from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind

The canonical location is now domain/providers/schemas/manifest.py.
"""

# Re-export from new canonical location
from pixsim7.backend.main.domain.providers.schemas.manifest import (
    ProviderManifest,
    ProviderKind,
)

__all__ = ["ProviderManifest", "ProviderKind"]
