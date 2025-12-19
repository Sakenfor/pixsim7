"""
DEPRECATED: Legacy asset_metadata module shim.

Moved to pixsim7.backend.main.domain.assets.metadata.
This module re-exports from there for backward compatibility.
"""
from pixsim7.backend.main.domain.assets.metadata import (
    Asset3DMetadata,
    AssetAudioMetadata,
    AssetTemporalSegment,
    AssetAdultMetadata,
)

__all__ = [
    "Asset3DMetadata",
    "AssetAudioMetadata",
    "AssetTemporalSegment",
    "AssetAdultMetadata",
]
