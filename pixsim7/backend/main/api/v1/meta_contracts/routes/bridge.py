"""Meta-contract bridge endpoints."""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.services.meta.agent_dispatch import extract_response_text

from ..models import (
    BridgeMachineEntry,
    BridgeMachinesResponse,
    BridgeSettingsResponse,
    BridgeSettingsUpdateRequest,
    FailedEngineEntry,
    PoolSessionEntry,
    RemoteAgentBridgeStatus,
    RemoteAgentEntry,
    SendMessageRequest,
    SendMessageResponse,
    SettingField,
    StartBridgeRequest,
    StartBridgeResponse,
    TerminateAgentResponse,
)
from ..chat_store import (
    _extract_chat_session_scope,
    _store_session_response,
    _upsert_chat_session,
)
from ..agent_send import (
    _fetch_asset_images_b64,
    _is_local_agent,
    _resolve_asset_image_paths,
    _resolve_send_context,
    _send_via_bridge,
    _send_via_direct_api,
)

router = APIRouter(tags=["meta"])

# Handle to a *server-spawned* bridge subprocess (as opposed to a launcher-managed
# one). None when the bridge is managed by the launcher or not running. This MUST
# exist at module scope: get_bridge_status reads it on every poll, but only
# start/stop_server_bridge assign it — and both read it before assigning while the
# launcher-managed Connect path returns before assigning at all. Without this
# initializer that read raises NameError → HTTP 500, which the frontend poll
# swallows as `connected = 0` ("No agent connected") even while a bridge is live.
_server_bridge_process: Optional["subprocess.Popen"] = None


async def _resolve_effective_user_id_from_authorization(
    authorization: Optional[str],
) -> Optional[int]:
    """Resolve effective user ID from bearer token (user or agent-on-behalf token)."""
    if not authorization:
        return None

    try:
        from pixsim7.backend.main.api.dependencies import (
            _extract_bearer_token,
            get_auth_service,
        )
        from pixsim7.backend.main.shared.actor import RequestPrincipal

        token = _extract_bearer_token(authorization)
        auth_service = get_auth_service()
        payload = await auth_service.verify_token_claims(token, update_last_used=False)
        principal = RequestPrincipal.from_jwt_payload(payload)
        if principal.user_id is not None:
            return int(principal.user_id)

        user = await auth_service.verify_token(token)
        return int(user.id) if user else None
    except Exception:
        return None


@router.get("/agents/bridge", response_model=RemoteAgentBridgeStatus)
async def get_bridge_status(
    authorization: Optional[str] = Header(None),
) -> RemoteAgentBridgeStatus:
    """Status of the remote agent command bridge.

    If authenticated, shows the user's bridges + shared bridges.
    If unauthenticated, shows all bridges.
    """
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    user_id = await _resolve_effective_user_id_from_authorization(authorization)

    agents = remote_cmd_bridge.get_agents(user_id=user_id)

    def _build_agent_entry(a) -> RemoteAgentEntry:
        pool = a.pool_status or {}
        sessions_raw = pool.get("sessions", [])
        pool_sessions = [
            PoolSessionEntry(
                session_id=s.get("session_id", ""),
                engine=s.get("session_id", "").split("-")[0] if s.get("session_id") else "unknown",
                state=s.get("state", "unknown"),
                cli_session_id=s.get("cli_session_id"),
                cli_model=s.get("cli_model"),
                messages_sent=s.get("messages_sent", 0),
                messages_received=s.get("messages_received", 0),
                errors=s.get("errors", 0),
                total_duration_ms=s.get("total_duration_ms", 0),
                started_at=s.get("started_at"),
                last_activity=s.get("last_activity"),
                last_error=s.get("last_error"),
                pid=s.get("pid"),
                context_window=s.get("context_window", 0),
                total_tokens=s.get("total_tokens", 0),
                context_pct=s.get("context_pct"),
                cost_usd=s.get("cost_usd"),
            )
            for s in sessions_raw if isinstance(s, dict)
        ]
        # Use pool's detected engines (reported at connect), fall back to active session engines
        pool_engines = pool.get("engines", [])
        engines = sorted(set(pool_engines)) if pool_engines else (
            sorted({s.engine for s in pool_sessions}) if pool_sessions else [a.agent_type]
        )
        # Pull the probe-failure diagnostic the bridge sends after its
        # start-up `<engine> --version` checks. Missing on legacy bridges
        # that pre-date the probe — empty list keeps responses backward
        # compatible.
        failed_raw = pool.get("failed_engines", []) if isinstance(pool, dict) else []
        failed_engines: list[FailedEngineEntry] = []
        if isinstance(failed_raw, list):
            for entry in failed_raw:
                if not isinstance(entry, dict):
                    continue
                name = str(entry.get("engine") or "").strip()
                reason = str(entry.get("reason") or "").strip()
                if name:
                    failed_engines.append(FailedEngineEntry(engine=name, reason=reason or "unknown"))
        return RemoteAgentEntry(
            bridge_client_id=a.bridge_client_id,
            bridge_id=getattr(a, "bridge_id", None),
            agent_type=a.agent_type,
            user_id=a.user_id,
            connected_at=a.connected_at.isoformat(),
            busy=a.busy,
            tasks_completed=a.tasks_completed,
            engines=engines,
            failed_engines=failed_engines,
            pool_sessions=pool_sessions,
        )

    # Determine ownership + liveness beyond immediate WS connectivity.
    server_alive = _server_bridge_process is not None and _server_bridge_process.poll() is None
    launcher_status: Optional[dict] = None
    launcher_alive = False
    # Avoid launcher probe when bridge is already clearly alive.
    if not agents and not server_alive:
        launcher_status = await _check_launcher_bridge()
        launcher_alive = _is_launcher_bridge_active(launcher_status)

    managed_by: Optional[str] = None
    if server_alive:
        managed_by = "server"
    elif launcher_alive:
        managed_by = "launcher"

    process_alive = len(agents) > 0 or server_alive or launcher_alive

    return RemoteAgentBridgeStatus(
        connected=len(agents),
        available=sum(1 for a in agents if not a.busy),
        agents=[_build_agent_entry(a) for a in agents],
        process_alive=process_alive,
        managed_by=managed_by,
    )


@router.get("/agents/bridge/machines", response_model=BridgeMachinesResponse)
async def get_bridge_machines(
    principal: CurrentUser,
    user_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
) -> BridgeMachinesResponse:
    """List bridge client IDs (machines) used by a user.

    Non-admin callers can only query their own machines.
    Admin callers may pass ``user_id`` to inspect another user's machines.
    """
    from pixsim7.backend.main.domain.platform.agent_profile import BridgeUserMembership

    effective_user_id = principal.user_id
    if user_id is not None:
        requested_user_id = int(user_id)
        if effective_user_id is None or requested_user_id != int(effective_user_id):
            if not principal.is_admin():
                raise HTTPException(status_code=403, detail="Admin access required")
            effective_user_id = requested_user_id

    if effective_user_id is None:
        raise HTTPException(status_code=400, detail="User-scoped principal required.")

    stmt = (
        select(BridgeUserMembership)
        .where(BridgeUserMembership.user_id == int(effective_user_id))
        .order_by(BridgeUserMembership.last_seen_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    machines = []
    for row in rows:
        meta = dict(row.meta) if isinstance(row.meta, dict) else {}
        status = str(row.status or "offline")
        model_value = meta.get("model")
        host_value = meta.get("client_host")
        machines.append(
            BridgeMachineEntry(
                bridge_client_id=str(row.bridge_client_id),
                bridge_id=str(row.bridge_id) if row.bridge_id else None,
                agent_type=row.agent_type,
                status=status,
                online=status == "online",
                first_seen_at=row.first_seen_at.isoformat() if row.first_seen_at else "",
                last_seen_at=row.last_seen_at.isoformat() if row.last_seen_at else "",
                last_connected_at=row.last_connected_at.isoformat() if row.last_connected_at else None,
                last_disconnected_at=(
                    row.last_disconnected_at.isoformat() if row.last_disconnected_at else None
                ),
                model=str(model_value) if isinstance(model_value, str) and model_value.strip() else None,
                client_host=str(host_value) if isinstance(host_value, str) and host_value.strip() else None,
            )
        )

    return BridgeMachinesResponse(total=len(machines), machines=machines)


@router.post("/agents/bridge/{bridge_client_id}/terminate", response_model=TerminateAgentResponse)
async def terminate_agent(bridge_client_id: str) -> TerminateAgentResponse:
    """Disconnect a remote agent bridge by closing its WebSocket."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    agent = None
    for a in remote_cmd_bridge.get_agents():
        if a.bridge_client_id == bridge_client_id:
            agent = a
            break

    if not agent:
        return TerminateAgentResponse(
            ok=False,
            bridge_client_id=bridge_client_id,
            message="Bridge client not found",
        )

    try:
        # Tell the bridge to shut down gracefully (don't reconnect)
        await agent.websocket.send_json({"type": "shutdown"})
        await agent.websocket.close(code=1000, reason="Terminated by admin")
    except Exception:
        pass

    remote_cmd_bridge.disconnect(bridge_client_id)
    return TerminateAgentResponse(ok=True, bridge_client_id=bridge_client_id, message="Disconnected")


def _is_launcher_bridge_active(status: Optional[dict]) -> bool:
    """True when launcher reports ai-client as running or in startup."""
    if not status:
        return False
    service_status = str(status.get("status") or "").strip().lower()
    if service_status in {"running", "starting"}:
        return True
    service_health = str(status.get("health") or "").strip().lower()
    if service_health in {"healthy", "starting"} and status.get("pid"):
        return True
    return False


async def _check_launcher_bridge() -> Optional[dict]:
    """Check if the launcher already manages a running ai-client service."""
    from launcher.core.client import get_service_status

    status = await run_in_threadpool(get_service_status, "ai-client")
    if _is_launcher_bridge_active(status):
        return status
    return None


@router.post("/agents/bridge/start", response_model=StartBridgeResponse)
async def start_server_bridge(
    payload: StartBridgeRequest,
    authorization: Optional[str] = Header(None),
) -> StartBridgeResponse:
    """Start a server-managed agent bridge.

    If authenticated, creates a user-scoped bridge with the user's token.
    Otherwise creates a shared/admin bridge.

    Defers to the launcher's ai-client service if the launcher is running
    and already manages the bridge process.
    """
    global _server_bridge_process
    import subprocess
    import sys
    from launcher.core.client import (
        get_service_status as launcher_get_service_status,
        start_service as launcher_start_service,
    )

    launcher_status = await run_in_threadpool(launcher_get_service_status, "ai-client")

    # If the launcher already manages (running/starting) ai-client, don't spawn duplicates.
    if _is_launcher_bridge_active(launcher_status):
        return StartBridgeResponse(
            ok=True,
            pid=(launcher_status or {}).get("pid"),
            message="Bridge managed by launcher",
        )

    # Launcher is available and ai-client exists but is not active yet.
    # Delegate startup to launcher so ownership stays in launcher.
    if launcher_status:
        started = await run_in_threadpool(launcher_start_service, "ai-client")
        if started:
            refreshed = (
                await run_in_threadpool(launcher_get_service_status, "ai-client")
            ) or launcher_status
            return StartBridgeResponse(
                ok=True,
                pid=(refreshed or {}).get("pid"),
                message="Bridge start delegated to launcher",
            )

    if _server_bridge_process and _server_bridge_process.poll() is None:
        return StartBridgeResponse(
            ok=False,
            pid=_server_bridge_process.pid,
            message=f"Bridge already running (PID: {_server_bridge_process.pid})",
        )

    # Resolve user for scoping (supports agent tokens with on_behalf_of).
    user_id = await _resolve_effective_user_id_from_authorization(authorization)
    bridge_token: Optional[str] = None

    # Shared bridge: admin-only, no user scoping
    if payload.shared:
        user_id = None  # force shared mode

    # Mint a bridge token — user-scoped if user_id, shared/admin if None
    try:
        from pixsim7.backend.main.services.user.token_policy import TokenKind, mint_token as _mint
        bridge_token = _mint(TokenKind.BRIDGE, user_id=user_id)
    except Exception:
        pass

    from pixsim7.backend.main.shared.config import _resolve_repo_root
    repo_root = str(_resolve_repo_root())

    # Build the WS URL with token for user-scoped bridge
    backend_port = os.environ.get("BACKEND_PORT", "8000")
    ws_url = f"ws://localhost:{backend_port}/api/v1/ws/agent-cmd"
    if bridge_token:
        ws_url += f"?token={bridge_token}"

    cmd = [sys.executable, "-m", "pixsim7.client", "--url", ws_url, "--pool-size", str(payload.pool_size)]
    if payload.engines:
        cmd.extend(["--engines", payload.engines])
    if payload.resume_session_id:
        cmd.extend(["--resume-session", payload.resume_session_id])
    if payload.extra_args:
        cmd.extend(payload.extra_args.split())

    # If no PreToolUse hooks are configured, auto-add --dangerously-skip-permissions
    # so Claude CLI doesn't hang waiting for TTY approval in headless mode.
    if "--dangerously-skip-permissions" not in cmd:
        try:
            from launcher.core.service_settings import load_persisted as _load_svc
            svc_settings = _load_svc("ai-client")
            hook_tools = svc_settings.get("hook_tools", [])
            if not hook_tools:
                cmd.append("--dangerously-skip-permissions")
        except Exception:
            cmd.append("--dangerously-skip-permissions")

    env = dict(os.environ)
    pythonpath = env.get("PYTHONPATH", "")
    if repo_root not in pythonpath:
        env["PYTHONPATH"] = repo_root + os.pathsep + pythonpath if pythonpath else repo_root
    # Foundation for future multi-managed bridge support:
    # isolate persisted bridge_client_id by scope instead of one global ~/.pixsim/bridge_id.
    env.setdefault(
        "PIXSIM_BRIDGE_ID_NAMESPACE",
        f"user_{user_id}" if user_id is not None else "shared",
    )

    try:
        _server_bridge_process = subprocess.Popen(
            cmd,
            cwd=repo_root,
            env=env,
        )
        scope = f"user:{user_id}" if user_id else "shared"
        return StartBridgeResponse(
            ok=True,
            pid=_server_bridge_process.pid,
            message=f"Bridge started ({scope}, PID: {_server_bridge_process.pid})",
        )
    except Exception as e:
        return StartBridgeResponse(ok=False, message=str(e))


@router.post("/agents/bridge/stop", response_model=StartBridgeResponse)
async def stop_server_bridge() -> StartBridgeResponse:
    """Stop bridges — server-spawned subprocess and/or connected WebSocket clients."""
    global _server_bridge_process
    import subprocess

    killed_proc = False
    pid = None

    # 1. Kill server-spawned subprocess if present
    if _server_bridge_process and _server_bridge_process.poll() is None:
        pid = _server_bridge_process.pid
        try:
            if os.name == "nt" and pid:
                # On Windows terminate() on the parent may leave child CLI/MCP
                # processes alive. Kill the full process tree.
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                _server_bridge_process.wait(timeout=5)
            else:
                _server_bridge_process.terminate()
                _server_bridge_process.wait(timeout=5)
        except Exception:
            try:
                _server_bridge_process.kill()
            except Exception:
                pass
        _server_bridge_process = None
        killed_proc = True

    # 2. Force-disconnect all WebSocket-connected bridges
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
    ws_count = await remote_cmd_bridge.force_disconnect_all()

    if not killed_proc and ws_count == 0:
        return StartBridgeResponse(ok=False, message="No bridges running")

    parts = []
    if killed_proc:
        parts.append(f"subprocess PID {pid}")
    if ws_count:
        parts.append(f"{ws_count} WebSocket client{'s' if ws_count != 1 else ''}")
    return StartBridgeResponse(ok=True, pid=pid, message=f"Stopped: {', '.join(parts)}")


@router.get("/agents/bridge/settings", response_model=BridgeSettingsResponse)
async def get_bridge_settings() -> BridgeSettingsResponse:
    """Get ai-client settings schema + values from the launcher."""
    from launcher.core.client import get_service_settings

    result = await run_in_threadpool(get_service_settings, "ai-client")
    if result:
        return BridgeSettingsResponse(**result)

    # Launcher offline — read service settings file directly
    try:
        from launcher.core.service_settings import load_persisted, parse_schema, get_effective
        import json as _json
        from pathlib import Path as _p
        manifest_path = _p(__file__).resolve().parents[5] / "services" / "ai-client" / "pixsim.service.json"
        raw_schema = _json.loads(manifest_path.read_text(encoding="utf-8")).get("settings", [])
        schema = parse_schema(raw_schema)
        persisted = load_persisted("ai-client")
        values = get_effective(schema, persisted)
        return BridgeSettingsResponse(
            service_key="ai-client",
            schema=[SettingField(**f) for f in schema],
            values=values,
        )
    except Exception:
        return BridgeSettingsResponse(service_key="ai-client")


@router.patch("/agents/bridge/settings", response_model=BridgeSettingsResponse)
async def update_bridge_settings(
    payload: BridgeSettingsUpdateRequest,
) -> BridgeSettingsResponse:
    """Update ai-client settings via the launcher, then sync to .claude/ files."""
    from launcher.core.client import update_service_settings

    result = await run_in_threadpool(update_service_settings, "ai-client", payload.values)
    if not result:
        # Launcher offline — write directly
        try:
            from launcher.core.service_settings import (
                load_persisted, save_persisted, parse_schema, get_effective, validate_update,
            )
            import json as _json
            from pathlib import Path as _p
            manifest_path = _p(__file__).resolve().parents[5] / "services" / "ai-client" / "pixsim.service.json"
            raw_schema = _json.loads(manifest_path.read_text(encoding="utf-8")).get("settings", [])
            schema = parse_schema(raw_schema)
            validated = validate_update(schema, payload.values)
            persisted = load_persisted("ai-client")
            persisted.update(validated)
            save_persisted("ai-client", persisted)
            values = get_effective(schema, persisted)
            result = {"service_key": "ai-client", "schema": schema, "values": values}
        except Exception as e:
            from fastapi import HTTPException as _H
            raise _H(status_code=500, detail=f"Failed to update settings: {e}")

    # Sync to .claude/ files so Claude CLI picks up the changes immediately
    try:
        from launcher.core.service_settings import load_persisted as _load
        from launcher.core.client import apply_hook_config
        settings = await run_in_threadpool(_load, "ai-client")
        hook_tools = settings.get("hook_tools", [])
        # Per-tool MCP approval is enforced in-server (mcp_server reads
        # mcp_approval_tools live from this same persisted file). Claude Code's
        # layer just needs to let MCP through, so always allow it here.
        await run_in_threadpool(apply_hook_config, hook_tools, True)
    except Exception:
        pass  # non-critical — .claude sync is best-effort

    return BridgeSettingsResponse(**result)


@router.get("/agents/bridge/models")
async def get_bridge_models(
    agent_type: Optional[str] = Query(None, description="Filter by agent type (e.g. codex)"),
) -> Dict[str, Any]:
    """Get available models reported by connected bridge agents."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    models = remote_cmd_bridge.get_available_models(agent_type=agent_type)
    return {"models": models}


@router.get("/agents/bridge/active-task")
async def get_active_task(
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Check if there's an active task (for reconnect after SSE drop).

    Returns the active task status or completed result if available.
    """
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    user_id = await _resolve_effective_user_id_from_authorization(authorization)

    # Check for active (in-progress) task
    active = remote_cmd_bridge.get_active_task_for_user(user_id)
    if active:
        return {"status": "active", **active}

    return {"status": "idle"}


@router.get("/agents/bridge/task-result/{task_id}")
async def get_task_result(task_id: str) -> Dict[str, Any]:
    """Retrieve a completed task result (cached after SSE drop)."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    result = remote_cmd_bridge.pop_completed_result(task_id)
    if result:
        session_id = result.get("bridge_session_id")
        response_text = extract_response_text(result)
        return {
            "status": "completed",
            "ok": True,
            "response": response_text,
            "bridge_session_id": session_id,
        }
    return {"status": "not_found"}


@router.post("/agents/bridge/send", response_model=SendMessageResponse)
async def send_message_to_agent(
    payload: SendMessageRequest,
    authorization: Optional[str] = None,
    db: AsyncSession = Depends(get_database),
) -> SendMessageResponse:
    """Send a message to the AI assistant.

    Routes based on the user's configured assistant_chat provider:
    - remote-cmd-llm: dispatches to the Claude CLI bridge (MCP tools)
    - openai-llm / anthropic-llm: calls the API directly (text chat)
    """
    import time

    ctx = await _resolve_send_context(payload, authorization, db)
    start = time.monotonic()

    if ctx.method == "remote":
        return await _send_via_bridge(
            payload=payload, user_id=ctx.user_id, raw_token=ctx.raw_token,
            start=start, profile_prompt=ctx.profile_prompt, profile_config=ctx.profile_config,
            system_prompt=ctx.system_prompt,
        )

    return await _send_via_direct_api(
        payload=payload, provider_id=ctx.provider_id, model_id=ctx.model_id,
        user_id=ctx.user_id, start=start, profile_prompt=ctx.profile_prompt,
        system_prompt=ctx.system_prompt,
    )


@router.post("/agents/bridge/send-stream")
async def send_message_to_agent_stream(
    payload: SendMessageRequest,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_database),
):
    """SSE streaming variant of bridge/send.

    Yields NDJSON lines:
      {"type":"heartbeat","action":"tool_use","detail":"Using tool: Read"}
      {"type":"result","ok":true,"response":"...","duration_ms":1234}
    """
    import json as _json
    import time

    from fastapi.responses import StreamingResponse

    ctx = await _resolve_send_context(payload, authorization, db)

    # ── Non-bridge: fall back to non-streaming response wrapped as single SSE event ──
    if ctx.method != "remote":
        start = time.monotonic()
        resp = await _send_via_direct_api(
            payload=payload, provider_id=ctx.provider_id, model_id=ctx.model_id,
            user_id=ctx.user_id, start=start, profile_prompt=ctx.profile_prompt,
            system_prompt=ctx.system_prompt,
        )

        async def _single():
            yield f"data: {_json.dumps(resp.model_dump())}\n\n"

        return StreamingResponse(_single(), media_type="text/event-stream")

    # ── Bridge streaming path ──
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    if remote_cmd_bridge.connected_count == 0:
        async def _err():
            yield f"data: {_json.dumps({'type': 'result', 'ok': False, 'bridge_client_id': '', 'error': 'No bridge running. Start one from the AI Agents panel.', 'error_code': 'bridge_offline'})}\n\n"
        return StreamingResponse(_err(), media_type="text/event-stream")

    agent = remote_cmd_bridge.get_available_agent(user_id=ctx.user_id)
    if not agent:
        # All bridges at capacity — check if any are connected at all
        agents = remote_cmd_bridge.get_agents(user_id=ctx.user_id)
        if not agents:
            async def _err2():
                yield f"data: {_json.dumps({'type': 'result', 'ok': False, 'bridge_client_id': '', 'error': 'No bridge available for your account.', 'error_code': 'bridge_unavailable'})}\n\n"
            return StreamingResponse(_err2(), media_type="text/event-stream")
        # Bridges exist but all at max capacity — pick least-loaded
        agent = min(agents, key=lambda a: a.active_tasks)

    from pixsim7.backend.main.services.meta.agent_dispatch import (
        build_task_payload as _build_payload,
        resolve_default_model,
    )
    effective_token = payload.user_token or (ctx.raw_token if ctx.raw_token and ctx.user_id is not None else None)
    # If neither the explicit request nor the resolved profile carried a
    # model AND the request still shows the SendMessageRequest default
    # ("default" sentinel) — fall back to a known-good per-engine default
    # so the bridge dispatch lands on a real model instead of silently
    # deferring to the engine's local config.toml.
    effective_model = (payload.model or "").strip()
    if not effective_model or effective_model.lower() == "default":
        try:
            bridge_models = remote_cmd_bridge.get_available_models(agent_type=payload.engine)
            advertised_default = next(
                (m["id"] for m in bridge_models if m.get("is_default")),
                None,
            )
        except Exception:
            advertised_default = None
        effective_model = advertised_default or resolve_default_model(payload.engine) or effective_model or "default"
    task_payload = _build_payload(
        prompt=payload.message,
        model=effective_model,
        context=payload.context or {},
        engine=payload.engine,
        system_prompt=ctx.system_prompt,
        user_token=effective_token,
        profile_prompt=ctx.profile_prompt,
        profile_config=ctx.profile_config,
        bridge_session_id=payload.bridge_session_id,
        session_policy=payload.session_policy,
        scope_key=payload.scope_key,
    )

    if payload.asset_ids:
        is_local = agent.metadata.get("local", False) or _is_local_agent(agent)
        if is_local:
            image_paths = await _resolve_asset_image_paths(payload.asset_ids)
            if image_paths:
                task_payload["image_paths"] = image_paths
        else:
            images = await _fetch_asset_images_b64(payload.asset_ids)
            if images:
                task_payload["images"] = images

    start = time.monotonic()
    bridge_client_id = agent.bridge_client_id
    chat_scope_key, chat_plan_id, chat_contract_id = _extract_chat_session_scope(payload)

    async def _stream():
        try:
            async for event in remote_cmd_bridge.dispatch_task_streaming(
                task_payload,
                timeout=payload.timeout,
                user_id=ctx.user_id,
                bridge_client_id=bridge_client_id,
            ):
                if event.get("type") == "heartbeat":
                    yield f"data: {_json.dumps({'type': 'heartbeat', 'action': event.get('action', ''), 'detail': event.get('detail', '')})}\n\n"
                elif event.get("type") == "result":
                    duration_ms = int((time.monotonic() - start) * 1000)
                    response_text = extract_response_text(event)
                    cli_session_id = event.get("bridge_session_id")
                    if cli_session_id:
                        import asyncio as _asyncio
                        _asyncio.ensure_future(_upsert_chat_session(
                            session_id=cli_session_id, user_id=ctx.user_id or 0,
                            engine=payload.engine, label=payload.message[:60],
                            profile_id=payload.assistant_id,
                            scope_key=chat_scope_key,
                            last_plan_id=chat_plan_id or "",
                            last_contract_id=chat_contract_id or "",
                        ))
                        # Persist user+assistant pair server-side so recovery works
                        # even if frontend reloads before syncing local state.
                        if response_text:
                            _asyncio.ensure_future(_store_session_response(
                                session_id=cli_session_id,
                                user_message=payload.message,
                                assistant_response=response_text,
                                duration_ms=duration_ms,
                            ))
                    yield f"data: {_json.dumps({'type': 'result', 'ok': True, 'bridge_client_id': bridge_client_id, 'response': response_text, 'bridge_session_id': cli_session_id, 'duration_ms': duration_ms})}\n\n"
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            error_payload = {
                "type": "result",
                "ok": False,
                "bridge_client_id": bridge_client_id,
                "error": str(e),
                "duration_ms": duration_ms,
                "error_code": str(getattr(e, "code", None) or getattr(e, "error_code", None) or "dispatch_error"),
            }
            details = getattr(e, "details", None) or getattr(e, "error_details", None)
            if isinstance(details, dict) and details:
                error_payload["error_details"] = details
            yield f"data: {_json.dumps(error_payload)}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")
