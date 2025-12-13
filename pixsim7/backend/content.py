"""
PixSim7 Content Domain Entry Module

Provides a stable public interface for content generation including:
- Asset management (creation, storage, variants)
- Generation workflows (text-to-video, image-to-video)
- Provider submissions and accounts
- Asset lineage and branching

Usage:
    from pixsim7.backend.content import (
        Asset, AssetVariant, Generation, ProviderSubmission,
        GenerationService, AssetService,
        MediaType, GenerationStatus,
    )

See docs/backend/content.md for detailed documentation.
"""

# =============================================================================
# Domain Models - Core
# =============================================================================

from pixsim7.backend.main.domain import (
    # Enums
    MediaType,
    SyncStatus,
    GenerationStatus,
    OperationType,
    AccountStatus,
    ProviderStatus,
    ContentDomain,
    # Core models
    Asset,
    AssetVariant,
    Generation,
    ProviderSubmission,
    ProviderAccount,
    ProviderCredit,
    # Asset metadata
    Asset3DMetadata,
    AssetAudioMetadata,
    AssetTemporalSegment,
    AssetAdultMetadata,
    # Asset lineage
    AssetLineage,
    AssetBranch,
    AssetBranchVariant,
    AssetClip,
    # Scene models
    Scene,
    SceneAsset,
    SceneConnection,
)

# =============================================================================
# Generation Services
# =============================================================================

from pixsim7.backend.main.services.generation import (
    GenerationService,
    GenerationCreationService,
    GenerationLifecycleService,
    GenerationQueryService,
    GenerationRetryService,
)

# =============================================================================
# Asset Services
# =============================================================================

from pixsim7.backend.main.services.asset import (
    AssetCoreService,
    AssetSyncService,
    AssetEnrichmentService,
    AssetQuotaService,
    AssetBranchingService,
    AssetLineageService,
    AssetService,  # Legacy composite service
)

# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Enums
    "MediaType",
    "SyncStatus",
    "GenerationStatus",
    "OperationType",
    "AccountStatus",
    "ProviderStatus",
    "ContentDomain",
    # Core Models
    "Asset",
    "AssetVariant",
    "Generation",
    "ProviderSubmission",
    "ProviderAccount",
    "ProviderCredit",
    # Asset Metadata
    "Asset3DMetadata",
    "AssetAudioMetadata",
    "AssetTemporalSegment",
    "AssetAdultMetadata",
    # Asset Lineage
    "AssetLineage",
    "AssetBranch",
    "AssetBranchVariant",
    "AssetClip",
    # Scene Models
    "Scene",
    "SceneAsset",
    "SceneConnection",
    # Generation Services
    "GenerationService",
    "GenerationCreationService",
    "GenerationLifecycleService",
    "GenerationQueryService",
    "GenerationRetryService",
    # Asset Services
    "AssetCoreService",
    "AssetSyncService",
    "AssetEnrichmentService",
    "AssetQuotaService",
    "AssetBranchingService",
    "AssetLineageService",
    "AssetService",
]
