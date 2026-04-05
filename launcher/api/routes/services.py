"""
Service Routes - Endpoints for managing services.

Provides REST API for starting, stopping, and querying services.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Body
from typing import List

from pixsim_logging import get_logger

from launcher.core import ProcessManager, HealthManager
from launcher.core.launcher_settings import load_launcher_settings
from launcher.core.types import ServiceStatus, HealthStatus

from ..models import (
    ServiceStateResponse,
    ServiceDefinitionResponse,
    ServiceActionRequest,
    ServiceActionResponse,
    ServicesListResponse,
    ServiceStatusEnum,
    HealthStatusEnum
)
from ..dependencies import get_process_manager, get_health_manager


router = APIRouter(prefix="/services", tags=["services"])


def _enrich_mcp_tool_options(schema: list[dict]) -> list[dict]:
    """Replace static mcp_approval_tools options with live grouped tool data from the MCP server."""
    from pathlib import Path as _Path
    import json as _json

    try:
        mcp_file = _Path.home() / ".pixsim" / "mcp_port"
        if not mcp_file.exists():
            return schema
        port = int(mcp_file.read_text().strip())
    except Exception:
        return schema

    try:
        import urllib.request
        resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/tools", timeout=3)
        data = _json.loads(resp.read())
        raw_tools = data.get("tools", [])
    except Exception:
        return schema

    if not raw_tools:
        return schema

    # Filter out built-in tools that aren't meaningful for approval
    skip = {"register_session", "log_work", "call_api"}

    # Build grouped structure: [{group, label, tools: [{name, short_name, description}]}]
    from collections import OrderedDict
    groups: OrderedDict[str, list[dict]] = OrderedDict()
    for t in raw_tools:
        if t["short_name"] in skip:
            continue
        group = t.get("group", "other")
        groups.setdefault(group, []).append({
            "name": t["short_name"],
            "description": t.get("description", ""),
        })

    option_groups = [
        {"group": g, "label": g.replace("_", " ").title(), "tools": tools}
        for g, tools in groups.items()
    ]
    flat_options = [t["short_name"] for t in raw_tools if t["short_name"] not in skip]

    # Enrich the field with both flat options (for value storage) and grouped options (for UI)
    return [
        {**f, "options": sorted(set(flat_options)), "option_groups": option_groups}
        if f.get("key") == "mcp_approval_tools" else f
        for f in schema
    ]


def _read_ai_client_extras() -> dict | None:
    """Read hook + MCP server ports from well-known files (written by bridge)."""
    from pathlib import Path
    extras: dict = {}
    try:
        hook_file = Path.home() / ".pixsim" / "hook_port"
        if hook_file.exists():
            extras["hook_port"] = int(hook_file.read_text().strip())
    except Exception:
        pass
    try:
        mcp_file = Path.home() / ".pixsim" / "mcp_port"
        if mcp_file.exists():
            extras["mcp_port"] = int(mcp_file.read_text().strip())
    except Exception:
        pass
    return extras or None


def _infer_category(service_key: str) -> str:
    """Derive a category from the service key when not explicitly set."""
    if service_key.startswith("launcher"):
        return "launcher"
    if service_key in ("db",):
        return "core"
    if "worker" in service_key:
        return "services"
    if "frontend" in service_key or "admin" in service_key or service_key in ("devtools",):
        return "apps"
    return "core"


def map_service_status(status: ServiceStatus) -> ServiceStatusEnum:
    """Map core ServiceStatus to API enum."""
    return ServiceStatusEnum(status.value)


def map_health_status(status: HealthStatus) -> HealthStatusEnum:
    """Map core HealthStatus to API enum."""
    return HealthStatusEnum(status.value)


@router.get("", response_model=ServicesListResponse)
async def list_services(
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    List all services and their current state.

    Returns:
        List of all services with status, health, PID, etc.
    """
    states = process_mgr.get_all_states()

    services = []
    for key, state in states.items():
        status = map_service_status(state.status)
        health = map_health_status(state.health)
        pid = state.pid or state.detected_pid

        # Self-detection: launcher-api is always running if we're serving this response
        if key == "launcher-api" and status == ServiceStatusEnum.STOPPED:
            import os
            status = ServiceStatusEnum.RUNNING
            health = HealthStatusEnum.HEALTHY
            pid = pid or os.getpid()

        extras = None
        if key == "ai-client" and health == HealthStatusEnum.HEALTHY:
            extras = _read_ai_client_extras()

        services.append(ServiceStateResponse(
            key=key,
            title=state.definition.title,
            status=status,
            health=health,
            pid=pid,
            last_error=state.last_error,
            tool_available=state.tool_available,
            tool_check_message=state.tool_check_message,
            url=getattr(state.definition, 'url', None),
            dev_peer_of=getattr(state.definition, 'dev_peer_of', None),
            category=getattr(state.definition, 'category', None) or _infer_category(key),
            extras=extras,
        ))

    return ServicesListResponse(
        services=services,
        total=len(services)
    )


@router.get("/{service_key}", response_model=ServiceStateResponse)
async def get_service_status(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Get status of a specific service.

    Args:
        service_key: Service key (e.g., "backend", "frontend")

    Returns:
        Service state including status, health, PID, etc.

    Raises:
        404: Service not found
    """
    state = process_mgr.get_state(service_key)

    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    return ServiceStateResponse(
        key=service_key,
        title=state.definition.title,
        status=map_service_status(state.status),
        health=map_health_status(state.health),
        pid=state.pid or state.detected_pid,
        last_error=state.last_error,
        tool_available=state.tool_available,
        tool_check_message=state.tool_check_message,
        url=getattr(state.definition, 'url', None),
        dev_peer_of=getattr(state.definition, 'dev_peer_of', None),
        category=getattr(state.definition, 'category', None) or _infer_category(service_key),
    )


@router.get("/{service_key}/definition", response_model=ServiceDefinitionResponse)
async def get_service_definition(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Get service definition (program, args, etc.).

    Args:
        service_key: Service key

    Returns:
        Service definition details

    Raises:
        404: Service not found
    """
    state = process_mgr.get_state(service_key)

    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    defn = state.definition

    return ServiceDefinitionResponse(
        key=defn.key,
        title=defn.title,
        program=defn.program,
        args=defn.args,
        cwd=defn.cwd,
        url=defn.url,
        health_url=defn.health_url,
        required_tool=defn.required_tool
    )


@router.post("/{service_key}/start", response_model=ServiceActionResponse)
async def start_service(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Start a service.

    Args:
        service_key: Service key to start

    Returns:
        Action result

    Raises:
        404: Service not found
        500: Failed to start
    """
    # Check service exists
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Check if already running
    if process_mgr.is_running(service_key):
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' is already running",
            service_key=service_key
        )

    # Start the service
    success = process_mgr.start(service_key)

    if success:
        state = process_mgr.get_state(service_key)
        get_logger().info("service_started", service=service_key, pid=state.pid if state else None)
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' started successfully",
            service_key=service_key
        )
    else:
        # Get error from state
        state = process_mgr.get_state(service_key)
        get_logger().error("service_start_failed", service=service_key, error=state.last_error if state else None)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to start service"
        )


@router.post("/{service_key}/stop", response_model=ServiceActionResponse)
async def stop_service(
    service_key: str = Path(..., description="Service key"),
    request: ServiceActionRequest = Body(default=ServiceActionRequest()),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Stop a service.

    Args:
        service_key: Service key to stop
        request: Stop options (graceful shutdown)

    Returns:
        Action result

    Raises:
        404: Service not found
    """
    # Check service exists
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Prevent launcher-api from stopping itself
    if service_key == "launcher-api":
        return ServiceActionResponse(
            success=False,
            message="Cannot stop launcher-api — it serves this UI. Restart the launcher process instead.",
            service_key=service_key,
        )

    # Check if already stopped
    if not process_mgr.is_running(service_key):
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' is already stopped",
            service_key=service_key
        )

    # Stop the service
    success = process_mgr.stop(service_key, graceful=request.graceful)

    if success:
        get_logger().info("service_stopped", service=service_key)
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' stopped successfully",
            service_key=service_key
        )
    else:
        # Get error from state
        state = process_mgr.get_state(service_key)
        get_logger().error("service_stop_failed", service=service_key, error=state.last_error if state else None)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to stop service"
        )


@router.post("/{service_key}/restart", response_model=ServiceActionResponse)
async def restart_service(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Restart a service.

    Args:
        service_key: Service key to restart

    Returns:
        Action result

    Raises:
        404: Service not found
        500: Failed to restart
    """
    # Check service exists
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    # Restart the service
    success = process_mgr.restart(service_key)

    if success:
        state = process_mgr.get_state(service_key)
        get_logger().info("service_restarted", service=service_key, pid=state.pid if state else None)
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' restarted successfully",
            service_key=service_key
        )
    else:
        # Get error from state
        state = process_mgr.get_state(service_key)
        get_logger().error("service_restart_failed", service=service_key, error=state.last_error if state else None)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to restart service"
        )


@router.post("/start-all", response_model=ServiceActionResponse)
async def start_all_services(
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Start all services.

    Returns:
        Action result with count of started services
    """
    states = process_mgr.get_all_states()
    try:
        settings = load_launcher_settings()
        skip_db = settings.datastores.use_local_datastores
    except Exception:
        skip_db = False
    started = 0
    failed = []

    for service_key in states.keys():
        if skip_db and service_key == "db":
            continue
        if not process_mgr.is_running(service_key):
            success = process_mgr.start(service_key)
            if success:
                started += 1
            else:
                failed.append(service_key)

    if failed:
        return ServiceActionResponse(
            success=False,
            message=f"Started {started} services, failed: {', '.join(failed)}",
            service_key="all"
        )
    else:
        return ServiceActionResponse(
            success=True,
            message=f"Started {started} services successfully",
            service_key="all"
        )


@router.post("/stop-all", response_model=ServiceActionResponse)
async def stop_all_services(
    request: ServiceActionRequest = Body(default=ServiceActionRequest()),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Stop all running services.

    Args:
        request: Stop options (graceful shutdown)

    Returns:
        Action result with count of stopped services
    """
    states = process_mgr.get_all_states()
    stopped = 0

    for service_key in states.keys():
        if service_key == "launcher-api":
            continue  # never stop self
        if process_mgr.is_running(service_key):
            process_mgr.stop(service_key, graceful=request.graceful)
            stopped += 1

    return ServiceActionResponse(
        success=True,
        message=f"Stopped {stopped} services",
        service_key="all"
    )


# ── Per-service settings ──

from ..models import (
    SettingFieldResponse,
    ServiceSettingsResponse,
    ServiceSettingsUpdateRequest,
)


@router.get("/{service_key}/settings", response_model=ServiceSettingsResponse)
async def get_service_settings(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Get the settings schema and current values for a service."""
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(status_code=404, detail=f"Service '{service_key}' not found")

    from launcher.core.service_settings import parse_schema, load_persisted, get_effective

    raw_schema = getattr(state.definition, "settings_schema", None)
    schema = parse_schema(raw_schema)

    # Enrich mcp_approval_tools options dynamically from running MCP server
    if service_key == "ai-client":
        schema = _enrich_mcp_tool_options(schema)

    persisted = load_persisted(service_key)
    values = get_effective(schema, persisted)

    return ServiceSettingsResponse(
        service_key=service_key,
        schema=[SettingFieldResponse(**f) for f in schema],
        values=values,
    )


@router.patch("/{service_key}/settings", response_model=ServiceSettingsResponse)
async def update_service_settings(
    service_key: str = Path(..., description="Service key"),
    body: ServiceSettingsUpdateRequest = Body(...),
    process_mgr: ProcessManager = Depends(get_process_manager),
):
    """Update settings for a service. Returns updated schema + values."""
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(status_code=404, detail=f"Service '{service_key}' not found")

    from launcher.core.service_settings import (
        parse_schema, load_persisted, save_persisted, get_effective, validate_update,
    )

    raw_schema = getattr(state.definition, "settings_schema", None)
    schema = parse_schema(raw_schema)
    if not schema:
        raise HTTPException(status_code=400, detail="Service has no configurable settings")

    validated = validate_update(schema, body.values)
    persisted = load_persisted(service_key)
    persisted.update(validated)
    save_persisted(service_key, persisted)

    # Enrich with dynamic options (same as GET)
    if service_key == "ai-client":
        schema = _enrich_mcp_tool_options(schema)

    values = get_effective(schema, persisted)

    return ServiceSettingsResponse(
        service_key=service_key,
        schema=[SettingFieldResponse(**f) for f in schema],
        values=values,
    )


# ── Claude Code hook config writer ──

from pydantic import BaseModel as _BaseModel


class ApplyHookConfigRequest(_BaseModel):
    hook_tools: List[str] = ["Bash", "Write", "Edit"]


class ApplyHookConfigResponse(_BaseModel):
    ok: bool
    path: str
    message: str


@router.post("/{service_key}/apply-hook-config", response_model=ApplyHookConfigResponse)
async def apply_hook_config(
    service_key: str = Path(...),
    body: ApplyHookConfigRequest = Body(...),
):
    """Merge PreToolUse hook config into the global Claude Code settings.json."""
    if service_key != "ai-client":
        raise HTTPException(status_code=400, detail="Hook config only applies to ai-client")

    import json as _json
    from pathlib import Path as _Path

    settings_path = _Path.home() / ".claude" / "settings.json"

    # Read existing
    existing: dict = {}
    if settings_path.exists():
        try:
            existing = _json.loads(settings_path.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    # Build the hook entry
    matcher = "|".join(body.hook_tools) if body.hook_tools else "Bash|Write|Edit"
    new_entry = {
        "matcher": matcher,
        "command": "python -m pixsim7.client.hook_pretool",
    }

    # Merge into hooks.PreToolUse — replace any existing pixsim hook, keep others
    hooks = existing.setdefault("hooks", {})
    pre_tool = hooks.get("PreToolUse", [])
    if not isinstance(pre_tool, list):
        pre_tool = []

    # Remove any existing pixsim hook entries, preserve user's other hooks
    pre_tool = [
        h for h in pre_tool
        if not isinstance(h, dict) or "pixsim7.client.hook_pretool" not in h.get("command", "")
    ]
    pre_tool.append(new_entry)
    hooks["PreToolUse"] = pre_tool
    existing["hooks"] = hooks

    # Write
    try:
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        settings_path.write_text(_json.dumps(existing, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {settings_path}: {e}")

    return ApplyHookConfigResponse(
        ok=True,
        path=str(settings_path),
        message=f"Saved PreToolUse hook ({matcher}) to {settings_path}",
    )
