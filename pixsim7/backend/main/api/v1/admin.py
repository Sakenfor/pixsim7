"""
Admin/Service Management API endpoints

Provides monitoring and management capabilities:
- Service status (API, worker, database, Redis)
- Log viewing and filtering
- System metrics
- Service control
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from pydantic import BaseModel, Field
import os
import json
import re
from pathlib import Path

logger = logging.getLogger(__name__)

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, DatabaseSession
from pixsim7.backend.main.infrastructure.redis import check_redis_connection, get_redis
from pixsim7.backend.main.shared.path_registry import get_path_registry

router = APIRouter()


# ===== HELPER FUNCTIONS =====

def analyze_api_routes(app) -> Dict[str, Any]:
    """
    Analyze FastAPI app routes and return statistics

    Returns:
        - total: Total endpoint count
        - by_method: Breakdown by HTTP method
        - by_tag: Breakdown by router/tag
        - protected: Count of authenticated endpoints
        - public: Count of public endpoints
    """
    from fastapi.routing import APIRoute
    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_current_admin_user,
        get_current_codegen_user,
    )

    total = 0
    by_method = {}
    by_tag = {}
    protected = 0
    public = 0

    for route in app.routes:
        if isinstance(route, APIRoute):
            # Count each method separately
            for method in route.methods:
                if method == "HEAD":
                    continue  # Skip HEAD methods

                total += 1

                # Count by method
                by_method[method] = by_method.get(method, 0) + 1

                # Count by tag
                for tag in route.tags:
                    by_tag[tag] = by_tag.get(tag, 0) + 1

                # Check if protected (has authentication dependency)
                is_protected = False
                if route.dependant and route.dependant.dependencies:
                    for dep in route.dependant.dependencies:
                        dep_call = getattr(dep, 'call', None)
                        if dep_call in (get_current_user, get_current_admin_user, get_current_codegen_user):
                            is_protected = True
                            break

                if is_protected:
                    protected += 1
                else:
                    public += 1

    return {
        "total": total,
        "by_method": dict(sorted(by_method.items(), key=lambda x: x[1], reverse=True)),
        "by_tag": dict(sorted(by_tag.items(), key=lambda x: x[1], reverse=True)),
        "protected": protected,
        "public": public,
    }


# ===== RESPONSE SCHEMAS =====

class ServiceStatus(BaseModel):
    """Service status information"""
    name: str
    status: str  # "running", "stopped", "error", "unknown"
    healthy: bool
    uptime_seconds: float | None = None
    last_check: datetime
    details: Dict[str, Any] = {}


class SystemMetrics(BaseModel):
    """System resource metrics"""
    timestamp: datetime
    cpu_percent: float | None = None
    memory_used_mb: float | None = None
    memory_total_mb: float | None = None
    memory_percent: float | None = None
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    disk_percent: float | None = None


class EventHandlerStats(BaseModel):
    """Registered event handler counts."""
    registered_event_types: int
    wildcard_handlers: int


class EventMetricSnapshot(BaseModel):
    """Event processing metrics snapshot."""
    total_events: int = 0
    by_type: Dict[str, int] = Field(default_factory=dict)
    unique_types: int = 0


class EventMetricsResponse(BaseModel):
    """Admin event metrics response."""
    timestamp: datetime | None = None
    handlers: EventHandlerStats | None = None
    metrics: EventMetricSnapshot | None = None
    error: str | None = None
    error_type: str | None = None


class LogEntry(BaseModel):
    """Log entry"""
    timestamp: datetime
    level: str
    logger: str
    message: str
    module: str | None = None
    function: str | None = None
    line: int | None = None
    user_id: int | None = None
    job_id: int | None = None
    exception: str | None = None


class LogQueryResponse(BaseModel):
    """Log query response with pagination"""
    logs: List[LogEntry]
    total: int
    limit: int
    offset: int
    filters: Dict[str, Any]


# ===== SERVICE STATUS =====

@router.get("/admin/services/status", response_model=List[ServiceStatus])
async def get_services_status(admin: CurrentAdminUser):
    """
    Get status of all services

    Returns health status for:
    - API server
    - ARQ worker
    - PostgreSQL
    - Redis
    """
    from fastapi import Request
    from pixsim7.backend.main.shared.config import settings

    services = []
    now = datetime.now(timezone.utc)

    # Get app instance to analyze routes
    # Note: We need to import the app from main
    try:
        from pixsim7.backend.main.main import app
        route_stats = analyze_api_routes(app)
    except Exception:
        # Fallback if analysis fails
        route_stats = {"total": "unknown"}

    # API Server (always running if you can call this endpoint)
    services.append(ServiceStatus(
        name="api",
        status="running",
        healthy=True,
        last_check=now,
        details={
            "version": settings.api_version,
            "endpoints": route_stats.get("total", "unknown"),
            "by_method": route_stats.get("by_method", {}),
            "by_router": route_stats.get("by_tag", {}),
            "protected": route_stats.get("protected", "unknown"),
            "public": route_stats.get("public", "unknown"),
        }
    ))

    # PostgreSQL
    try:
        from pixsim7.backend.main.infrastructure.database.session import get_db
        async for db in get_db():
            await db.execute("SELECT 1")
            services.append(ServiceStatus(
                name="postgres",
                status="running",
                healthy=True,
                last_check=now,
                details={"database": "pixsim7"}
            ))
            break
    except Exception as e:
        services.append(ServiceStatus(
            name="postgres",
            status="error",
            healthy=False,
            last_check=now,
            details={"error": str(e)}
        ))

    # Redis
    try:
        redis_healthy = await check_redis_connection()
        redis = await get_redis()
        info = await redis.info()

        services.append(ServiceStatus(
            name="redis",
            status="running" if redis_healthy else "error",
            healthy=redis_healthy,
            uptime_seconds=info.get("uptime_in_seconds"),
            last_check=now,
            details={
                "version": info.get("redis_version"),
                "connected_clients": info.get("connected_clients"),
                "used_memory_mb": info.get("used_memory") / 1024 / 1024 if info.get("used_memory") else None,
            }
        ))
    except Exception as e:
        services.append(ServiceStatus(
            name="redis",
            status="error",
            healthy=False,
            last_check=now,
            details={"error": str(e)}
        ))

    # ARQ Worker (comprehensive health check)
    try:
        from pixsim7.backend.main.workers.health import get_worker_health, get_queue_stats
        # Get worker heartbeat data
        worker_health = await get_worker_health()

        # Get queue statistics
        queue_stats = await get_queue_stats()

        if worker_health:
            # Worker is running and healthy
            # Calculate time since last heartbeat
            heartbeat_time = datetime.fromisoformat(worker_health["timestamp"])
            time_since_heartbeat = (datetime.now(timezone.utc) - heartbeat_time).total_seconds()

            services.append(ServiceStatus(
                name="worker",
                status="running",
                healthy=time_since_heartbeat < 120,  # Healthy if heartbeat within 2 minutes
                uptime_seconds=worker_health.get("uptime_seconds"),
                last_check=now,
                details={
                    "hostname": worker_health.get("hostname"),
                    "python_version": worker_health.get("python_version"),
                    "platform": worker_health.get("platform"),
                    "processed_jobs": worker_health.get("processed_jobs", 0),
                    "failed_jobs": worker_health.get("failed_jobs", 0),
                    "success_rate": f"{worker_health.get('success_rate', 1.0) * 100:.1f}%",
                    "memory_mb": round(worker_health.get("memory_mb", 0), 2),
                    "cpu_percent": round(worker_health.get("cpu_percent", 0), 2),
                    "queue_pending": queue_stats.get("pending", 0),
                    "queue_in_progress": queue_stats.get("in_progress", 0),
                    "queue_completed_recent": queue_stats.get("completed_recent", 0),
                    "last_heartbeat": worker_health["timestamp"],
                    "seconds_since_heartbeat": round(time_since_heartbeat, 1),
                }
            ))
        else:
            # No heartbeat - worker is down
            services.append(ServiceStatus(
                name="worker",
                status="stopped",
                healthy=False,
                last_check=now,
                details={
                    "error": "No heartbeat detected",
                    "queue_pending": queue_stats.get("pending", 0),
                    "queue_in_progress": queue_stats.get("in_progress", 0),
                    "note": "Worker appears to be offline. Check if ARQ worker is running."
                }
            ))

    except Exception as e:
        services.append(ServiceStatus(
            name="worker",
            status="error",
            healthy=False,
            last_check=now,
            details={"error": str(e), "error_type": e.__class__.__name__}
        ))

    return services


# ===== SYSTEM METRICS =====

@router.get("/admin/system/metrics", response_model=SystemMetrics)
async def get_system_metrics(admin: CurrentAdminUser):
    """
    Get system resource metrics

    Returns CPU, memory, disk usage
    """
    metrics = SystemMetrics(timestamp=datetime.now(timezone.utc))

    try:
        import psutil

        # CPU
        metrics.cpu_percent = psutil.cpu_percent(interval=0.1)

        # Memory
        memory = psutil.virtual_memory()
        metrics.memory_used_mb = memory.used / 1024 / 1024
        metrics.memory_total_mb = memory.total / 1024 / 1024
        metrics.memory_percent = memory.percent

        # Disk
        disk = psutil.disk_usage('/')
        metrics.disk_used_gb = disk.used / 1024 / 1024 / 1024
        metrics.disk_total_gb = disk.total / 1024 / 1024 / 1024
        metrics.disk_percent = disk.percent

    except ImportError:
        # psutil not installed
        pass
    except Exception as e:
        # Error getting metrics
        pass

    return metrics


# ===== EVENT METRICS =====

@router.get("/admin/events/metrics", response_model=EventMetricsResponse)
async def get_event_metrics(admin: CurrentAdminUser):
    """
    Get event processing metrics

    Returns statistics about domain events:
    - Total events processed
    - Breakdown by event type
    - Handler registration info
    """
    try:
        from pixsim7.backend.main.infrastructure.events.handlers import get_handler_stats

        stats = get_handler_stats()

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "handlers": {
                "registered_event_types": stats["registered_event_types"],
                "wildcard_handlers": stats["wildcard_handlers"],
            },
            "metrics": stats["event_metrics"],
        }
    except Exception as e:
        return {
            "error": str(e),
            "error_type": e.__class__.__name__,
        }


# ===== LOG MANAGEMENT =====

@router.get("/admin/logs", response_model=LogQueryResponse)
async def get_logs(
    admin: CurrentAdminUser,
    level: str | None = Query(None, description="Filter by level (DEBUG, INFO, WARNING, ERROR)"),
    logger: str | None = Query(None, description="Filter by logger name"),
    search: str | None = Query(None, description="Search in message"),
    user_id: int | None = Query(None, description="Filter by user_id"),
    job_id: int | None = Query(None, description="Filter by job_id"),
    since: datetime | None = Query(None, description="Logs since this time"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """
    Query logs with filtering

    Reads from JSON log file and filters based on criteria.
    Supports pagination and multiple filter conditions.
    """
    log_file = os.getenv("LOG_FILE", str(get_path_registry().logs_root / "backend.log"))
    log_path = Path(log_file)

    logs: List[LogEntry] = []

    if not log_path.exists():
        return LogQueryResponse(
            logs=[],
            total=0,
            limit=limit,
            offset=offset,
            filters={}
        )

    # ANSI to HTML converter (moved outside loop for efficiency)
    def ansi_to_html(text):
        if not text or not isinstance(text, str):
            return text

        # ANSI color code mapping
        colors = {
            '30': '#6272a4', '31': '#ff5555', '32': '#50fa7b', '33': '#f1fa8c',
            '34': '#bd93f9', '35': '#ff79c6', '36': '#8be9fd', '37': '#f8f8f2',
            '90': '#6272a4', '91': '#ff6e6e', '92': '#69ff94', '93': '#ffffa5',
            '94': '#d6acff', '95': '#ff92df', '96': '#a4ffff', '97': '#ffffff',
        }

        # Replace color codes with HTML spans
        for code, color in colors.items():
            text = text.replace(f'\x1b[{code}m', f'<span style="color: {color}">')
            text = text.replace(f'\\u001b[{code}m', f'<span style="color: {color}">')

        # Replace reset codes
        text = text.replace('\x1b[0m', '</span>')
        text = text.replace('\\u001b[0m', '</span>')
        text = text.replace('\x1b[m', '</span>')

        # Remove any remaining ANSI codes
        text = re.sub(r'\\u001b\[[0-9;]*m', '', text)
        text = re.sub(r'\x1b\[[0-9;]*m', '', text)

        return text

    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    log_data = json.loads(line)

                    # Apply filters (strip ANSI codes from level for comparison)
                    log_level = log_data.get("level", "")
                    # Remove ANSI codes for filter comparison
                    clean_level = re.sub(r'\\u001b\[[0-9;]*m', '', log_level)
                    clean_level = re.sub(r'\x1b\[[0-9;]*m', '', clean_level)

                    if level and clean_level != level:
                        continue

                    if logger and logger not in log_data.get("logger", ""):
                        continue

                    if search and search.lower() not in log_data.get("message", "").lower():
                        continue

                    if user_id and log_data.get("user_id") != user_id:
                        continue

                    if job_id and log_data.get("job_id") != job_id:
                        continue

                    if since:
                        log_time = datetime.fromisoformat(log_data["timestamp"].replace("Z", "+00:00"))
                        if log_time < since:
                            continue

                    # Create LogEntry (ANSI codes will be converted)
                    logs.append(LogEntry(
                        timestamp=datetime.fromisoformat(log_data["timestamp"].replace("Z", "+00:00")),
                        level=ansi_to_html(log_data.get("level", "INFO")),
                        logger=ansi_to_html(log_data.get("logger", "unknown")),
                        message=ansi_to_html(log_data.get("message", "")),
                        module=log_data.get("module"),
                        function=log_data.get("function"),
                        line=log_data.get("line"),
                        user_id=log_data.get("user_id"),
                        job_id=log_data.get("job_id"),
                        exception=log_data.get("exception")
                    ))

                except json.JSONDecodeError:
                    # Skip invalid JSON lines
                    continue
                except Exception as e:
                    # Skip any problematic log entries
                    import logging as log
                    log.warning(f"Failed to parse log entry: {e}")
                    continue

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading logs: {str(e)}")

    # Pagination
    total = len(logs)
    logs = logs[offset:offset + limit]

    return LogQueryResponse(
        logs=logs,
        total=total,
        limit=limit,
        offset=offset,
        filters={
            "level": level,
            "logger": logger,
            "search": search,
            "user_id": user_id,
            "job_id": job_id,
            "since": since.isoformat() if since else None,
        }
    )


# ===== LOG STREAMING (WebSocket) =====

@router.websocket("/admin/logs/stream")
async def stream_logs(websocket):
    """
    Stream logs in real-time via WebSocket

    Connect to this endpoint to receive logs as they're written.
    Sends new log entries as JSON.
    """
    from fastapi import WebSocketDisconnect
    import asyncio

    await websocket.accept()

    log_file = os.getenv("LOG_FILE", str(get_path_registry().logs_root / "backend.log"))
    log_path = Path(log_file)

    # Send connection success
    await websocket.send_json({
        "type": "connected",
        "message": "Live tail connected",
        "file": str(log_path)
    })

    try:
        # Get initial file size
        if not log_path.exists():
            await websocket.send_json({
                "type": "error",
                "message": "Log file not found"
            })
            return

        file_size = log_path.stat().st_size

        # Tail the log file
        with open(log_path, 'r', encoding='utf-8') as f:
            # Start from end of file
            f.seek(file_size)

            while True:
                # Check for new lines
                line = f.readline()

                if line:
                    # Parse and send the log entry
                    try:
                        log_data = json.loads(line.strip())

                        # Convert ANSI codes to HTML
                        entry = LogEntry(
                            timestamp=datetime.fromisoformat(log_data["timestamp"].replace("Z", "+00:00")),
                            level=ansi_to_html(log_data.get("level", "INFO")),
                            logger=ansi_to_html(log_data.get("logger", "unknown")),
                            message=ansi_to_html(log_data.get("message", "")),
                            module=log_data.get("module"),
                            function=log_data.get("function"),
                            line=log_data.get("line"),
                            user_id=log_data.get("user_id"),
                            job_id=log_data.get("job_id"),
                            exception=log_data.get("exception")
                        )

                        # Send to client
                        await websocket.send_json({
                            "type": "log",
                            "data": entry.dict()
                        })
                    except json.JSONDecodeError:
                        # Skip invalid JSON (common in log files, not worth logging)
                        pass
                    except Exception as e:
                        # Log but don't crash - continue streaming other entries
                        logger.debug("Error processing log entry: %s", e)
                else:
                    # No new data, wait a bit
                    await asyncio.sleep(0.5)

                # Check if client sent anything (ping/close)
                try:
                    msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                    if msg == "ping":
                        await websocket.send_json({"type": "pong"})
                except asyncio.TimeoutError:
                    pass

    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected")
    except Exception as e:
        logger.warning("WebSocket log stream error: %s", e)
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except Exception:
            # Client already disconnected, can't send error
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            # Already closed or failed to close - nothing we can do
            pass


# ===== GENERATION CONFIG (RATE LIMITS & RETRY) =====

class GenerationConfigResponse(BaseModel):
    """Current generation config (rate limits, retry, per-user caps)."""
    rate_limit_max_requests: int
    rate_limit_window_seconds: int
    login_rate_limit_max_requests: int
    login_rate_limit_window_seconds: int
    auto_retry_enabled: bool
    auto_retry_max_attempts: int
    max_jobs_per_user: int
    max_accounts_per_user: int


class GenerationConfigUpdate(BaseModel):
    """Partial update for generation config."""
    rate_limit_max_requests: int | None = Field(None, ge=1, le=100)
    rate_limit_window_seconds: int | None = Field(None, ge=10, le=3600)
    login_rate_limit_max_requests: int | None = Field(None, ge=1, le=100)
    login_rate_limit_window_seconds: int | None = Field(None, ge=10, le=3600)
    auto_retry_enabled: bool | None = None
    auto_retry_max_attempts: int | None = Field(None, ge=1, le=50)
    max_jobs_per_user: int | None = Field(None, ge=1, le=100)
    max_accounts_per_user: int | None = Field(None, ge=1, le=50)


@router.get("/admin/generation/config", response_model=GenerationConfigResponse)
async def get_generation_config(user: CurrentUser):
    """Get current generation config (any authenticated user)."""
    from pixsim7.backend.main.shared.config import settings
    from pixsim7.backend.main.shared.rate_limit import job_create_limiter, login_limiter

    return GenerationConfigResponse(
        rate_limit_max_requests=job_create_limiter.max_requests,
        rate_limit_window_seconds=job_create_limiter.window_seconds,
        login_rate_limit_max_requests=login_limiter.max_requests,
        login_rate_limit_window_seconds=login_limiter.window_seconds,
        auto_retry_enabled=settings.auto_retry_enabled,
        auto_retry_max_attempts=settings.auto_retry_max_attempts,
        max_jobs_per_user=settings.max_jobs_per_user,
        max_accounts_per_user=settings.max_accounts_per_user,
    )


@router.patch("/admin/generation/config", response_model=GenerationConfigResponse)
async def update_generation_config(
    body: GenerationConfigUpdate,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Update generation config (admin only, persisted)."""
    from pixsim7.backend.main.shared.config import settings
    from pixsim7.backend.main.shared.rate_limit import job_create_limiter, login_limiter
    from pixsim7.backend.main.services.system_config import patch_config, apply_namespace

    patch_data = body.model_dump(exclude_none=True)
    if patch_data:
        row = await patch_config(db, "generation", patch_data, admin.id)
        apply_namespace("generation", row.data)

    logger.info(
        "Generation config updated by admin %s: rate_limit=%d/%ds, login=%d/%ds, "
        "auto_retry=%s/%d, jobs=%d, accounts=%d",
        admin.username,
        job_create_limiter.max_requests,
        job_create_limiter.window_seconds,
        login_limiter.max_requests,
        login_limiter.window_seconds,
        settings.auto_retry_enabled,
        settings.auto_retry_max_attempts,
        settings.max_jobs_per_user,
        settings.max_accounts_per_user,
    )

    return GenerationConfigResponse(
        rate_limit_max_requests=job_create_limiter.max_requests,
        rate_limit_window_seconds=job_create_limiter.window_seconds,
        login_rate_limit_max_requests=login_limiter.max_requests,
        login_rate_limit_window_seconds=login_limiter.window_seconds,
        auto_retry_enabled=settings.auto_retry_enabled,
        auto_retry_max_attempts=settings.auto_retry_max_attempts,
        max_jobs_per_user=settings.max_jobs_per_user,
        max_accounts_per_user=settings.max_accounts_per_user,
    )


# ===== GENERATION WORKER CONFIG (RUNTIME BACKOFF / DISPATCH) =====

class GenerationWorkerConfigResponse(BaseModel):
    """Current generation worker runtime config (backoff/dispatch tuning)."""
    arq_max_jobs: int
    content_filter_submit_max_retries: int
    content_filter_rotate_after_retries: int
    content_filter_pinned_yield_after_retries: int
    content_filter_retry_defer_seconds: int
    content_filter_pinned_yield_defer_multiplier: int
    content_filter_yield_counts_as_retry: bool
    content_filter_max_yields: int
    content_filter_yield_counter_ttl_seconds: int
    pixverse_concurrent_cooldown_seconds: int
    pixverse_i2i_concurrent_cooldown_seconds: int
    dispatch_stagger_per_slot_seconds: float
    dispatch_stagger_max_seconds: float
    pinned_wait_padding_seconds: int
    min_pinned_cooldown_defer_seconds: int
    adaptive_provider_concurrency_enabled: bool
    adaptive_provider_concurrency_state_ttl_seconds: int
    adaptive_provider_concurrency_probe_min_seconds: int
    adaptive_provider_concurrency_probe_max_seconds: int
    adaptive_provider_concurrency_probe_lock_ttl_seconds: int
    adaptive_provider_concurrency_defer_jitter_max_seconds: int
    adaptive_provider_concurrency_lower_after_consecutive_rejects: int
    adaptive_provider_concurrency_raise_after_consecutive_probe_successes: int
    max_pinned_concurrent_waits: int
    pinned_concurrent_wait_counter_ttl_seconds: int


class GenerationWorkerConfigUpdate(BaseModel):
    """Partial update for generation worker runtime config."""
    arq_max_jobs: int | None = Field(None, ge=1, le=100)
    content_filter_submit_max_retries: int | None = Field(None, ge=1, le=20)
    content_filter_rotate_after_retries: int | None = Field(None, ge=0, le=20)
    content_filter_pinned_yield_after_retries: int | None = Field(None, ge=0, le=20)
    content_filter_retry_defer_seconds: int | None = Field(None, ge=1, le=600)
    content_filter_pinned_yield_defer_multiplier: int | None = Field(None, ge=1, le=20)
    content_filter_yield_counts_as_retry: bool | None = None
    content_filter_max_yields: int | None = Field(None, ge=0, le=200)
    content_filter_yield_counter_ttl_seconds: int | None = Field(None, ge=60, le=2592000)
    pixverse_concurrent_cooldown_seconds: int | None = Field(None, ge=1, le=600)
    pixverse_i2i_concurrent_cooldown_seconds: int | None = Field(None, ge=1, le=600)
    dispatch_stagger_per_slot_seconds: float | None = Field(None, ge=0.0, le=30.0)
    dispatch_stagger_max_seconds: float | None = Field(None, ge=0.0, le=300.0)
    pinned_wait_padding_seconds: int | None = Field(None, ge=0, le=60)
    min_pinned_cooldown_defer_seconds: int | None = Field(None, ge=1, le=300)
    adaptive_provider_concurrency_enabled: bool | None = None
    adaptive_provider_concurrency_state_ttl_seconds: int | None = Field(None, ge=60, le=604800)
    adaptive_provider_concurrency_probe_min_seconds: int | None = Field(None, ge=30, le=3600)
    adaptive_provider_concurrency_probe_max_seconds: int | None = Field(None, ge=30, le=3600)
    adaptive_provider_concurrency_probe_lock_ttl_seconds: int | None = Field(None, ge=30, le=3600)
    adaptive_provider_concurrency_defer_jitter_max_seconds: int | None = Field(None, ge=0, le=120)
    adaptive_provider_concurrency_lower_after_consecutive_rejects: int | None = Field(None, ge=1, le=1000)
    adaptive_provider_concurrency_raise_after_consecutive_probe_successes: int | None = Field(None, ge=1, le=1000)
    max_pinned_concurrent_waits: int | None = Field(None, ge=1, le=10000)
    pinned_concurrent_wait_counter_ttl_seconds: int | None = Field(None, ge=60, le=2592000)


def _generation_worker_config_response_from_settings():
    from pixsim7.backend.main.shared.config import settings

    return GenerationWorkerConfigResponse(
        arq_max_jobs=settings.arq_max_jobs,
        content_filter_submit_max_retries=settings.content_filter_submit_max_retries,
        content_filter_rotate_after_retries=settings.content_filter_rotate_after_retries,
        content_filter_pinned_yield_after_retries=settings.content_filter_pinned_yield_after_retries,
        content_filter_retry_defer_seconds=settings.content_filter_retry_defer_seconds,
        content_filter_pinned_yield_defer_multiplier=settings.content_filter_pinned_yield_defer_multiplier,
        content_filter_yield_counts_as_retry=settings.content_filter_yield_counts_as_retry,
        content_filter_max_yields=settings.content_filter_max_yields,
        content_filter_yield_counter_ttl_seconds=settings.content_filter_yield_counter_ttl_seconds,
        pixverse_concurrent_cooldown_seconds=settings.pixverse_concurrent_cooldown_seconds,
        pixverse_i2i_concurrent_cooldown_seconds=settings.pixverse_i2i_concurrent_cooldown_seconds,
        dispatch_stagger_per_slot_seconds=settings.dispatch_stagger_per_slot_seconds,
        dispatch_stagger_max_seconds=settings.dispatch_stagger_max_seconds,
        pinned_wait_padding_seconds=settings.pinned_wait_padding_seconds,
        min_pinned_cooldown_defer_seconds=settings.min_pinned_cooldown_defer_seconds,
        adaptive_provider_concurrency_enabled=settings.adaptive_provider_concurrency_enabled,
        adaptive_provider_concurrency_state_ttl_seconds=settings.adaptive_provider_concurrency_state_ttl_seconds,
        adaptive_provider_concurrency_probe_min_seconds=settings.adaptive_provider_concurrency_probe_min_seconds,
        adaptive_provider_concurrency_probe_max_seconds=settings.adaptive_provider_concurrency_probe_max_seconds,
        adaptive_provider_concurrency_probe_lock_ttl_seconds=settings.adaptive_provider_concurrency_probe_lock_ttl_seconds,
        adaptive_provider_concurrency_defer_jitter_max_seconds=settings.adaptive_provider_concurrency_defer_jitter_max_seconds,
        adaptive_provider_concurrency_lower_after_consecutive_rejects=settings.adaptive_provider_concurrency_lower_after_consecutive_rejects,
        adaptive_provider_concurrency_raise_after_consecutive_probe_successes=settings.adaptive_provider_concurrency_raise_after_consecutive_probe_successes,
        max_pinned_concurrent_waits=settings.max_pinned_concurrent_waits,
        pinned_concurrent_wait_counter_ttl_seconds=settings.pinned_concurrent_wait_counter_ttl_seconds,
    )


@router.get("/admin/generation-worker/config", response_model=GenerationWorkerConfigResponse)
async def get_generation_worker_config(user: CurrentUser):
    """Get generation worker runtime config (any authenticated user)."""
    return _generation_worker_config_response_from_settings()


@router.patch("/admin/generation-worker/config", response_model=GenerationWorkerConfigResponse)
async def update_generation_worker_config(
    body: GenerationWorkerConfigUpdate,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Update generation worker runtime config (admin only, persisted)."""
    from pixsim7.backend.main.shared.config import settings
    from pixsim7.backend.main.services.system_config import patch_config, apply_namespace

    patch_data = body.model_dump(exclude_none=True)
    if patch_data:
        row = await patch_config(db, "generation_worker", patch_data, admin.id)
        apply_namespace("generation_worker", row.data)

    logger.info(
        "Generation worker config updated by admin %s: cf_submit=%d cf_yields=%d pixverse_cd=%ds i2i_cd=%ds adaptive=%s probe=%d-%ds max_waits=%d",
        admin.username,
        settings.content_filter_submit_max_retries,
        settings.content_filter_max_yields,
        settings.pixverse_concurrent_cooldown_seconds,
        settings.pixverse_i2i_concurrent_cooldown_seconds,
        settings.adaptive_provider_concurrency_enabled,
        settings.adaptive_provider_concurrency_probe_min_seconds,
        settings.adaptive_provider_concurrency_probe_max_seconds,
        settings.max_pinned_concurrent_waits,
    )

    return _generation_worker_config_response_from_settings()


# ===== LLM CONFIG (CACHE TUNING) =====

class LLMConfigResponse(BaseModel):
    """Current LLM cache configuration."""
    llm_cache_enabled: bool
    llm_cache_ttl: int
    llm_cache_freshness: float


class LLMConfigUpdate(BaseModel):
    """Partial update for LLM config."""
    llm_cache_enabled: bool | None = None
    llm_cache_ttl: int | None = Field(None, ge=0, le=86400)
    llm_cache_freshness: float | None = Field(None, ge=0.0, le=1.0)


@router.get("/admin/llm/config", response_model=LLMConfigResponse)
async def get_llm_config(user: CurrentUser):
    """Get current LLM cache config (any authenticated user)."""
    from pixsim7.backend.main.shared.config import settings

    return LLMConfigResponse(
        llm_cache_enabled=settings.llm_cache_enabled,
        llm_cache_ttl=settings.llm_cache_ttl,
        llm_cache_freshness=settings.llm_cache_freshness,
    )


@router.patch("/admin/llm/config", response_model=LLMConfigResponse)
async def update_llm_config(
    body: LLMConfigUpdate,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Update LLM cache config (admin only, persisted)."""
    from pixsim7.backend.main.shared.config import settings
    from pixsim7.backend.main.services.system_config import patch_config, apply_namespace

    patch_data = body.model_dump(exclude_none=True)
    if patch_data:
        row = await patch_config(db, "llm", patch_data, admin.id)
        apply_namespace("llm", row.data)

    logger.info(
        "LLM config updated by admin %s: cache=%s, ttl=%ds, freshness=%.2f",
        admin.username,
        settings.llm_cache_enabled,
        settings.llm_cache_ttl,
        settings.llm_cache_freshness,
    )

    return LLMConfigResponse(
        llm_cache_enabled=settings.llm_cache_enabled,
        llm_cache_ttl=settings.llm_cache_ttl,
        llm_cache_freshness=settings.llm_cache_freshness,
    )


# ===== LOGGING CONFIG (DOMAIN LEVEL OVERRIDES) =====

_VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", "OFF"}


class LoggingConfigResponse(BaseModel):
    """Current per-domain log level configuration."""
    log_domain_levels: dict = Field(
        default_factory=dict,
        description="Per-domain log level overrides. Keys: generation, account, provider, cron, system. Values: DEBUG/INFO/WARNING/ERROR/OFF.",
    )


class LoggingConfigUpdate(BaseModel):
    """Partial update for logging config."""
    log_domain_levels: dict | None = Field(
        None,
        description="Per-domain log level overrides. Keys: generation, account, provider, cron, system. Values: DEBUG/INFO/WARNING/ERROR/OFF.",
    )


@router.get("/admin/logging/config", response_model=LoggingConfigResponse)
async def get_logging_config(user: CurrentUser):
    """Get current per-domain logging config (any authenticated user)."""
    from pixsim_logging.domains import get_domain_config_display

    return LoggingConfigResponse(log_domain_levels=get_domain_config_display())


@router.patch("/admin/logging/config", response_model=LoggingConfigResponse)
async def update_logging_config(
    body: LoggingConfigUpdate,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Update per-domain log level config (admin only, persisted).

    Example body::

        {"log_domain_levels": {"generation": "OFF", "account": "DEBUG"}}

    Pass an empty dict to clear all overrides.
    """
    from pixsim7.backend.main.services.system_config import patch_config, apply_namespace
    from pixsim_logging.domains import get_domain_config_display, KNOWN_DOMAINS

    patch_data = body.model_dump(exclude_none=True)
    if patch_data:
        levels = patch_data.get("log_domain_levels", {})
        # Validate keys and values
        for domain, level in levels.items():
            if domain not in KNOWN_DOMAINS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown domain '{domain}'. Valid: {sorted(KNOWN_DOMAINS)}",
                )
            if level.upper() not in _VALID_LOG_LEVELS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid level '{level}' for domain '{domain}'. Valid: {sorted(_VALID_LOG_LEVELS)}",
                )

        row = await patch_config(db, "logging", patch_data, admin.id)
        apply_namespace("logging", row.data)

    active = get_domain_config_display()
    logger.info(
        "Logging config updated by admin %s: domains=%s",
        admin.username,
        active,
    )

    return LoggingConfigResponse(log_domain_levels=active)
