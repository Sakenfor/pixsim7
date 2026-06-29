"""
Service Routes - Endpoints for managing services.

Provides REST API for starting, stopping, and querying services.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Body
from typing import List

from pixsim_logging import get_logger

from launcher.core import ProcessManager, HealthManager
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
    except Exception as e:
        get_logger().debug(
            "mcp_tool_enrich_port_unavailable",
            error_type=type(e).__name__,
            error=str(e),
        )
        return schema

    try:
        import urllib.request
        resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/tools", timeout=3)
        data = _json.loads(resp.read())
        raw_tools = data.get("tools", [])
    except Exception as e:
        get_logger().debug(
            "mcp_tool_enrich_fetch_failed",
            port=port,
            error_type=type(e).__name__,
            error=str(e),
        )
        return schema

    if not raw_tools:
        return schema

    # Skip control-plane / plumbing tools that aren't meaningful to gate for
    # approval (session bookkeeping, the escape hatch, tab identity).
    skip = {"register_session", "log_work", "call_api", "set_tab_identity", "ask_user"}

    # Build UI groups. A tool that exposes sub-operations (a grouped contract)
    # becomes its own group whose items are: an "⚠ all write ops" toggle (value =
    # bare tool name → in-server gate prompts on this group's writes only) plus
    # one toggle per operation (value = "tool::endpoint_id" → op-pin gating that
    # exact op, any method). Tools WITHOUT sub-operations (fine-grained mode, or
    # the odd atomic tool) are bundled by their own `group` field rather than
    # each spawning a pointless single-item category.
    from collections import OrderedDict
    groups: "OrderedDict[str, dict]" = OrderedDict()
    flat_options: list[str] = []

    def _group_tools(gid: str, label: str) -> list:
        if gid not in groups:
            groups[gid] = {"group": gid, "label": label, "tools": []}
        return groups[gid]["tools"]

    for t in raw_tools:
        name = t["name"]
        short = t["short_name"]
        if short in skip:
            continue
        endpoints = t.get("endpoints") or []
        if endpoints:
            tools_list = _group_tools(name, short.replace("_", " ").title())
            tools_list.append({
                "name": name,
                "short_name": "⚠ all write ops",
                "description": "Require approval for every create/update/delete in this group",
            })
            flat_options.append(name)
            for ep in endpoints:
                val = f"{name}::{ep['id']}"
                tools_list.append({
                    "name": val,
                    "short_name": ep["id"],
                    "method": ep.get("method"),
                    "write": bool(ep.get("write")),
                    "description": ep.get("summary", ""),
                })
                flat_options.append(val)
        else:
            gid = t.get("group") or "other"
            tools_list = _group_tools(gid, gid.replace("_", " ").title())
            tools_list.append({"name": name, "short_name": short, "description": t.get("description", "")})
            flat_options.append(name)

    option_groups = list(groups.values())

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
    except Exception as e:
        get_logger().debug(
            "ai_client_extras_hook_status_failed",
            error_type=type(e).__name__,
            error=str(e),
        )

    # Fallback: read MCP port from file if not in bridge status
    if "mcp_port" not in extras:
        try:
            mcp_file = _Path.home() / ".pixsim" / "mcp_port"
            if mcp_file.exists():
                extras["mcp_port"] = int(mcp_file.read_text().strip())
        except Exception as e:
            get_logger().debug(
                "ai_client_extras_mcp_port_fallback_failed",
                error_type=type(e).__name__,
                error=str(e),
            )

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
            description=getattr(state.definition, 'description', None),
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
            build_before_start_package=getattr(state.definition, 'build_before_start_package', None),
            supports_recreate=bool(getattr(state.definition, 'custom_recreate', None)),
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
        description=getattr(state.definition, 'description', None),
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
        build_before_start_package=getattr(state.definition, 'build_before_start_package', None),
        supports_recreate=bool(getattr(state.definition, 'custom_recreate', None)),
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
        description=getattr(defn, 'description', None),
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


@router.post("/{service_key}/recreate", response_model=ServiceActionResponse)
async def recreate_service(
    service_key: str = Path(..., description="Service key"),
    process_mgr: ProcessManager = Depends(get_process_manager)
):
    """
    Recreate a service's container(s) in place.

    For docker-compose services this runs ``compose up -d`` (no preceding
    ``down``), so only containers whose definition changed are rebuilt and the
    rest keep running — the way to apply a compose edit (e.g. postgres
    max_connections) without the full-stack outage a restart causes. Services
    without in-place recreate support fall back to a normal restart.

    Raises:
        404: Service not found
        500: Failed to recreate
    """
    state = process_mgr.get_state(service_key)
    if not state:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_key}' not found"
        )

    success = process_mgr.recreate(service_key)

    if success:
        get_logger().info("service_recreated", service=service_key)
        return ServiceActionResponse(
            success=True,
            message=f"Service '{service_key}' recreated successfully",
            service_key=service_key
        )
    else:
        state = process_mgr.get_state(service_key)
        get_logger().error("service_recreate_failed", service=service_key, error=state.last_error if state else None)
        raise HTTPException(
            status_code=500,
            detail=state.last_error if state.last_error else "Failed to recreate service"
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
        from launcher.core.service_settings import load_persisted
        platform = load_persisted("_platform")
        skip_db = bool(platform.get("use_local_datastores", False))
    except Exception as e:
        get_logger().debug(
            "start_all_platform_settings_load_failed",
            error_type=type(e).__name__,
            error=str(e),
        )
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

    from launcher.core.service_settings import parse_schema, load_persisted, get_effective, get_profile_overrides

    raw_schema = getattr(state.definition, "settings_schema", None)
    schema = parse_schema(raw_schema)

    # Enrich mcp_approval_tools options dynamically from running MCP server
    if service_key == "ai-client":
        schema = _enrich_mcp_tool_options(schema)

    persisted = load_persisted(service_key)
    profile_ov = get_profile_overrides(service_key)
    values = get_effective(schema, persisted, profile_ov)

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
        parse_schema, load_persisted, save_persisted, get_effective,
        validate_update, get_profile_overrides,
    )

    raw_schema = getattr(state.definition, "settings_schema", None)
    schema = parse_schema(raw_schema)
    if not schema:
        raise HTTPException(status_code=400, detail="Service has no configurable settings")

    validated = validate_update(schema, body.values)
    persisted = load_persisted(service_key)
    persisted.update(validated)
    save_persisted(service_key, persisted)

    # Invalidate global exports cache so next service start picks up changes
    process_mgr.invalidate_exports_cache()

    # Enrich with dynamic options (same as GET)
    if service_key == "ai-client":
        schema = _enrich_mcp_tool_options(schema)

    profile_ov = get_profile_overrides(service_key)
    values = get_effective(schema, persisted, profile_ov)

    return ServiceSettingsResponse(
        service_key=service_key,
        schema=[SettingFieldResponse(**f) for f in schema],
        values=values,
    )


# ── Claude Code hook config writer ──

from pydantic import BaseModel as _BaseModel


class ApplyHookConfigRequest(_BaseModel):
    hook_tools: List[str] = ["Bash", "Write", "Edit"]
    # Whether agents may reach the PixSim MCP server through Claude Code's
    # permission layer. Per-tool MCP *approval* is enforced inside the MCP
    # server itself (mcp_server.handle_call_tool) — the only cross-engine gate,
    # since Codex never reads .claude/ — so this stays all-or-nothing:
    #   True  → allow-list every live MCP tool + add an mcp__pixsim__.* catch-all
    #           matcher so a tool registered after this apply still reaches the
    #           server (its in-server gate prompts if it requires approval).
    #   False → allow-list none (hard-disable MCP for agents at the CC layer).
    mcp_allowed: bool = True


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
    except Exception as e:
        get_logger().debug(
            "mcp_tool_names_port_read_failed",
            error_type=type(e).__name__,
            error=str(e),
        )
        return tools

    try:
        import urllib.request
        resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/tools", timeout=3)
        data = _json.loads(resp.read())
        for t in data.get("tools", []):
            name = t.get("name", "")
            if name and name not in ("register_session", "log_work", "call_api", "ask_user"):
                tools.append(f"{_MCP_PERMISSION_PREFIX}{name}")
    except Exception as e:
        get_logger().debug(
            "mcp_tool_names_fetch_failed",
            port=port,
            error_type=type(e).__name__,
            error=str(e),
        )

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
        except Exception as e:
            get_logger().warning(
                "project_hook_settings_parse_failed",
                path=str(project_settings_path),
                error_type=type(e).__name__,
                error=str(e),
            )
            project_settings = {}

    # Merge into hooks.PreToolUse — replace any existing pixsim hook, keep others
    hooks = project_settings.setdefault("hooks", {})
    pre_tool = hooks.get("PreToolUse", [])
    if not isinstance(pre_tool, list):
        pre_tool = []

    _HOOK_CMD = "python -m pixsim7.client.hook_pretool"

    def _points_to_pixsim_hook(entry: object) -> bool:
        """True for any PreToolUse entry whose handler is our hook script.

        Recognises both the legacy flat shape (``{matcher, command}``)
        and the modern nested shape (``{matcher, hooks: [{type, command}]}``).
        Used to strip stale pixsim entries before rewriting.
        """
        if not isinstance(entry, dict):
            return False
        if "pixsim7.client.hook_pretool" in str(entry.get("command", "")):
            return True
        nested = entry.get("hooks", [])
        if isinstance(nested, list):
            return any(
                isinstance(n, dict) and "pixsim7.client.hook_pretool" in str(n.get("command", ""))
                for n in nested
            )
        return False

    # Remove any existing pixsim hook entries first (in either shape)
    pre_tool = [h for h in pre_tool if not _points_to_pixsim_hook(h)]

    # ── MCP permission strategy (Claude Code layer only) ──
    # We deliberately DON'T gate individual MCP tools here. Per-tool approval
    # lives in the MCP server (mcp_server.handle_call_tool → _get_mcp_approval_set),
    # which is the only cross-engine gate and reads mcp_approval_tools live.
    # Claude Code's job is just to let MCP calls reach that server: allow-list
    # every live tool, and add a catch-all matcher so a tool registered after
    # this apply still reaches the server (the hook auto-allows mcp__* — see
    # hook_pretool — deferring the real decision to the in-server gate).
    live_mcp_tools = _fetch_mcp_tool_names()  # full names, e.g. mcp__pixsim__plans_management
    mcp_allowlist = live_mcp_tools if body.mcp_allowed else []

    # Always intercept these — they're UI routing (not gates), and without the
    # hook the built-in tool resolves silently/natively in the headless
    # subprocess, never reaching the chat panel:
    #   * AskUserQuestion → otherwise returns a default "Answer questions?"
    #   * EnterPlanMode   → otherwise auto-approved (allow-listed) so Claude can
    #                       slip into plan mode unprompted; hooking it surfaces an
    #                       approve/reject card so the user can decline planning.
    #   * ExitPlanMode    → otherwise the plan-confirm prompt is invisible
    #                       (and auto-approved if left in permissions.allow),
    #                       so the user never gets to approve/reject the plan.
    # Combine with user-selected gating tools into a single matcher entry.
    _ALWAYS_HOOKED = ("AskUserQuestion", "EnterPlanMode", "ExitPlanMode")
    matcher_tools = list(body.hook_tools)
    for tool in _ALWAYS_HOOKED:
        if tool not in matcher_tools:
            matcher_tools.append(tool)
    if body.mcp_allowed:
        # Catch-all so MCP tools registered after this apply (not yet in the
        # allow-list) still route through the hook instead of being silently
        # denied. The hook auto-allows mcp__* and lets the in-server gate decide.
        matcher_tools.append(rf"{_MCP_PERMISSION_PREFIX}.*")
    matcher = "|".join(matcher_tools)
    pre_tool.append({
        "matcher": matcher,
        "hooks": [{"type": "command", "command": _HOOK_CMD}],
    })

    hooks["PreToolUse"] = pre_tool
    project_settings["hooks"] = hooks

    # ── 1b. Sync permissions.allow with hooked tools ──
    # Claude Code skips PreToolUse hooks for tools already in permissions.allow,
    # so hooked tools must be removed from the allow list for the hook to fire.
    # Conversely, un-hooked built-in tools should be re-added so they auto-allow.
    _MANAGED_BUILTIN_TOOLS = {
        "Bash", "Write", "Edit", "NotebookEdit",
        "WebFetch", "WebSearch", "SlashCommand",
        "EnterPlanMode", "ExitPlanMode",
        # Subagent tool: Claude Code emits "Task", older/SDK builds "Agent".
        # Keep both so the gate/allow-list catches whichever name fires
        # (session.py:1083 already treats them as one for event parsing).
        "Task", "Agent", "TodoWrite",
    }
    permissions = project_settings.setdefault("permissions", {})
    allow_list_settings: list = permissions.get("allow", [])
    if not isinstance(allow_list_settings, list):
        allow_list_settings = []

    # Always-hooked tools count as hooked even when absent from hook_tools, so
    # they're stripped from the allow list and never re-added (an allow-listed
    # tool skips its PreToolUse hook — see the comment above).
    hooked_set = set(body.hook_tools) | set(_ALWAYS_HOOKED)
    # Remove hooked tools from allow list
    allow_list_settings = [
        entry for entry in allow_list_settings
        if entry not in hooked_set
    ]
    # Re-add un-hooked managed tools that aren't already present
    existing = set(allow_list_settings)
    for tool in _MANAGED_BUILTIN_TOOLS - hooked_set:
        if tool not in existing:
            allow_list_settings.append(tool)

    permissions["allow"] = allow_list_settings

    # ── Extra readable/writable roots beyond the project dir ──
    # The session is confined to its working directory (the repo), so the chat
    # agent can't touch files elsewhere — including Claude Code's OWN plan files
    # in ~/.claude/plans (deleting/cleaning those failed with "may only access
    # files in the allowed working directories"). Grant a SCOPED extra root so
    # the agent can manage those, without opening up all of ~/.claude (which
    # holds settings, credentials, other state). Merge with any user-added
    # entries so a manual addition survives this regeneration.
    extra_dirs = permissions.get("additionalDirectories", [])
    if not isinstance(extra_dirs, list):
        extra_dirs = []
    claude_plans_dir = str(claude_dir / "plans")
    if claude_plans_dir not in extra_dirs:
        extra_dirs.append(claude_plans_dir)
    # User-configured extra roots (ai-client service setting
    # `additional_directories`, newline-separated; edited via the launcher's
    # "Additional accessible directories" list) merge on top of the always-on
    # default. Read from persisted settings — same pattern as mcp_approval_tools
    # — so it flows through the normal settings UI without a request-contract
    # change. Best-effort: a settings-read failure must not break apply.
    try:
        from launcher.core.service_settings import load_persisted as _load_persisted
        _configured_dirs = _load_persisted("ai-client").get("additional_directories") or ""
    except Exception:
        _configured_dirs = ""
    for _entry in str(_configured_dirs).splitlines():
        _entry = _entry.strip()
        if _entry and _entry not in extra_dirs:
            extra_dirs.append(_entry)
    permissions["additionalDirectories"] = extra_dirs

    project_settings["permissions"] = permissions

    try:
        project_settings_path.parent.mkdir(parents=True, exist_ok=True)
        project_settings_path.write_text(_json.dumps(project_settings, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {project_settings_path}: {e}")

    # Clean up stale global hooks if any were written by older launcher versions
    # (in either flat or nested shape — see _points_to_pixsim_hook above).
    global_settings_path = claude_dir / "settings.json"
    if global_settings_path.exists():
        try:
            global_settings = _json.loads(global_settings_path.read_text(encoding="utf-8"))
            global_hooks = global_settings.get("hooks", {}).get("PreToolUse", [])
            if isinstance(global_hooks, list):
                cleaned = [h for h in global_hooks if not _points_to_pixsim_hook(h)]
                if len(cleaned) != len(global_hooks):
                    global_settings.setdefault("hooks", {})["PreToolUse"] = cleaned
                    global_settings_path.write_text(_json.dumps(global_settings, indent=2), encoding="utf-8")
        except Exception as e:
            # Non-critical cleanup; keep request successful but record failure context.
            get_logger().debug(
                "global_hook_cleanup_failed",
                path=str(global_settings_path),
                error_type=type(e).__name__,
                error=str(e),
            )

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
        except Exception as e:
            get_logger().warning(
                "project_local_settings_parse_failed",
                path=str(project_local_settings_path),
                error_type=type(e).__name__,
                error=str(e),
            )
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

    # Allow-list every live MCP tool (resolved above) so Claude Code lets them
    # reach the server, where the per-tool gate lives. Tools registered later
    # won't be here yet — the PreToolUse catch-all carries them through instead.
    allow_list.extend(mcp_allowlist)

    permissions["allow"] = allow_list
    local["permissions"] = permissions

    try:
        project_local_settings_path.parent.mkdir(parents=True, exist_ok=True)
        project_local_settings_path.write_text(_json.dumps(local, indent=2), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write {project_local_settings_path}: {e}")

    hook_msg = f"hook ({','.join(body.hook_tools)})" if body.hook_tools else "no hooks"
    mcp_status = (
        f"{len(mcp_allowlist)} tools reachable (per-tool approval enforced in-server)"
        if body.mcp_allowed else "blocked at Claude Code layer"
    )
    return ApplyHookConfigResponse(
        ok=True,
        path=str(project_root / ".claude"),
        message=f"Saved {hook_msg} + MCP permissions ({mcp_status}) to {project_root / '.claude'}.",
    )


class HookConfigState(_BaseModel):
    """Current state of hook config (read from launcher service settings)."""
    hook_tools: List[str] = []
    mcp_approval_tools: List[str] = []
    # Retained for back-compat: True iff any MCP tool is gated.
    mcp_allowed: bool = False
    hook_configured: bool = False


@router.get("/{service_key}/hook-config", response_model=HookConfigState)
async def get_hook_config(service_key: str = Path(...)):
    """Read current hook config from launcher service settings (source of truth)."""
    if service_key != "ai-client":
        raise HTTPException(status_code=400, detail="Hook config only applies to ai-client")

    from launcher.core.service_settings import load_persisted

    settings = load_persisted(service_key)
    hook_tools = settings.get("hook_tools", [])
    if not isinstance(hook_tools, list):
        hook_tools = []
    mcp_tools = settings.get("mcp_approval_tools", [])
    if not isinstance(mcp_tools, list):
        mcp_tools = []

    return HookConfigState(
        hook_tools=hook_tools,
        mcp_approval_tools=mcp_tools,
        mcp_allowed=len(mcp_tools) > 0,
        hook_configured=len(hook_tools) > 0,
    )
