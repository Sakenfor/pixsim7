"""
DEPRECATED: Legacy tags module shim.

Moved to pixsim7.backend.main.services.asset.tags.
This module re-exports from there for backward compatibility.
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
