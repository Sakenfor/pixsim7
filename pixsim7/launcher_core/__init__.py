"""
Launcher Core - UI-agnostic service management library.

This package provides the core business logic for managing PixSim7 services,
decoupled from any UI framework. It can be used from:
- PySide6/Qt desktop launcher
- FastAPI web service
- CLI tools
- Tests
"""

from .types import ServiceDefinition, ServiceStatus, HealthStatus
from .process_manager import ProcessManager
from .health_manager import HealthManager
from .log_manager import LogManager

__all__ = [
    'ServiceDefinition',
    'ServiceStatus',
    'HealthStatus',
    'ProcessManager',
    'HealthManager',
    'LogManager',
]
