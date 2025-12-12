"""
Log ingestion and query API endpoints.

Provides centralized log collection and querying.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field
from dataclasses import dataclass, asdict

from pixsim7.backend.main.api.dependencies import CurrentAdminUser
from pixsim7.backend.main.infrastructure.database.session import get_log_db
from pixsim7.backend.main.services.log_service import LogService
from pixsim7.backend.main.domain import LogEntry
from pixsim_logging import get_logger

logger = get_logger()
router = APIRouter()


# ===== Console Field Definitions =====

@dataclass
class ConsoleFieldDefinition:
    """Definition of a clickable log field for console rendering."""
    name: str
    color: str
    clickable: bool
    pattern: str
    description: Optional[str] = None


class ConsoleFieldRegistry:
    """Registry for console field definitions that services can extend."""

    def __init__(self):
        self._fields: Dict[str, ConsoleFieldDefinition] = {}
        self._register_defaults()

    def _register_defaults(self):
        """Register default clickable fields used across services."""
        default_fields = [
            ConsoleFieldDefinition(
                name="request_id",
                color="#FFB74D",
                clickable=True,
                pattern=r"request_id=(\S+)",
                description="API request correlation ID"
            ),
            ConsoleFieldDefinition(
                name="job_id",
                color="#4DD0E1",
                clickable=True,
                pattern=r"job_id=(\S+)",
                description="Background job identifier"
            ),
            ConsoleFieldDefinition(
                name="submission_id",
                color="#FFB74D",
                clickable=True,
                pattern=r"submission_id=(\S+)",
                description="Provider submission identifier"
            ),
            ConsoleFieldDefinition(
                name="generation_id",
                color="#FFB74D",
                clickable=True,
                pattern=r"generation_id=(\S+)",
                description="Asset generation identifier"
            ),
            ConsoleFieldDefinition(
                name="provider_id",
                color="#4DD0E1",
                clickable=True,
                pattern=r"provider_id=(\S+)",
                description="AI provider identifier"
            ),
            ConsoleFieldDefinition(
                name="error_type",
                color="#EF5350",
                clickable=False,
                pattern=r"error_type=(\S+)",
                description="Error classification"
            ),
        ]

        for field in default_fields:
            self._fields[field.name] = field

    def register(self, field: ConsoleFieldDefinition):
        """Register a new console field definition."""
        self._fields[field.name] = field

    def get_all(self) -> List[Dict]:
        """Get all registered field definitions as dicts."""
        return [asdict(field) for field in self._fields.values()]

    def get_field(self, name: str) -> Optional[ConsoleFieldDefinition]:
        """Get a specific field definition by name."""
        return self._fields.get(name)


# Global registry instance
console_field_registry = ConsoleFieldRegistry()


# ===== Request/Response Models =====

class LogIngestRequest(BaseModel):
    """Single log entry for ingestion."""
    timestamp: Optional[str] = Field(None, description="ISO timestamp")
    level: str = Field(..., description="Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)")
    service: str = Field(..., description="Service name")
    env: Optional[str] = Field("dev", description="Environment")
    msg: Optional[str] = Field(None, description="Log message")

    # Correlation fields
    request_id: Optional[str] = None
    job_id: Optional[int] = None
    submission_id: Optional[int] = None
    artifact_id: Optional[int] = None
    provider_job_id: Optional[str] = None

    # Context fields
    provider_id: Optional[str] = None
    operation_type: Optional[str] = None
    stage: Optional[str] = None
    user_id: Optional[int] = None

    # Error fields
    error: Optional[str] = None
    error_type: Optional[str] = None

    # Performance fields
    duration_ms: Optional[int] = None
    attempt: Optional[int] = None

    # Extra fields
    extra: Optional[dict] = Field(None, description="Additional context")

    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": "2025-11-12T22:53:59.696794Z",
                "level": "info",
                "service": "worker",
                "env": "dev",
                "msg": "job_submitted_to_provider",
                "job_id": 123,
                "operation_type": "text_to_video",
                "provider_id": "pixverse",
                "stage": "provider:submit",
                "provider_job_id": "pv_job_abc"
            }
        }


class LogBatchIngestRequest(BaseModel):
    """Batch of log entries for ingestion."""
    logs: List[dict] = Field(..., description="List of log entries")


class LogIngestResponse(BaseModel):
    """Response from log ingestion."""
    success: bool
    log_id: Optional[int] = None
    count: Optional[int] = None
    message: str


class LogEntryResponse(BaseModel):
    """Log entry response."""
    id: int
    timestamp: datetime
    level: str
    service: str
    env: str
    msg: Optional[str]

    # Correlation fields
    request_id: Optional[str]
    job_id: Optional[int]
    submission_id: Optional[int]
    artifact_id: Optional[int]
    provider_job_id: Optional[str]

    # Context fields
    provider_id: Optional[str]
    operation_type: Optional[str]
    stage: Optional[str]
    user_id: Optional[int]

    # Error fields
    error: Optional[str]
    error_type: Optional[str]

    # Performance fields
    duration_ms: Optional[int]
    attempt: Optional[int]

    # Extra
    extra: Optional[dict]

    class Config:
        from_attributes = True


class LogQueryResponse(BaseModel):
    """Response from log query."""
    logs: List[LogEntryResponse]
    total: int
    limit: int
    offset: int


# ===== Endpoints =====

@router.post("/ingest", response_model=LogIngestResponse)
async def ingest_log(
    request: LogIngestRequest,
    db: AsyncSession = Depends(get_log_db)
) -> LogIngestResponse:
    """
    Ingest a single structured log entry.

    This endpoint receives structured logs from any service (API, worker, frontend, scripts)
    and stores them for querying and analysis.
    """
    try:
        service = LogService(db)
        log_entry = await service.ingest_log(request.model_dump())

        return LogIngestResponse(
            success=True,
            log_id=log_entry.id,
            message="Log ingested successfully"
        )
    except Exception as e:
        logger.error(
            "log_ingest_endpoint_error",
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to ingest log: {str(e)}")


@router.post("/ingest/batch", response_model=LogIngestResponse)
async def ingest_log_batch(
    request: LogBatchIngestRequest,
    db: AsyncSession = Depends(get_log_db)
) -> LogIngestResponse:
    """
    Ingest multiple log entries in a batch.

    More efficient than individual ingestion for bulk operations.
    """
    try:
        service = LogService(db)
        count = await service.ingest_batch(request.logs)

        return LogIngestResponse(
            success=True,
            count=count,
            message=f"Ingested {count} logs successfully"
        )
    except Exception as e:
        logger.error(
            "log_batch_ingest_error",
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to ingest logs: {str(e)}")


@router.get("/query", response_model=LogQueryResponse)
async def query_logs(
    # NOTE: No auth required for local development/launcher use
    # admin: CurrentAdminUser,  # Commented out for local dev access
    service: Optional[str] = Query(None, description="Filter by service name"),
    level: Optional[str] = Query(None, description="Filter by log level"),
    job_id: Optional[int] = Query(None, description="Filter by job ID"),
    request_id: Optional[str] = Query(None, description="Filter by request ID"),
    stage: Optional[str] = Query(None, description="Filter by pipeline stage (exact)"),
    stage_prefix: Optional[str] = Query(None, description="Filter by pipeline stage prefix (e.g. provider, pipeline)"),
    provider_id: Optional[str] = Query(None, description="Filter by provider"),
    start_time: Optional[datetime] = Query(None, description="Logs after this time (ISO 8601)"),
    end_time: Optional[datetime] = Query(None, description="Logs before this time (ISO 8601)"),
    search: Optional[str] = Query(None, description="Text search in msg and error fields"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_log_db),
) -> LogQueryResponse:
    """
    Query structured logs with filters.

    Supports filtering by service, level, job_id, request_id, stage, provider_id, time range, and text search.
    Returns paginated results ordered by timestamp (newest first).
    """
    try:
        service_obj = LogService(db)
        logs, total = await service_obj.query_logs(
            service=service,
            level=level,
            job_id=job_id,
            request_id=request_id,
            stage=stage,
            stage_prefix=stage_prefix,
            provider_id=provider_id,
            start_time=start_time,
            end_time=end_time,
            search=search,
            limit=limit,
            offset=offset
        )

        return LogQueryResponse(
            logs=[LogEntryResponse.model_validate(log) for log in logs],
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(
            "log_query_error",
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to query logs: {str(e)}")


@router.get("/trace/job/{job_id}", response_model=List[LogEntryResponse])
async def get_job_trace(
    # admin: CurrentAdminUser,  # Commented out for local dev access
    job_id: int,
    db: AsyncSession = Depends(get_log_db),
) -> List[LogEntryResponse]:
    """
    Get complete log trace for a job.

    Returns all logs related to a job, ordered chronologically.
    Useful for debugging job processing issues.
    """
    try:
        service = LogService(db)
        logs = await service.get_job_trace(job_id)

        return [LogEntryResponse.model_validate(log) for log in logs]
    except Exception as e:
        logger.error(
            "job_trace_error",
            job_id=job_id,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to get job trace: {str(e)}")


@router.get("/trace/request/{request_id}", response_model=List[LogEntryResponse])
async def get_request_trace(
    # admin: CurrentAdminUser,  # Commented out for local dev access
    request_id: str,
    db: AsyncSession = Depends(get_log_db),
) -> List[LogEntryResponse]:
    """
    Get complete log trace for an API request.

    Returns all logs related to a request, ordered chronologically.
    Useful for debugging API request flows.
    """
    try:
        service = LogService(db)
        logs = await service.get_request_trace(request_id)

        return [LogEntryResponse.model_validate(log) for log in logs]
    except Exception as e:
        logger.error(
            "request_trace_error",
            request_id=request_id,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=f"Failed to get request trace: {str(e)}")


@router.get("/fields")
async def get_fields(
    # admin: CurrentAdminUser,  # Commented out for local dev access
    service: Optional[str] = Query(None, description="Service name to scope field discovery"),
    sample_limit: int = Query(300, ge=1, le=2000, description="Number of recent rows to inspect"),
    db: AsyncSession = Depends(get_log_db),
):
    """Discover available log fields.

    Returns union of column names and dynamic keys inside 'extra' for recent rows.
    If service is provided, restrict inspection to that service.
    """
    try:
        service_obj = LogService(db)
        return await service_obj.get_fields(
            service=service,
            sample_limit=sample_limit
        )
    except Exception as e:
        logger.error("log_fields_error", error=str(e), error_type=e.__class__.__name__, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to discover fields: {str(e)}")



@router.get("/files")
async def list_log_files(
    # admin: CurrentAdminUser,  # Commented out for local dev access
):
    """List available log files."""
    import os

    log_dirs = [
        "data/logs",
        "data/logs/console",
        "data/logs/launcher"
    ]

    files = []
    for log_dir in log_dirs:
        if os.path.exists(log_dir):
            for file in os.listdir(log_dir):
                if file.endswith('.log'):
                    filepath = f"{log_dir}/{file}"
                    stat = os.stat(filepath)
                    files.append({
                        "path": filepath,
                        "name": file,
                        "location": log_dir,
                        "size": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })

    # Sort by modification time (newest first)
    files.sort(key=lambda x: x['modified'], reverse=True)
    return {"files": files}


@router.get("/files/tail")
async def tail_log_file(
    # admin: CurrentAdminUser,  # Commented out for local dev access
    path: str = Query(..., description="Log file path (e.g., data/logs/console/backend.log)"),
    lines: int = Query(100, ge=1, le=10000, description="Number of lines to return"),
):
    """Get last N lines from a log file (like tail -n)."""
    import os
    from collections import deque
    from pathlib import Path

    base_dir = Path("data/logs").resolve()
    target_path = Path(path).resolve()

    # Security: only allow reading from data/logs directory
    if base_dir != target_path and base_dir not in target_path.parents:
        raise HTTPException(status_code=403, detail="Access denied: can only read from data/logs/")

    if not target_path.exists():
        raise HTTPException(status_code=404, detail=f"Log file not found: {path}")

    if not target_path.is_file():
        raise HTTPException(status_code=403, detail="Access denied: requested path is not a file")

    try:
        # Efficiently read last N lines
        with open(target_path, 'r', encoding='utf-8', errors='ignore') as f:
            last_lines = deque(f, maxlen=lines)

        return {
            "path": str(target_path),
            "lines": list(last_lines),
            "count": len(last_lines)
        }
    except Exception as e:
        logger.error("file_tail_error", path=str(target_path), error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to read log file: {str(e)}")


@router.get("/distinct")
async def get_distinct(
    # admin: CurrentAdminUser,  # Commented out for local dev access
    field: str = Query(..., description="Field name to get distinct values for (column or extra key)"),
    service: Optional[str] = Query(None, description="Restrict to service"),
    provider_id: Optional[str] = None,
    operation_type: Optional[str] = None,
    stage: Optional[str] = None,
    request_id: Optional[str] = None,
    job_id: Optional[int] = None,
    user_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_log_db),
):
    """Return distinct values for a field.

    Supports base columns and dynamic keys stored in JSON 'extra'.
    Applies cascading filters so selections refine available values.
    """
    if not field:
        raise HTTPException(status_code=400, detail="field is required")

    try:
        service_obj = LogService(db)
        return await service_obj.get_distinct(
            field=field,
            service=service,
            provider_id=provider_id,
            operation_type=operation_type,
            stage=stage,
            request_id=request_id,
            job_id=job_id,
            user_id=user_id,
            limit=limit
        )
    except Exception as e:
        logger.error("log_distinct_error", field=field, error=str(e), error_type=e.__class__.__name__, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get distinct values: {str(e)}")


@router.get("/console-fields")
async def get_console_fields():
    """Get console field metadata for clickable log rendering.

    Returns field definitions including:
    - name: Field identifier (e.g., "job_id")
    - color: Hex color code for rendering
    - clickable: Whether field should be clickable
    - pattern: Regex pattern to extract field value from logs
    - description: Human-readable field description

    This metadata is used by the launcher GUI and web UI to render
    clickable badges in console logs. Services can register custom
    fields via the console_field_registry.

    Example response:
    {
        "fields": [
            {
                "name": "job_id",
                "color": "#4DD0E1",
                "clickable": true,
                "pattern": "job_id=(\\S+)",
                "description": "Background job identifier"
            }
        ]
    }
    """
    try:
        fields = console_field_registry.get_all()
        return {"fields": fields}
    except Exception as e:
        logger.error("console_fields_error", error=str(e), error_type=e.__class__.__name__, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get console fields: {str(e)}")
