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
from .core import AssetCoreService
from .sync import AssetSyncService
from .enrichment import AssetEnrichmentService
from .quota import AssetQuotaService
from .branching import AssetBranchingService
from .lineage import AssetLineageService
from .ingestion import AssetIngestionService, get_media_settings
from .tags import tag_asset_from_metadata, extract_ontology_ids_from_asset_tags
from .dedup import (
    find_existing_asset,
    find_existing_by_candidate_ids,
    find_existing_by_url,
    find_existing_assets_batch,
)

# Backward compatibility - maintain old import
from .service import AssetService

__all__ = [
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
    "extract_ontology_ids_from_asset_tags",
    # Dedup helpers
    "find_existing_asset",
    "find_existing_by_candidate_ids",
    "find_existing_by_url",
    "find_existing_assets_batch",
]
