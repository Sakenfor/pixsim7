"""
Automation domain package for PixSim7

Models:
- AndroidDevice
- AppActionPreset
- AutomationExecution
- ExecutionLoop
- ExecutionLoopHistory

Enums:
- DeviceType, ConnectionMethod, DeviceStatus
- AutomationStatus, ActionType
- LoopSelectionMode, PresetExecutionMode, LoopStatus
"""

from .device import AndroidDevice, DeviceType, ConnectionMethod, DeviceStatus
from .preset import AppActionPreset, ActionType
from .execution import AutomationExecution, AutomationStatus
from .execution_loop import (
    ExecutionLoop,
    ExecutionLoopHistory,
    LoopSelectionMode,
    PresetExecutionMode,
    LoopStatus,
)

__all__ = [
    "AndroidDevice",
    "DeviceType",
    "ConnectionMethod",
    "DeviceStatus",
    "AppActionPreset",
    "ActionType",
    "AutomationExecution",
    "AutomationStatus",
    "ExecutionLoop",
    "ExecutionLoopHistory",
    "LoopSelectionMode",
    "PresetExecutionMode",
    "LoopStatus",
]
