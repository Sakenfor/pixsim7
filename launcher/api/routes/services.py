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
    """Read bridge status from hook server, with port file fallback."""
    from pathlib import Path as _Path
    import json as _json

    extras: dict = {}

    # Try to get full status from hook server /status endpoint
    try:
        hook_file = _Path.home() / ".pixsim" / "hook_port"
        if hook_file.exists():
            hook_port = int(hook_file.read_text().strip())
            extras["hook_port"] = hook_port
            import urllib.request
            resp = urllib.request.urlopen(f"http://127.0.0.1:{hook_port}/status", timeout=2)
            bridge_status = _json.loads(resp.read())
            extras["bridge_status"] = bridge_status
            # Extract MCP port from bridge status
            if bridge_status.get("mcp_http_port"):
                extras["mcp_port"] = bridge_status["mcp_http_port"]
    except Exception:
        pass

    # Fallback: read MCP port from file if not in bridge status
    if "mcp_port" not in extras:
        try:
            mcp_file = _Path.home() / ".pixsim" / "mcp_port"
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

    extras = None
    health = map_health_status(state.health)
    if service_key == "ai-client" and health == HealthStatusEnum.HEALTHY:
        extras = _read_ai_client_extras()

    return ServiceStateResponse(
        key=service_key,
        title=state.definition.title,
        status=map_service_status(state.status),
        health=health,
        pid=state.pid or state.detected_pid,
        last_error=state.last_error,
        tool_available=state.tool_available,
        tool_check_message=state.tool_check_message,
        url=getattr(state.definition, 'url', None),
        dev_peer_of=getattr(state.definition, 'dev_peer_of', None),
        category=getattr(state.definition, 'category', None) or _infer_category(service_key),
        extras=extras,
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
    mcp_allowed: bool = True  # Whether to grant MCP tool permissions


class ApplyHookConfigResponse(_BaseModel):
    ok: bool
    path: str
    message: str


# Marker prefix so we can identify our managed entries in permissions.allow
_MCP_PERMISSION_PREFIX = "mcp__pixsim__"

# Built-in MCP tools that are always included (not from contracts)
_MCP_BUILTIN_TOOLS = [
    f"{_MCP_PERMISSION_PREFIX}call_api",
    f"{_MCP_PERMISSION_PREFIX}ask_user",
    f"{_MCP_PERMISSION_PREFIX}log_work",
    f"{_MCP_PERMISSION_PREFIX}register_session",
]


def _fetch_mcp_tool_names() -> List[str]:
    """Fetch live MCP tool names from the running MCP server.

    Returns exact permission entries like 'mcp__pixsim__plans_management'.
    Falls back to builtins if the MCP server is unreachable.
    """
    import json as _json
    from pathlib import Path as _Path

    tools = list(_MCP_BUILTIN_TOOLS)

    try:
        mcp_file = _Path.home() / ".pixsim" / "mcp_port"
        if not mcp_file.exists():
            return tools
        port = int(mcp_file.read_text().strip())
    except Exception:
        return tools

    try:
        import urllib.request
        resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/tools", timeout=3)
        data = _json.loads(resp.read())
        for t in data.get("tools", []):
            name = t.get("name", "")
            if name and name not in ("register_session", "log_work", "call_api", "ask_user"):
                tools.append(f"{_MCP_PERMISSION_PREFIX}{name}")
    except Exception:
        pass

    return tools


@router.post("/{service_key}/apply-hook-config", response_model=ApplyHookConfigResponse)
async def apply_hook_config(
    service_key: str = Path(...),
    body: ApplyHookConfigRequest = Body(...),
):
    """Merge PreToolUse hook config into settings.json and MCP permissions into project settings.local.json."""
    if service_key != "ai-client":
        raise HTTPException(status_code=400, detail="Hook config only applies to ai-client")

    import json as _json
    from pathlib import Path as _Path

    claude_dir = _Path.home() / ".claude"

    # Project-level settings is what Claude Code actually reads
    # for MCP permissions. It lives at .claude/settings.local.json in the
    # project root (not in the global ~/.claude/ directory).
    project_root = _Path(__file__).resolve().parents[3]  # launcher/api/routes/ -> project root
    project_local_settings_path = project_root / ".claude" / "settings.local.json"

    # ── 1. Write PreToolUse hook to project settings.json ──

    project_settings_path = project_root / ".claude" / "settings.json"

    project_settings: dict = {}
    if project_settings_path.exists():
        try:
            project_settings = _json.loads(project_settings_path.read_text(encoding="utf-8"))
        except Exception:
            project_settings = {}

    # Merge into hooks.PreToolUse — replace any existing pixsim hook, keep others
    hooks = project_settings.setdefault("hooks", {})
    pre_tool = hooks.get("PreToolUse", [])
    if not isinstance(pre_tool, list):
        pre_tool = []

    # Remove any existing pixsim hook entries first
    pre_tool = [
        h for h in pre_tool
        if not isinstance(h, dict) or "pixsim7.client.hook_pretool" not in h.get("command", "")
    ]

    # Only add hook entry if there are tools to gate
    if body.hook_tools:
        matcher = "|".join(body.hook_tools)
        pre_tool.append({
            "matcher": matcher,
            "command": "python -m pixsim7.client.hook_pretool",
        })

    hooks["PreToolUse"] = pre_tool
    project_settings["hooks"] = hooks

    try:
        project_settings_path.parent.mkdir(parents=True, exist_ok=True)
        project_settings_path.write_text(_json.dumps(project_settings, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {project_settings_path}: {e}")

    # Clean up stale global hooks if any were written by older launcher versions
    global_settings_path = claude_dir / "settings.json"
    if global_settings_path.exists():
        try:
            global_settings = _json.loads(global_settings_path.read_text(encoding="utf-8"))
            global_hooks = global_settings.get("hooks", {}).get("PreToolUse", [])
            if isinstance(global_hooks, list):
                cleaned = [
                    h for h in global_hooks
                    if not isinstance(h, dict) or "pixsim7.client.hook_pretool" not in h.get("command", "")
                ]
                if len(cleaned) != len(global_hooks):
                    global_settings.setdefault("hooks", {})["PreToolUse"] = cleaned
                    global_settings_path.write_text(_json.dumps(global_settings, indent=2), encoding="utf-8")
        except Exception:
            pass  # non-critical cleanup

    # ── 2. Manage MCP permissions in project settings.local.json ──
    #
    # Claude Code reads MCP tool permissions from the project-level
    # .claude/settings.local.json, not the global ~/.claude/ one.
    # We fetch the live tool names from the MCP server to write exact names
    # (Claude Code doesn't support wildcards for MCP tools).

    local: dict = {}
    if project_local_settings_path.exists():
        try:
            local = _json.loads(project_local_settings_path.read_text(encoding="utf-8"))
        except Exception:
            local = {}

    permissions = local.setdefault("permissions", {})
    allow_list: list = permissions.get("allow", [])
    if not isinstance(allow_list, list):
        allow_list = []

    # Remove all our managed MCP entries (anything starting with our prefix)
    allow_list = [
        entry for entry in allow_list
        if not isinstance(entry, str) or not entry.startswith(_MCP_PERMISSION_PREFIX)
    ]

    if body.mcp_allowed:
        # Fetch live tool names from the MCP server
        mcp_tool_names = _fetch_mcp_tool_names()
        allow_list.extend(mcp_tool_names)

    permissions["allow"] = allow_list
    local["permissions"] = permissions

    try:
        project_local_settings_path.parent.mkdir(parents=True, exist_ok=True)
        project_local_settings_path.write_text(_json.dumps(local, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {project_local_settings_path}: {e}")

    hook_msg = f"hook ({','.join(body.hook_tools)})" if body.hook_tools else "no hooks"
    mcp_status = "granted" if body.mcp_allowed else "revoked"
    return ApplyHookConfigResponse(
        ok=True,
        path=str(project_root / ".claude"),
        message=f"Saved {hook_msg} + MCP permissions ({mcp_status}) to {project_root / '.claude'}.",
    )


class HookConfigState(_BaseModel):
    """Current state of Claude Code hook config (read from .claude/ files)."""
    hook_tools: List[str] = []
    mcp_allowed: bool = False
    hook_configured: bool = False


@router.get("/{service_key}/hook-config", response_model=HookConfigState)
async def get_hook_config(service_key: str = Path(...)):
    """Read current PreToolUse hook config and MCP permissions from .claude/ files."""
    if service_key != "ai-client":
        raise HTTPException(status_code=400, detail="Hook config only applies to ai-client")

    import json as _json
    from pathlib import Path as _Path

    project_root = _Path(__file__).resolve().parents[3]
    project_settings_path = project_root / ".claude" / "settings.json"
    project_local_settings_path = project_root / ".claude" / "settings.local.json"

    # ── 1. Read hook tools from settings.json ──
    hook_tools: list[str] = []
    hook_configured = False

    if project_settings_path.exists():
        try:
            settings = _json.loads(project_settings_path.read_text(encoding="utf-8"))
            pre_tool = settings.get("hooks", {}).get("PreToolUse", [])
            if isinstance(pre_tool, list):
                for h in pre_tool:
                    if isinstance(h, dict) and "pixsim7.client.hook_pretool" in h.get("command", ""):
                        matcher = h.get("matcher", "")
                        if matcher:
                            hook_tools = [t.strip() for t in matcher.split("|") if t.strip()]
                        hook_configured = True
                        break
        except Exception:
            pass

    # ── 2. Read MCP permission state from settings.local.json ──
    mcp_allowed = False

    if project_local_settings_path.exists():
        try:
            local = _json.loads(project_local_settings_path.read_text(encoding="utf-8"))
            allow_list = local.get("permissions", {}).get("allow", [])
            if isinstance(allow_list, list):
                mcp_allowed = any(
                    isinstance(e, str) and e.startswith(_MCP_PERMISSION_PREFIX)
                    for e in allow_list
                )
        except Exception:
            pass

    return HookConfigState(
        hook_tools=hook_tools,
        mcp_allowed=mcp_allowed,
        hook_configured=hook_configured,
    )
