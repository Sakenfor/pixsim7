"""
PixSim7 Domain Models

Clean, focused domain models with single responsibilities.

Design principles:
- Single Responsibility: Each model does ONE thing
- No Duplication: ProviderSubmission is source of truth for generation params
- Explicit over Implicit: No defaults for provider_id, operation_type
- Separation of Concerns: Business logic in services, not models
"""

# Enums
from .enums import (
    MediaType,
    SyncStatus,
    JobStatus,
    OperationType,
    AccountStatus,
    VideoStatus,
    ContentDomain,
)

# Core models
from .user import User, UserSession, UserQuotaUsage, UserRole
from .workspace import Workspace
from .asset import Asset, AssetVariant
from .job import Job
from .provider_submission import ProviderSubmission
from .generation_artifact import GenerationArtifact
from .account import ProviderAccount
from .provider_credit import ProviderCredit

# Asset metadata tables
from .asset_metadata import (
    Asset3DMetadata,
    AssetAudioMetadata,
    AssetTemporalSegment,
    AssetAdultMetadata,
)

# Asset lineage and branching
from .asset_lineage import (
    AssetLineage,
    AssetBranch,
    AssetBranchVariant,
    AssetClip,
)

# Scene models (Phase 2)
from .scene import Scene, SceneAsset, SceneConnection

# Logging models (Phase 6)
from .log_entry import LogEntry

__all__ = [
    # Enums
    "MediaType",
    "SyncStatus",
    "JobStatus",
    "OperationType",
    "AccountStatus",
    "VideoStatus",
    "ContentDomain",
    "UserRole",
    # Core models
    "User",
    "UserSession",
    "UserQuotaUsage",
    "Workspace",
    "Asset",
    "AssetVariant",
    "Job",
    "ProviderSubmission",
    "GenerationArtifact",
    "ProviderAccount",
    "ProviderCredit",
    # Asset metadata
    "Asset3DMetadata",
    "AssetAudioMetadata",
    "AssetTemporalSegment",
    "AssetAdultMetadata",
    # Asset lineage
    "AssetLineage",
    "AssetBranch",
    "AssetBranchVariant",
    "AssetClip",
    # Scene models
    "Scene",
    "SceneAsset",
    "SceneConnection",
    # Logging models
    "LogEntry",
]
