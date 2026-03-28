"""
WebSocket endpoint for remote agent command bridge.

Supports both authenticated (user-scoped) and unauthenticated (shared/admin) connections.

Protocol:
    Connect:
        ws://host/api/v1/ws/agent-cmd?agent_type=claude-cli
        ws://host/api/v1/ws/agent-cmd?agent_type=claude-cli&token=JWT_TOKEN  (user-scoped)

    Server -> Client:
        {"type": "connected", "bridge_client_id": "...", "user_id": ..., "message": "..."}
        {"type": "task", "task_id": "...", "task": "edit_prompt", ...}
        {"type": "ping"}

    Client -> Server:
        {"type": "result", "task_id": "...", "edited_prompt": "..."}
        {"type": "error", "task_id": "...", "error": "..."}
        {"type": "heartbeat", "status": "...", "action": "...", "detail": "..."}
        {"type": "pong"}
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pixsim7.backend.main.shared.config import settings

from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter()


async def _resolve_user_id(token: str | None) -> int | None:
    """Resolve user ID from JWT token, returns None if no token or invalid."""
    if not token:
        return None
    try:
        from pixsim7.backend.main.api.dependencies import get_auth_service
        from pixsim7.backend.main.shared.actor import RequestPrincipal
        auth_service = get_auth_service()
        payload = await auth_service.verify_token_claims(token, update_last_used=False)
        principal = RequestPrincipal.from_jwt_payload(payload)
        return principal.user_id
    except Exception:
        return None


@dataclass
class _ResolvedToken:
    user_id: int | None = None
    run_id: str | None = None
    profile_id: str | None = None  # agent profile ID from token claims (e.g. "profile-mn4kk11k")


async def _resolve_token(token: str | None) -> _ResolvedToken:
    """Resolve user ID, run_id, and agent_id from JWT token, raising on invalid tokens."""
    if not token:
        return _ResolvedToken()
    from pixsim7.backend.main.api.dependencies import get_auth_service
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    auth_service = get_auth_service()
    payload = await auth_service.verify_token_claims(token, update_last_used=False)
    principal = RequestPrincipal.from_jwt_payload(payload)
    return _ResolvedToken(user_id=principal.user_id, run_id=principal.run_id, profile_id=principal.profile_id)


def _is_local_websocket(websocket: WebSocket) -> bool:
    """True when the client is localhost/loopback."""
    try:
        client = websocket.client
        host = str(getattr(client, "host", "") or "").strip().lower()
        return host in {"127.0.0.1", "::1", "localhost"}
    except Exception:
        return False


async def _upsert_bridge_user_membership(
    db,
    *,
    user_id: int | None,
    bridge_client_id: str,
    bridge_id: str | uuid.UUID | None,
    agent_type: str | None,
    now,
    status: str,
    model: str | None = None,
    client_host: str | None = None,
    client_port: int | None = None,
) -> None:
    """Upsert user-to-bridge-client membership with liveness timestamps."""
    if user_id is None:
        return

    from sqlalchemy import select

    from pixsim7.backend.main.domain.platform.agent_profile import BridgeUserMembership

    bridge_uuid = None
    if bridge_id:
        try:
            bridge_uuid = uuid.UUID(str(bridge_id))
        except Exception:
            bridge_uuid = None

    row = (
        await db.execute(
            select(BridgeUserMembership).where(
                BridgeUserMembership.user_id == int(user_id),
                BridgeUserMembership.bridge_client_id == bridge_client_id,
            )
        )
    ).scalar_one_or_none()

    membership_meta: dict[str, object] = {}
    if model:
        membership_meta["model"] = model
    if client_host:
        membership_meta["client_host"] = client_host
    if isinstance(client_port, int):
        membership_meta["client_port"] = int(client_port)

    if row is None:
        row = BridgeUserMembership(
            user_id=int(user_id),
            bridge_client_id=bridge_client_id,
            bridge_id=bridge_uuid,
            agent_type=agent_type or None,
            status=status or "online",
            first_seen_at=now,
            last_seen_at=now,
            last_connected_at=now if status == "online" else None,
            last_disconnected_at=now if status == "offline" else None,
            meta=membership_meta or None,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        return

    if bridge_uuid is not None:
        row.bridge_id = bridge_uuid
    if agent_type:
        row.agent_type = agent_type
    row.status = status or row.status
    row.last_seen_at = now
    if status == "online":
        row.last_connected_at = now
    elif status == "offline":
        row.last_disconnected_at = now

    existing_meta = dict(row.meta) if isinstance(row.meta, dict) else {}
    existing_meta.update(membership_meta)
    row.meta = existing_meta or None
    row.updated_at = now


async def _upsert_bridge_instance(
    *,
    bridge_client_id: str,
    agent_type: str,
    user_id: int | None,
    model: str | None,
    websocket: WebSocket,
) -> str | None:
    """Persist/recover canonical bridge UUID for a stable bridge client ID."""
    try:
        from sqlalchemy import select

        from pixsim7.backend.main.domain.platform.agent_profile import BridgeInstance
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        now = utcnow()
        client = websocket.client
        client_host = str(getattr(client, "host", "") or "").strip() if client else ""
        client_port = getattr(client, "port", None) if client else None

        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(BridgeInstance).where(BridgeInstance.bridge_client_id == bridge_client_id)
                )
            ).scalar_one_or_none()

            if row is None:
                meta = {
                    "client_host": client_host or None,
                    "client_port": int(client_port) if isinstance(client_port, int) else None,
                }
                if model:
                    meta["model"] = model
                row = BridgeInstance(
                    bridge_client_id=bridge_client_id,
                    user_id=user_id,
                    agent_type=agent_type or "unknown",
                    status="online",
                    connected_at=now,
                    last_seen_at=now,
                    disconnected_at=None,
                    meta={k: v for k, v in meta.items() if v is not None} or None,
                    created_at=now,
                    updated_at=now,
                )
                db.add(row)
            else:
                existing_meta = dict(row.meta) if isinstance(row.meta, dict) else {}
                if client_host:
                    existing_meta["client_host"] = client_host
                if isinstance(client_port, int):
                    existing_meta["client_port"] = int(client_port)
                if model:
                    existing_meta["model"] = model

                if row.user_id is None and user_id is not None:
                    row.user_id = user_id
                row.agent_type = agent_type or row.agent_type
                row.status = "online"
                row.connected_at = now
                row.last_seen_at = now
                row.disconnected_at = None
                row.meta = existing_meta or None
                row.updated_at = now

            await _upsert_bridge_user_membership(
                db,
                user_id=user_id,
                bridge_client_id=bridge_client_id,
                bridge_id=row.id,
                agent_type=agent_type or row.agent_type,
                now=now,
                status="online",
                model=model,
                client_host=client_host or None,
                client_port=int(client_port) if isinstance(client_port, int) else None,
            )

            await db.commit()
            return str(row.id)
    except Exception as exc:
        logger.warning(
            "bridge_instance_upsert_failed",
            bridge_client_id=bridge_client_id,
            error=str(exc),
        )
        return None


async def _touch_bridge_instance(
    *,
    bridge_id: str | None,
    bridge_client_id: str,
    user_id: int | None,
    model: str | None = None,
    pool_status: dict | None = None,
    available_models: list[dict] | None = None,
) -> None:
    """Update bridge liveness/status metadata."""
    try:
        from sqlalchemy import select

        from pixsim7.backend.main.domain.platform.agent_profile import BridgeInstance
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        now = utcnow()
        async with AsyncSessionLocal() as db:
            row = None
            if bridge_id:
                try:
                    row = await db.get(BridgeInstance, uuid.UUID(str(bridge_id)))
                except Exception:
                    row = None
            if row is None:
                row = (
                    await db.execute(
                        select(BridgeInstance).where(BridgeInstance.bridge_client_id == bridge_client_id)
                    )
                ).scalar_one_or_none()
            if row is None:
                return

            meta = dict(row.meta) if isinstance(row.meta, dict) else {}
            if model:
                meta["model"] = model
            if isinstance(pool_status, dict):
                meta["pool"] = {
                    "max_sessions": int(pool_status.get("max_sessions", 0) or 0),
                    "ready": int(pool_status.get("ready", 0) or 0),
                    "busy": int(pool_status.get("busy", 0) or 0),
                    "total": int(pool_status.get("total", 0) or 0),
                }
                engines = pool_status.get("engines")
                if isinstance(engines, list):
                    meta["engines"] = [str(x) for x in engines if str(x).strip()]
            if isinstance(available_models, list):
                model_ids = [
                    str(item.get("id"))
                    for item in available_models
                    if isinstance(item, dict) and str(item.get("id") or "").strip()
                ]
                if model_ids:
                    meta["available_models"] = model_ids

            row.status = "online"
            row.last_seen_at = now
            row.meta = meta or None
            row.updated_at = now

            await _upsert_bridge_user_membership(
                db,
                user_id=user_id,
                bridge_client_id=bridge_client_id,
                bridge_id=row.id,
                agent_type=row.agent_type,
                now=now,
                status="online",
                model=model,
            )

            await db.commit()
    except Exception as exc:
        logger.warning(
            "bridge_instance_touch_failed",
            bridge_client_id=bridge_client_id,
            error=str(exc),
        )


async def _mark_bridge_instance_offline(
    *,
    bridge_id: str | None,
    bridge_client_id: str,
    user_id: int | None,
) -> None:
    """Mark bridge offline on websocket disconnect."""
    try:
        from sqlalchemy import select

        from pixsim7.backend.main.domain.platform.agent_profile import BridgeInstance
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        now = utcnow()
        async with AsyncSessionLocal() as db:
            row = None
            if bridge_id:
                try:
                    row = await db.get(BridgeInstance, uuid.UUID(str(bridge_id)))
                except Exception:
                    row = None
            if row is None:
                row = (
                    await db.execute(
                        select(BridgeInstance).where(BridgeInstance.bridge_client_id == bridge_client_id)
                    )
                ).scalar_one_or_none()
            if row is None:
                return
            row.status = "offline"
            row.disconnected_at = now
            row.updated_at = now

            await _upsert_bridge_user_membership(
                db,
                user_id=user_id,
                bridge_client_id=bridge_client_id,
                bridge_id=row.id,
                agent_type=row.agent_type,
                now=now,
                status="offline",
            )

            await db.commit()
    except Exception as exc:
        logger.warning(
            "bridge_instance_offline_failed",
            bridge_client_id=bridge_client_id,
            error=str(exc),
        )


async def _complete_agent_run(run_id: str | None, status: str = "completed") -> None:
    """Mark an AgentRun as ended when the bridge disconnects."""
    if not run_id:
        return
    try:
        from sqlalchemy import select

        from pixsim7.backend.main.domain.platform.agent_profile import AgentRun
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(AgentRun)
                    .where(AgentRun.run_id == run_id, AgentRun.status == "running")
                    .order_by(AgentRun.started_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if row:
                row.status = status
                row.ended_at = utcnow()
                await db.commit()
    except Exception as exc:
        logger.warning("agent_run_complete_failed", run_id=run_id, error=str(exc))


def _sync_cli_sessions_from_pool(
    sessions: list | None,
    user_id: int | None,
    agent_type: str | None,
    profile_id: str | None = None,
) -> None:
    """Upsert ChatSession records from bridge pool_status session data.

    This makes CLI sessions visible in the AI Assistant's resume picker
    and chat session list — same as sessions created through the frontend.

    If ``profile_id`` is provided (from the bridge's token claims), sessions
    are linked to that agent profile in the UI.
    """
    if not sessions or not isinstance(sessions, list) or user_id is None:
        return

    import asyncio

    for sess in sessions:
        if not isinstance(sess, dict):
            continue
        cli_session_id = (sess.get("cli_session_id") or "").strip()
        if not cli_session_id:
            continue
        messages_sent = int(sess.get("messages_sent") or 0)
        if messages_sent < 1:
            continue  # No messages yet — skip

        # Infer engine from agent_type, stripping "-cli" suffix
        engine = agent_type or "agent"
        if engine.endswith("-cli"):
            engine = engine.rsplit("-", 1)[0]  # "claude-cli" -> "claude"

        try:
            from pixsim7.backend.main.api.v1.meta_contracts import _upsert_chat_session
            asyncio.ensure_future(_upsert_chat_session(
                session_id=cli_session_id,
                user_id=user_id,
                engine=engine,
                label=f"CLI session ({cli_session_id[:8]})",
                profile_id=profile_id,
                source="bridge",
            ))
        except Exception:
            pass


@router.websocket("/ws/agent-cmd")
async def agent_cmd_websocket(
    websocket: WebSocket,
    agent_type: str = "unknown",
    bridge_client_id: str = None,
    token: str = None,
    model: str = None,
):
    """
    WebSocket for remote agent command execution.

    Connect:
        ws://host/api/v1/ws/agent-cmd?agent_type=claude-cli
        ws://host/api/v1/ws/agent-cmd?bridge_client_id=BRIDGE_CLIENT_ID
        ws://host/api/v1/ws/agent-cmd?token=JWT_TOKEN  (user-scoped bridge)

    Without token: shared bridge (debug/local only).
    With token: user-scoped bridge (serves only that user, with shared fallback).
    """
    try:
        resolved = await _resolve_token(token)
        user_id = resolved.user_id
        run_id = resolved.run_id
        token_profile_id = resolved.profile_id
    except Exception:
        await websocket.close(code=1008, reason="Invalid bridge token")
        return

    # Shared bridges are allowed only in debug mode or from local loopback.
    if user_id is None and not (settings.debug or _is_local_websocket(websocket)):
        await websocket.close(code=1008, reason="Authentication required for remote bridge connections")
        return

    resolved_bridge_client_id = str(bridge_client_id or "").strip() or None
    if not resolved_bridge_client_id:
        prefix = f"user-{user_id}" if user_id else "shared"
        resolved_bridge_client_id = f"{prefix}-{uuid.uuid4().hex[:8]}"

    bridge_id = await _upsert_bridge_instance(
        bridge_client_id=resolved_bridge_client_id,
        agent_type=agent_type,
        user_id=user_id,
        model=model,
        websocket=websocket,
    )

    metadata = {}
    if model:
        metadata["model"] = model
    agent = await remote_cmd_bridge.connect(
        websocket,
        bridge_client_id=resolved_bridge_client_id,
        agent_type=agent_type,
        user_id=user_id,
        run_id=run_id,
        metadata=metadata or None,
        bridge_id=bridge_id,
    )
    bridge_id = agent.bridge_id or bridge_id
    last_bridge_touch = 0.0

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "result":
                task_id = data.get("task_id")
                if task_id:
                    remote_cmd_bridge.resolve_task(task_id, data)

            elif msg_type == "error":
                task_id = data.get("task_id")
                error = data.get("error", "Unknown error from remote agent")
                if task_id:
                    remote_cmd_bridge.fail_task(task_id, error)

            elif msg_type == "heartbeat":
                # Timestamp-only tracking for bridge deadline extension
                remote_cmd_bridge.record_heartbeat(resolved_bridge_client_id, data)

                now_mono = time.monotonic()
                if now_mono - last_bridge_touch >= 10.0:
                    await _touch_bridge_instance(
                        bridge_id=bridge_id,
                        bridge_client_id=resolved_bridge_client_id,
                        user_id=user_id,
                        model=str(data.get("model") or model or "").strip() or None,
                    )
                    last_bridge_touch = now_mono

                # Canonical heartbeat -> single authority for activity state
                try:
                    from pixsim7.backend.main.services.meta.agent_sessions import agent_session_registry, from_ws_heartbeat
                    # Prefer explicit task_id from heartbeat data (concurrent tasks),
                    # fall back to most recent task for backward compat
                    hb_task_id = data.get("task_id")
                    if not hb_task_id and agent.current_task_ids:
                        hb_task_id = next(iter(agent.current_task_ids))
                    hb = from_ws_heartbeat(
                        agent_id=resolved_bridge_client_id,
                        agent_type=agent_type,
                        data=data,
                        task_id=hb_task_id,
                    )
                    agent_session_registry.record(hb)
                except Exception:
                    pass

            elif msg_type == "models_available":
                models = data.get("models", [])
                models_agent_type = data.get("agent_type") or agent_type
                remote_cmd_bridge.update_bridge_models(
                    resolved_bridge_client_id,
                    models,
                    engine=models_agent_type,
                )
                await _touch_bridge_instance(
                    bridge_id=bridge_id,
                    bridge_client_id=resolved_bridge_client_id,
                    user_id=user_id,
                    available_models=models if isinstance(models, list) else None,
                )

            elif msg_type == "pool_status":
                remote_cmd_bridge.update_bridge_pool_status(resolved_bridge_client_id, data)
                await _touch_bridge_instance(
                    bridge_id=bridge_id,
                    bridge_client_id=resolved_bridge_client_id,
                    user_id=user_id,
                    pool_status=data if isinstance(data, dict) else None,
                )
                # Track CLI sessions as ChatSession records
                _sync_cli_sessions_from_pool(
                    sessions=data.get("sessions") if isinstance(data, dict) else None,
                    user_id=user_id,
                    agent_type=agent_type,
                    profile_id=token_profile_id,
                )

            elif msg_type == "pong":
                pass

            else:
                logger.warning(
                    "agent_cmd_unknown_message",
                    bridge_client_id=resolved_bridge_client_id,
                    type=msg_type,
                )

    except WebSocketDisconnect:
        remote_cmd_bridge.disconnect(resolved_bridge_client_id, websocket=websocket)
        await _mark_bridge_instance_offline(
            bridge_id=bridge_id,
            bridge_client_id=resolved_bridge_client_id,
            user_id=user_id,
        )
        await _complete_agent_run(run_id)
    except Exception as exc:
        logger.warning(
            "agent_cmd_error",
            bridge_client_id=resolved_bridge_client_id,
            error=str(exc),
        )
        remote_cmd_bridge.disconnect(resolved_bridge_client_id, websocket=websocket)
        await _mark_bridge_instance_offline(
            bridge_id=bridge_id,
            bridge_client_id=resolved_bridge_client_id,
            user_id=user_id,
        )
        await _complete_agent_run(run_id, status="failed")
