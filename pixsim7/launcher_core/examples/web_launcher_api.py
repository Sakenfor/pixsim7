#!/usr/bin/env python
"""
Web Launcher API Example

Demonstrates using launcher_core managers to build a REST API.
This shows how the same core logic can power a web UI.

Usage:
    pip install fastapi uvicorn
    python web_launcher_api.py

Then visit:
    http://localhost:9000/docs  (API documentation)
    http://localhost:9000/services  (list services)

Example requests:
    POST http://localhost:9000/services/backend/start
    GET  http://localhost:9000/services/backend/status
    GET  http://localhost:9000/services/backend/logs
"""

import sys
import asyncio
from pathlib import Path
from typing import Dict, List, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from pixsim7.launcher_core import (
    ServiceDefinition,
    ProcessManager,
    HealthManager,
    LogManager,
    ProcessEvent,
    HealthEvent
)

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
except ImportError:
    print("Error: FastAPI not installed")
    print("Install with: pip install fastapi uvicorn websockets")
    sys.exit(1)


# ============================================================================
# Data Models
# ============================================================================

class ServiceStatusResponse(BaseModel):
    key: str
    title: str
    status: str
    health: str
    pid: Optional[int]
    last_error: str


class ServiceActionResponse(BaseModel):
    success: bool
    message: str


class LogsResponse(BaseModel):
    service_key: str
    lines: List[str]


# ============================================================================
# Global State
# ============================================================================

# In production, use dependency injection
_process_mgr: Optional[ProcessManager] = None
_health_mgr: Optional[HealthManager] = None
_log_mgr: Optional[LogManager] = None


def create_services():
    """Create service definitions."""
    # Import real services in production
    return [
        ServiceDefinition(
            key="backend",
            title="Backend API",
            program="python",
            args=["-m", "uvicorn", "pixsim7_backend.main:app"],
            cwd=str(Path(__file__).parent.parent.parent.parent),
            health_url="http://localhost:8000/health",
        ),
        ServiceDefinition(
            key="frontend",
            title="Frontend (React)",
            program="pnpm",
            args=["dev", "--port", "3000"],
            cwd=str(Path(__file__).parent.parent.parent.parent / "frontend"),
            health_url="http://localhost:3000/",
        )
    ]


def init_managers():
    """Initialize managers on startup."""
    global _process_mgr, _health_mgr, _log_mgr

    services = create_services()

    _process_mgr = ProcessManager(services)
    _health_mgr = HealthManager(
        _process_mgr.states,
        interval_sec=2.0,
        adaptive_enabled=True
    )
    _log_mgr = LogManager(_process_mgr.states)

    # Start monitoring
    _health_mgr.start()
    _log_mgr.start_monitoring()


def cleanup_managers():
    """Cleanup on shutdown."""
    if _health_mgr:
        _health_mgr.stop()
    if _log_mgr:
        _log_mgr.stop_monitoring()
    if _process_mgr:
        _process_mgr.cleanup()


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="PixSim7 Launcher API",
    description="REST API for managing PixSim7 services using launcher_core",
    version="1.0.0"
)


@app.on_event("startup")
async def startup_event():
    """Initialize managers when API starts."""
    init_managers()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup when API stops."""
    cleanup_managers()


# ============================================================================
# Service Management Endpoints
# ============================================================================

@app.get("/services", response_model=List[ServiceStatusResponse])
async def list_services():
    """List all services and their status."""
    if not _process_mgr:
        raise HTTPException(500, "Process manager not initialized")

    services = []
    for key, state in _process_mgr.get_all_states().items():
        services.append(ServiceStatusResponse(
            key=key,
            title=state.definition.title,
            status=state.status.value,
            health=state.health.value,
            pid=state.pid,
            last_error=state.last_error
        ))

    return services


@app.get("/services/{service_key}/status", response_model=ServiceStatusResponse)
async def get_service_status(service_key: str):
    """Get status of a specific service."""
    if not _process_mgr:
        raise HTTPException(500, "Process manager not initialized")

    state = _process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(404, f"Service '{service_key}' not found")

    return ServiceStatusResponse(
        key=service_key,
        title=state.definition.title,
        status=state.status.value,
        health=state.health.value,
        pid=state.pid,
        last_error=state.last_error
    )


@app.post("/services/{service_key}/start", response_model=ServiceActionResponse)
async def start_service(service_key: str):
    """Start a service."""
    if not _process_mgr:
        raise HTTPException(500, "Process manager not initialized")

    success = _process_mgr.start(service_key)

    if success:
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' started"
        )
    else:
        state = _process_mgr.get_state(service_key)
        return ServiceActionResponse(
            success=False,
            message=state.last_error if state else "Unknown error"
        )


@app.post("/services/{service_key}/stop", response_model=ServiceActionResponse)
async def stop_service(service_key: str, graceful: bool = True):
    """Stop a service."""
    if not _process_mgr:
        raise HTTPException(500, "Process manager not initialized")

    success = _process_mgr.stop(service_key, graceful=graceful)

    if success:
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' stopped"
        )
    else:
        state = _process_mgr.get_state(service_key)
        return ServiceActionResponse(
            success=False,
            message=state.last_error if state else "Unknown error"
        )


@app.post("/services/{service_key}/restart", response_model=ServiceActionResponse)
async def restart_service(service_key: str):
    """Restart a service."""
    if not _process_mgr:
        raise HTTPException(500, "Process manager not initialized")

    success = _process_mgr.restart(service_key)

    if success:
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' restarted"
        )
    else:
        state = _process_mgr.get_state(service_key)
        return ServiceActionResponse(
            success=False,
            message=state.last_error if state else "Unknown error"
        )


# ============================================================================
# Log Endpoints
# ============================================================================

@app.get("/services/{service_key}/logs", response_model=LogsResponse)
async def get_service_logs(
    service_key: str,
    tail: int = 100,
    filter_text: Optional[str] = None,
    filter_level: Optional[str] = None
):
    """Get logs for a service."""
    if not _log_mgr:
        raise HTTPException(500, "Log manager not initialized")

    logs = _log_mgr.get_logs(
        service_key,
        filter_text=filter_text,
        filter_level=filter_level,
        max_lines=tail
    )

    return LogsResponse(
        service_key=service_key,
        lines=logs
    )


@app.delete("/services/{service_key}/logs")
async def clear_service_logs(service_key: str):
    """Clear logs for a service."""
    if not _log_mgr:
        raise HTTPException(500, "Log manager not initialized")

    _log_mgr.clear_logs(service_key)

    return {"message": f"Logs cleared for '{service_key}'"}


@app.websocket("/ws/logs/{service_key}")
async def websocket_logs(websocket: WebSocket, service_key: str):
    """Stream logs via WebSocket."""
    await websocket.accept()

    if not _log_mgr:
        await websocket.close(code=1011, reason="Log manager not initialized")
        return

    # Store original callback
    original_callback = _log_mgr.log_callback

    # Create new callback that sends to websocket
    async def send_to_websocket(key: str, line: str):
        if key == service_key:
            try:
                await websocket.send_text(line)
            except Exception:
                pass

        # Call original callback if exists
        if original_callback:
            original_callback(key, line)

    # Set our callback
    _log_mgr.log_callback = lambda k, l: asyncio.create_task(send_to_websocket(k, l))

    try:
        # Keep connection alive
        while True:
            # Wait for client messages (ping/pong)
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        # Restore original callback
        _log_mgr.log_callback = original_callback


# ============================================================================
# Health Endpoints
# ============================================================================

@app.get("/health")
async def api_health():
    """Health check for the API itself."""
    return {
        "status": "healthy",
        "managers": {
            "process": _process_mgr is not None,
            "health": _health_mgr is not None and _health_mgr.is_running(),
            "log": _log_mgr is not None and _log_mgr.is_monitoring()
        }
    }


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    print("=" * 60)
    print("PixSim7 Launcher Web API")
    print("=" * 60)
    print("")
    print("Starting API server on http://localhost:9000")
    print("")
    print("API Documentation: http://localhost:9000/docs")
    print("Service List:      http://localhost:9000/services")
    print("")
    print("Example curl commands:")
    print("  # List services")
    print("  curl http://localhost:9000/services")
    print("")
    print("  # Start backend")
    print("  curl -X POST http://localhost:9000/services/backend/start")
    print("")
    print("  # Get logs")
    print("  curl http://localhost:9000/services/backend/logs?tail=20")
    print("")
    print("=" * 60)

    uvicorn.run(app, host="0.0.0.0", port=9000)
