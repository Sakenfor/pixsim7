"""
DEPRECATED: Legacy assets services shim.

All asset services have been consolidated into services.asset.
This module re-exports from there for backward compatibility.

Migration:
    # Old (deprecated):
    from pixsim7.backend.main.services.assets.tags import tag_asset_from_metadata

    # New (preferred):
    from pixsim7.backend.main.services.asset.tags import tag_asset_from_metadata
"""
# Re-export from canonical location
from pixsim7.backend.main.services.asset.tags import (
    tag_asset_from_metadata,
    extract_ontology_ids_from_asset_tags,
)

__all__ = [
    "tag_asset_from_metadata",
    "extract_ontology_ids_from_asset_tags",
]
