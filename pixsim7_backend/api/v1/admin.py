"""
Admin/Service Management API endpoints

Provides monitoring and management capabilities:
- Service status (API, worker, database, Redis)
- Log viewing and filtering
- System metrics
- Service control
"""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import List, Dict, Any
from pydantic import BaseModel
import os
import json
import re
from pathlib import Path

from pixsim7_backend.api.dependencies import CurrentAdminUser
from pixsim7_backend.infrastructure.redis import check_redis_connection, get_redis

router = APIRouter()


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
    services = []
    now = datetime.utcnow()

    # API Server (always running if you can call this endpoint)
    services.append(ServiceStatus(
        name="api",
        status="running",
        healthy=True,
        last_check=now,
        details={
            "version": "0.1.0",
            "endpoints": 20,  # TODO: Count actual endpoints
        }
    ))

    # PostgreSQL
    try:
        from pixsim7_backend.infrastructure.database.session import get_db
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

    # ARQ Worker (check via Redis queue)
    try:
        redis = await get_redis()
        # Check if worker has processed jobs recently
        worker_key = "arq:health"
        worker_health = await redis.get(worker_key)

        # TODO: Implement proper worker health check
        services.append(ServiceStatus(
            name="worker",
            status="unknown",  # Need better health check
            healthy=True,  # Assume healthy if Redis is up
            last_check=now,
            details={
                "queue_length": 0,  # TODO: Get actual queue length
                "note": "Worker health check not fully implemented"
            }
        ))
    except Exception as e:
        services.append(ServiceStatus(
            name="worker",
            status="unknown",
            healthy=False,
            last_check=now,
            details={"error": str(e)}
        ))

    return services


# ===== SYSTEM METRICS =====

@router.get("/admin/system/metrics", response_model=SystemMetrics)
async def get_system_metrics(admin: CurrentAdminUser):
    """
    Get system resource metrics

    Returns CPU, memory, disk usage
    """
    metrics = SystemMetrics(timestamp=datetime.utcnow())

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
    log_file = os.getenv("LOG_FILE", "data/logs/backend.log")
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

    log_file = os.getenv("LOG_FILE", "data/logs/backend.log")
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
                        # Skip invalid JSON
                        pass
                    except Exception as e:
                        # Skip problematic entries
                        pass
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
        pass
    except Exception as e:
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
