"""
Automation Domain Models Package

Registers Android automation domain models with SQLModel.
Includes devices, presets, executions, loops.
"""

from pixsim7_backend.infrastructure.domain_registry import DomainModelManifest

# Import models from existing domain module
from pixsim7_backend.domain.automation import (
    AndroidDevice,
    AppActionPreset,
    AutomationExecution,
    ExecutionLoop,
    ExecutionLoopHistory,
)

# Manifest
manifest = DomainModelManifest(
    id="automation_models",
    name="Automation Domain Models",
    description="Android automation models (devices, presets, executions)",
    models=[
        "AndroidDevice",
        "AppActionPreset",
        "AutomationExecution",
        "ExecutionLoop",
        "ExecutionLoopHistory",
    ],
    enabled=True,
    dependencies=["core_models"],  # Automation models may reference User
)
