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
"""
from .core_service import AssetCoreService
from .sync_service import AssetSyncService
from .enrichment_service import AssetEnrichmentService
from .quota_service import AssetQuotaService
from .branching_service import AssetBranchingService
from .lineage_service import AssetLineageService
from .ingestion_service import AssetIngestionService, get_media_settings

# Backward compatibility - maintain old import
from .asset_service import AssetService

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
]
