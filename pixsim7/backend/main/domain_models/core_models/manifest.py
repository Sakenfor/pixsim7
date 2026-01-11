"""
Core Domain Models Package

Registers core business domain models with SQLModel.
Includes users, assets, jobs, workspaces, etc.
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Manifest
manifest = DomainModelManifest(
    id="core_models",
    name="Core Domain Models",
    description="Core business models (users, assets, jobs, providers)",
    models=[],
    source_modules=[
        "pixsim7.backend.main.domain.core.user_ai_settings",
        "pixsim7.backend.main.domain.user",
        "pixsim7.backend.main.domain.workspace",
        "pixsim7.backend.main.domain.assets.models",
        "pixsim7.backend.main.domain.assets.content",
        "pixsim7.backend.main.domain.assets.metadata",
        "pixsim7.backend.main.domain.assets.lineage",
        "pixsim7.backend.main.domain.assets.analysis",
        "pixsim7.backend.main.domain.assets.tag",
        "pixsim7.backend.main.domain.analyzer_definition",
        "pixsim7.backend.main.domain.analyzer_preset",
        "pixsim7.backend.main.domain.ai_interaction",
        "pixsim7.backend.main.domain.plugin_catalog",
        "pixsim7.backend.main.domain.links",
        "pixsim7.backend.main.domain.generation.models",
        "pixsim7.backend.main.domain.providers.models.account",
        "pixsim7.backend.main.domain.providers.models.credit",
        "pixsim7.backend.main.domain.providers.models.submission",
        "pixsim7.backend.main.domain.providers.models.provider_instance_config",
        "pixsim7.backend.main.domain.scene",
        "pixsim7.backend.main.domain.log_entry",
    ],
    auto_discover=True,
    enabled=True,
    dependencies=[],  # Core models have no dependencies
)
