"""
Core Domain Models Package

Registers core business domain models with SQLModel.
Includes users, assets, generations, workspaces, etc.
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Import models from existing domain module
from pixsim7.backend.main.domain import (
    User,
    UserSession,
    UserQuotaUsage,
    Workspace,
    Asset,
    AssetVariant,
    Generation,
    ProviderSubmission,
    ProviderAccount,
    ProviderCredit,
    Scene,
    SceneAsset,
    SceneConnection,
    LogEntry,
)

# Manifest
manifest = DomainModelManifest(
    id="core_models",
    name="Core Domain Models",
    description="Core business models (users, assets, generations, providers)",
    models=[
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
        "Scene",
        "SceneAsset",
        "SceneConnection",
        "LogEntry",
    ],
    enabled=True,
    dependencies=[],  # Core models have no dependencies
)
