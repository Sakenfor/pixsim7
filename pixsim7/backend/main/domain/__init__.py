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
   - Providers domain: from pixsim7.backend.main.domain.providers import ...
     (ProviderAccount, ProviderCredit, ProviderSubmission, registry, CreditSemantics)
   - Game models:      from pixsim7.backend.main.domain.game.core.models import GameWorld
   - Metrics:          from pixsim7.backend.main.domain.metrics import ...
   - Behavior:         from pixsim7.backend.main.domain.behavior import ...
   - Scenarios:        from pixsim7.backend.main.domain.scenarios import ...
   - Automation:       from pixsim7.backend.main.domain.automation import ...
   - Narrative:        from pixsim7.backend.main.domain.narrative import ...

📦 PROVIDERS DOMAIN (domain/providers/)
   The Providers domain owns provider lifecycle, metadata, and credits:
   - Provider accounts + auth/session data shapes
   - Credit types + credit accounting semantics
   - Provider manifests/metadata (domains, capabilities)
   - Provider registry + plugin loading
   - Common execution hooks (file prep, status mapping)

   See domain/providers/__init__.py for detailed documentation.

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
    ProviderStatus,
    ContentDomain,
    BillingState,
)

# Core models
from .user import User, UserSession, UserQuotaUsage, UserRole
from .workspace import Workspace
from .assets.models import Asset, AssetVariant
from .assets.content import ContentBlob
from .generation.models import Generation
from .providers import ProviderSubmission, ProviderAccount, ProviderCredit

# Asset metadata tables
from .assets.metadata import (
    Asset3DMetadata,
    AssetAudioMetadata,
    AssetTemporalSegment,
    AssetAdultMetadata,
)

# Asset lineage and branching
from .assets.lineage import (
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
from .assets.analysis import AssetAnalysis, AnalysisStatus, AnalyzerType

__all__ = [
    # Enums
    "MediaType",
    "SyncStatus",
    "GenerationStatus",
    "OperationType",
    "AccountStatus",
    "ProviderStatus",
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
    "ContentBlob",
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
