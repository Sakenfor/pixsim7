"""
PixSim7 Automation Domain Entry Module

Provides a stable public interface for Android device automation including:
- Device management (AndroidDevice, DeviceAgent)
- Automation presets and executions
- Execution loops for repeated automation workflows
- Device pool management

Usage:
    from pixsim7.backend.automation import (
        AndroidDevice, DeviceAgent, AppActionPreset,
        ExecutionLoop, AutomationExecution,
        ExecutionLoopService, DevicePoolService,
    )

See docs/backend/automation.md for detailed documentation.
"""

# =============================================================================
# Domain Models
# =============================================================================

from pixsim7.backend.main.domain.automation import (
    # Device models
    AndroidDevice,
    DeviceType,
    ConnectionMethod,
    DeviceStatus,
    # Agent models
    DeviceAgent,
    # Preset models
    AppActionPreset,
    ActionType,
    # Execution models
    AutomationExecution,
    AutomationStatus,
    # Loop models
    ExecutionLoop,
    ExecutionLoopHistory,
    LoopSelectionMode,
    PresetExecutionMode,
    LoopStatus,
)

# =============================================================================
# Services
# =============================================================================

from pixsim7.backend.main.services.automation import (
    ExecutionLoopService,
    DevicePoolService,
    DeviceAssignmentResult,
)

# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Device Models
    "AndroidDevice",
    "DeviceType",
    "ConnectionMethod",
    "DeviceStatus",
    # Agent Models
    "DeviceAgent",
    # Preset Models
    "AppActionPreset",
    "ActionType",
    # Execution Models
    "AutomationExecution",
    "AutomationStatus",
    # Loop Models
    "ExecutionLoop",
    "ExecutionLoopHistory",
    "LoopSelectionMode",
    "PresetExecutionMode",
    "LoopStatus",
    # Services
    "ExecutionLoopService",
    "DevicePoolService",
    "DeviceAssignmentResult",
]
