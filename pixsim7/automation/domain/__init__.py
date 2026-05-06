"""
Automation domain package for PixSim7

Models:
- AndroidDevice
- DeviceAgent
- PairingRequest
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
from .agent import DeviceAgent
from .pairing_request import PairingRequest
from .preset import AppActionPreset, ActionType, PRESET_POLICY
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
    "DeviceAgent",
    "PairingRequest",
    "DeviceType",
    "ConnectionMethod",
    "DeviceStatus",
    "AppActionPreset",
    "ActionType",
    "PRESET_POLICY",
    "AutomationExecution",
    "AutomationStatus",
    "ExecutionLoop",
    "ExecutionLoopHistory",
    "LoopSelectionMode",
    "PresetExecutionMode",
    "LoopStatus",
]
