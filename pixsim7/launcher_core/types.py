"""
Core types and enums for the launcher.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Callable


class HealthStatus(Enum):
    """Health status of a service."""
    STOPPED = "stopped"
    STARTING = "starting"
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class ServiceStatus(Enum):
    """Runtime status of a service."""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    FAILED = "failed"


@dataclass
class ServiceDefinition:
    """
    Definition of a service to be managed.

    This is a pure data structure with no Qt or UI dependencies.
    """
    key: str
    title: str
    program: str
    args: List[str]
    cwd: str
    env_overrides: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    health_url: Optional[str] = None
    required_tool: Optional[str] = None  # Tool that must be in PATH
    health_grace_attempts: int = 5       # Attempts before marking unhealthy
    depends_on: Optional[List[str]] = None  # Service keys that must be running first

    # Service-specific handlers (for special cases like docker-compose)
    is_detached: bool = False  # True for services that run detached (like docker-compose)
    custom_start: Optional[Callable] = None  # Custom start function
    custom_stop: Optional[Callable] = None   # Custom stop function
    custom_health_check: Optional[Callable] = None  # Custom health check function


@dataclass
class ServiceState:
    """
    Runtime state of a managed service.

    Tracks the current status, health, and process information.
    """
    definition: ServiceDefinition
    status: ServiceStatus = ServiceStatus.STOPPED
    health: HealthStatus = HealthStatus.STOPPED
    pid: Optional[int] = None
    detected_pid: Optional[int] = None  # PID of externally running process
    last_error: str = ""
    tool_available: bool = True
    tool_check_message: str = ""
    failure_count: int = 0

    # Log buffer (limited size, in-memory)
    log_buffer: List[str] = field(default_factory=list)
    max_log_lines: int = 5000


@dataclass
class ProcessEvent:
    """
    Event emitted by the process manager.

    UI layers can subscribe to these events to update their display.
    """
    service_key: str
    event_type: str  # "started", "stopped", "failed", "output", "error"
    data: Optional[Dict] = None


@dataclass
class HealthEvent:
    """
    Event emitted by the health manager.

    UI layers can subscribe to these events to update health indicators.
    """
    service_key: str
    status: HealthStatus
    timestamp: float
    details: Optional[Dict] = None
