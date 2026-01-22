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
# Buildable Models
# ============================================================================

class BuildableDefinitionResponse(BaseModel):
    """Buildable package definition."""
    id: str
    title: str
    package: str
    directory: str
    description: Optional[str] = None
    command: str
    args: List[str]
    category: Optional[str] = None
    tags: List[str] = []


class BuildablesListResponse(BaseModel):
    """List of buildable workspace packages."""
    buildables: List[BuildableDefinitionResponse]
    total: int


# ============================================================================
# Launcher Settings Models
# ============================================================================

class LoggingSettingsModel(BaseModel):
    sql_logging_enabled: bool
    worker_debug_flags: str
    backend_log_level: str


class DatastoreSettingsModel(BaseModel):
    use_local_datastores: bool
    local_database_url: str
    local_redis_url: str


class PortsSettingsModel(BaseModel):
    backend: int
    frontend: int
    game_frontend: int
    game_service: int
    devtools: int
    admin: int
    launcher: int
    generation_api: int
    postgres: int
    redis: int


class BaseUrlSettingsModel(BaseModel):
    backend: str
    generation: str
    frontend: str
    game_frontend: str
    devtools: str
    admin: str
    launcher: str
    analysis: str


class AdvancedEnvSettingsModel(BaseModel):
    database_url: str
    redis_url: str
    secret_key: str
    cors_origins: str
    debug: str
    service_base_urls: str
    service_timeouts: str


class ProfileDefinitionModel(BaseModel):
    label: str
    ports: Dict[str, int]
    base_urls: Dict[str, str]
    use_local_datastores: bool


class ProfileSettingsModel(BaseModel):
    active: str
    available: Dict[str, ProfileDefinitionModel]


class LauncherSettingsResponse(BaseModel):
    logging: LoggingSettingsModel
    datastores: DatastoreSettingsModel
    ports: PortsSettingsModel
    base_urls: BaseUrlSettingsModel
    advanced: AdvancedEnvSettingsModel
    profiles: ProfileSettingsModel

    @classmethod
    def from_settings(cls, settings):
        return cls(
            logging=LoggingSettingsModel(**settings.logging.__dict__),
            datastores=DatastoreSettingsModel(**settings.datastores.__dict__),
            ports=PortsSettingsModel(**settings.ports.__dict__),
            base_urls=BaseUrlSettingsModel(**settings.base_urls.__dict__),
            advanced=AdvancedEnvSettingsModel(**settings.advanced.__dict__),
            profiles=ProfileSettingsModel(
                active=settings.profiles.active,
                available={k: ProfileDefinitionModel(**v.__dict__) for k, v in settings.profiles.available.items()},
            ),
        )


class LoggingSettingsUpdate(BaseModel):
    sql_logging_enabled: Optional[bool] = None
    worker_debug_flags: Optional[str] = None
    backend_log_level: Optional[str] = None


class DatastoreSettingsUpdate(BaseModel):
    use_local_datastores: Optional[bool] = None
    local_database_url: Optional[str] = None
    local_redis_url: Optional[str] = None


class PortsSettingsUpdate(BaseModel):
    backend: Optional[int] = None
    frontend: Optional[int] = None
    game_frontend: Optional[int] = None
    game_service: Optional[int] = None
    devtools: Optional[int] = None
    admin: Optional[int] = None
    launcher: Optional[int] = None
    generation_api: Optional[int] = None
    postgres: Optional[int] = None
    redis: Optional[int] = None


class BaseUrlSettingsUpdate(BaseModel):
    backend: Optional[str] = None
    generation: Optional[str] = None
    frontend: Optional[str] = None
    game_frontend: Optional[str] = None
    devtools: Optional[str] = None
    admin: Optional[str] = None
    launcher: Optional[str] = None
    analysis: Optional[str] = None


class AdvancedEnvSettingsUpdate(BaseModel):
    database_url: Optional[str] = None
    redis_url: Optional[str] = None
    secret_key: Optional[str] = None
    cors_origins: Optional[str] = None
    debug: Optional[str] = None
    service_base_urls: Optional[str] = None
    service_timeouts: Optional[str] = None


class ProfileSettingsUpdate(BaseModel):
    active: Optional[str] = None


class LauncherSettingsUpdateRequest(BaseModel):
    logging: Optional[LoggingSettingsUpdate] = None
    datastores: Optional[DatastoreSettingsUpdate] = None
    ports: Optional[PortsSettingsUpdate] = None
    base_urls: Optional[BaseUrlSettingsUpdate] = None
    advanced: Optional[AdvancedEnvSettingsUpdate] = None
    profiles: Optional[ProfileSettingsUpdate] = None


# ============================================================================
# Codegen Models
# ============================================================================

class CodegenTaskResponse(BaseModel):
    id: str
    description: str
    script: str
    supports_check: bool = False
    groups: List[str] = []


class CodegenTasksResponse(BaseModel):
    tasks: List[CodegenTaskResponse]
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
