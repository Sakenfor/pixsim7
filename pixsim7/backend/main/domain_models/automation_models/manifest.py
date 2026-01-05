"""
Automation Domain Models Package

Registers Android automation domain models with SQLModel.
Includes devices, presets, executions, loops.
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Manifest
manifest = DomainModelManifest(
    id="automation_models",
    name="Automation Domain Models",
    description="Android automation models (devices, presets, executions)",
    models=[],
    source_modules=[
        "pixsim7.backend.main.domain.automation",
    ],
    auto_discover=True,
    enabled=True,
    dependencies=["core_models"],  # Automation models may reference User
)
