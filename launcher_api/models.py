"""
API Models - Pydantic schemas for request/response.

Defines the data structures for the REST API.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


# ============================================================================
# Enums
# ============================================================================

class ServiceStatusEnum(str, Enum):
    """Service status values."""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    FAILED = "failed"


class HealthStatusEnum(str, Enum):
    """Health status values."""
    STOPPED = "stopped"
    STARTING = "starting"
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class LogLevelEnum(str, Enum):
    """Log level filter values."""
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"
    DEBUG = "DEBUG"
    CRITICAL = "CRITICAL"


# ============================================================================
# Service Models
# ============================================================================

class ServiceDefinitionResponse(BaseModel):
    """Service definition details."""
    key: str
    title: str
    program: str
    args: List[str]
    cwd: str
    url: Optional[str] = None
    health_url: Optional[str] = None
    required_tool: Optional[str] = None


class ServiceStateResponse(BaseModel):
    """Current state of a service."""
    key: str
    title: str
    status: ServiceStatusEnum
    health: HealthStatusEnum
    pid: Optional[int] = None
    last_error: str = ""
    tool_available: bool = True
    tool_check_message: str = ""


class ServiceActionRequest(BaseModel):
    """Request to perform action on service."""
    graceful: bool = Field(default=True, description="Use graceful shutdown (for stop)")


class ServiceActionResponse(BaseModel):
    """Response from service action."""
    success: bool
    message: str
    service_key: str


class ServicesListResponse(BaseModel):
    """List of all services."""
    services: List[ServiceStateResponse]
    total: int


# ============================================================================
# Log Models
# ============================================================================

class LogsRequest(BaseModel):
    """Request parameters for fetching logs."""
    filter_text: Optional[str] = Field(None, description="Text to filter logs (case-insensitive)")
    filter_level: Optional[LogLevelEnum] = Field(None, description="Log level to filter")
    tail: int = Field(100, ge=1, le=10000, description="Number of lines to return")


class LogsResponse(BaseModel):
    """Service logs."""
    service_key: str
    lines: List[str]
    total_lines: int
    filtered: bool


# ============================================================================
# Event Models
# ============================================================================

class EventMessage(BaseModel):
    """Event message structure for WebSocket."""
    event_type: str
    source: str
    timestamp: float
    data: Dict[str, Any]


class EventSubscribeRequest(BaseModel):
    """WebSocket subscribe request."""
    event_types: List[str] = Field(
        default=["*"],
        description="Event types to subscribe to (supports wildcards)"
    )


# ============================================================================
# Health Models
# ============================================================================

class APIHealthResponse(BaseModel):
    """API health check response."""
    status: str
    version: str
    managers: Dict[str, bool]
    event_bus: Dict[str, Any]


class ServiceHealthResponse(BaseModel):
    """Individual service health."""
    service_key: str
    status: HealthStatusEnum
    details: Optional[Dict[str, Any]] = None


# ============================================================================
# Error Models
# ============================================================================

class ErrorResponse(BaseModel):
    """Error response."""
    error: str
    detail: Optional[str] = None
    service_key: Optional[str] = None


# ============================================================================
# Statistics Models
# ============================================================================

class StatisticsResponse(BaseModel):
    """System statistics."""
    services_total: int
    services_running: int
    services_healthy: int
    services_unhealthy: int
    uptime_seconds: float
