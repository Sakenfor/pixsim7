"""
DEPRECATED: Legacy asset_branching module shim.

Moved to pixsim7.backend.main.domain.assets.branching.
This module re-exports from there for backward compatibility.
"""
from pixsim7.backend.main.domain.assets.branching import (
    AssetBranch,
    AssetBranchVariant,
    AssetClip,
)

__all__ = ["AssetBranch", "AssetBranchVariant", "AssetClip"]
