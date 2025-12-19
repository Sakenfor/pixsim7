"""
DEPRECATED: Legacy asset module shim.

Moved to pixsim7.backend.main.domain.assets.models.
This module re-exports from there for backward compatibility.

Migration:
    # Old (deprecated):
    from pixsim7.backend.main.domain.asset import Asset

    # New (preferred):
    from pixsim7.backend.main.domain.assets import Asset
"""
# Re-export from canonical location
from pixsim7.backend.main.domain.assets.models import Asset, AssetVariant

__all__ = ["Asset", "AssetVariant"]
