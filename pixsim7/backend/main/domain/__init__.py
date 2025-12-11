"""
PixSim7 Domain Models

Clean, focused domain models with single responsibilities.

Design principles:
- Single Responsibility: Each model does ONE thing
- No Duplication: ProviderSubmission is source of truth for generation params
- Explicit over Implicit: No defaults for provider_id, operation_type
- Separation of Concerns: Business logic in services, not models

─────────────────────────────────────────────────────────────────────────
DOMAIN PACKAGE IMPORT CONVENTIONS
─────────────────────────────────────────────────────────────────────────

This __init__.py exports only "core" cross-cutting models that are used
throughout the application. Extended domain subsystems must be imported
from their respective submodules.

✅ Core models (exported from this __init__):
   - User, UserSession, UserQuotaUsage, UserRole
   - Workspace
   - Asset, AssetVariant, Asset*Metadata, AssetLineage, AssetBranch, etc.
   - Generation, ProviderSubmission, ProviderAccount, ProviderCredit
   - Scene, SceneAsset, SceneConnection
   - LogEntry
   - PromptFamily, PromptVersion, PromptVariantFeedback

🔒 Extended subsystems (import from submodules):
   - Game models:     from pixsim7.backend.main.domain.game.models import GameWorld
   - Metrics:         from pixsim7.backend.main.domain.metrics import ...
   - Behavior:        from pixsim7.backend.main.domain.behavior import ...
   - Scenarios:       from pixsim7.backend.main.domain.scenarios import ...
   - Automation:      from pixsim7.backend.main.domain.automation import ...
   - Narrative:       from pixsim7.backend.main.domain.narrative import ...

❌ INCORRECT (will fail):
   from pixsim7.backend.main.domain import game
   from pixsim7.backend.main.domain import GameWorld

See ARCHITECTURE.md § "Domain Package Boundaries" for rationale.
─────────────────────────────────────────────────────────────────────────
"""

# Enums
from .enums import (
    MediaType,
    SyncStatus,
    GenerationStatus,
    OperationType,
    AccountStatus,
    VideoStatus,
    ContentDomain,
    BillingState,
)

# Core models
from .user import User, UserSession, UserQuotaUsage, UserRole
from .workspace import Workspace
from .asset import Asset, AssetVariant
from .generation import Generation
from .provider_submission import ProviderSubmission
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

# Prompt versioning (Phase 7)
from .prompt_versioning import PromptFamily, PromptVersion, PromptVariantFeedback

# AI interactions (AI Hub)
from .ai_interaction import AiInteraction

# Asset analysis
from .asset_analysis import AssetAnalysis, AnalysisStatus, AnalyzerType

__all__ = [
    # Enums
    "MediaType",
    "SyncStatus",
    "GenerationStatus",
    "OperationType",
    "AccountStatus",
    "VideoStatus",
    "ContentDomain",
    "BillingState",
    "UserRole",
    # Core models
    "User",
    "UserSession",
    "UserQuotaUsage",
    "Workspace",
    "Asset",
    "AssetVariant",
    "Generation",
    "ProviderSubmission",
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
    # Prompt versioning
    "PromptFamily",
    "PromptVersion",
    "PromptVariantFeedback",
    # AI interactions
    "AiInteraction",
    # Asset analysis
    "AssetAnalysis",
    "AnalysisStatus",
    "AnalyzerType",
]
