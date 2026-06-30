"""
Asset Services

Split into focused services for better maintainability and AI agent navigation.

Services:
- AssetCoreService: CRUD, search, listing, deletion
- AssetSyncService: Download management, sync, provider operations
- AssetEnrichmentService: Recognition, embedded extraction, paused frames
- AssetQuotaService: User quotas, storage tracking, deduplication
- AssetBranchingService: Asset versioning and branching
- AssetLineageService: Asset lineage tracking
- AssetIngestionService: Media ingestion pipeline (download, store, derivatives)
- tags: Asset tagging from ontology-aligned metadata
- dedup: Centralized deduplication helpers for consistent asset matching
"""
from typing import TYPE_CHECKING

# Lazy re-export (PEP 562). Eagerly importing these submodules makes the asset
# package __init__ heavy: ``.ingestion`` (and ``media.settings``) cross-import
# ``media.settings`` ↔ ``asset``, and ``media.settings`` itself only needs the
# leaf ``asset.signal_scoring_params``. Because importing ANY asset submodule
# runs this __init__, an eager __init__ turns ``import asset.signal_scoring_params``
# (documented as import-cheap) into a circular import at startup. Deferring these
# binds them on first attribute access instead, keeping leaf imports cheap.
if TYPE_CHECKING:
    from ._filters import AssetSearchFilters
    from .core import AssetCoreService
    from .sync import AssetSyncService
    from .enrichment import AssetEnrichmentService
    from .quota import AssetQuotaService
    from .branching import AssetBranchingService
    from .lineage import AssetLineageService
    from .ingestion import AssetIngestionService
    from pixsim7.backend.main.services.media.settings import get_media_settings
    from .tags import tag_asset_from_metadata
    from .dedup import (
        find_existing_asset,
        find_existing_by_candidate_ids,
        find_existing_by_url,
        find_existing_assets_batch,
    )
    from .service import AssetService

# name -> (submodule, attribute) for lazy resolution.
_LAZY_EXPORTS = {
    "AssetSearchFilters": ("._filters", "AssetSearchFilters"),
    "AssetCoreService": (".core", "AssetCoreService"),
    "AssetSyncService": (".sync", "AssetSyncService"),
    "AssetEnrichmentService": (".enrichment", "AssetEnrichmentService"),
    "AssetQuotaService": (".quota", "AssetQuotaService"),
    "AssetBranchingService": (".branching", "AssetBranchingService"),
    "AssetLineageService": (".lineage", "AssetLineageService"),
    "AssetIngestionService": (".ingestion", "AssetIngestionService"),
    "AssetService": (".service", "AssetService"),  # Legacy
    "tag_asset_from_metadata": (".tags", "tag_asset_from_metadata"),
    "find_existing_asset": (".dedup", "find_existing_asset"),
    "find_existing_by_candidate_ids": (".dedup", "find_existing_by_candidate_ids"),
    "find_existing_by_url": (".dedup", "find_existing_by_url"),
    "find_existing_assets_batch": (".dedup", "find_existing_assets_batch"),
    "get_media_settings": (
        "pixsim7.backend.main.services.media.settings",
        "get_media_settings",
    ),
}


def __getattr__(name: str):
    spec = _LAZY_EXPORTS.get(name)
    if spec is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib

    module_path, attr = spec
    package = __name__ if module_path.startswith(".") else None
    module = importlib.import_module(module_path, package)
    return getattr(module, attr)


__all__ = [
    "AssetSearchFilters",
    "AssetCoreService",
    "AssetSyncService",
    "AssetEnrichmentService",
    "AssetQuotaService",
    "AssetBranchingService",
    "AssetLineageService",
    "AssetIngestionService",
    "AssetService",  # Legacy
    "get_media_settings",
    # Tags
    "tag_asset_from_metadata",
    # Dedup helpers
    "find_existing_asset",
    "find_existing_by_candidate_ids",
    "find_existing_by_url",
    "find_existing_assets_batch",
]
