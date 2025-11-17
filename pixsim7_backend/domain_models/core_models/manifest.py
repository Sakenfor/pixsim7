"""
Core Domain Models Package

Registers core business domain models with SQLModel.
Includes users, assets, jobs, workspaces, etc.
"""

from pixsim7_backend.infrastructure.domain_registry import DomainModelManifest

# Import models from existing domain module
from pixsim7_backend.domain import (
    User,
    UserSession,
    UserQuotaUsage,
    Workspace,
    Asset,
    AssetVariant,
    Job,
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
    description="Core business models (users, assets, jobs, providers)",
    models=[
        "User",
        "UserSession",
        "UserQuotaUsage",
        "Workspace",
        "Asset",
        "AssetVariant",
        "Job",
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
