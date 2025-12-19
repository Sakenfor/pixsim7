"""
DEPRECATED: Legacy asset_lineage module shim.

Moved to pixsim7.backend.main.domain.assets.lineage.
This module re-exports from there for backward compatibility.
"""
from pixsim7.backend.main.domain.assets.lineage import AssetLineage

__all__ = ["AssetLineage"]
