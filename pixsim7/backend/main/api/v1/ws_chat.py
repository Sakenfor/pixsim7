"""
WebSocket endpoint for AI Assistant chat.

Replaces HTTP POST + SSE with a persistent WebSocket connection per user.
Supports multiplexed tab conversations via ``tab_id`` in every message.

Protocol:
    Connect:
        ws://host/api/v1/ws/chat?token=JWT_TOKEN

    Client -> Server:
        {"type": "message", "tab_id": "...", "message": "...", ...}
        {"type": "reconnect", "tab_id": "...", "task_id": "..."}
        "ping"

    Server -> Client:
        {"type": "connected", "user_id": ...}
        {"type": "heartbeat", "tab_id": "...", "task_id": "...", "action": "...", "detail": "..."}
        {"type": "result", "tab_id": "...", "ok": true, "response": "...", ...}
        {"type": "error", "tab_id": "...", "error": "..."}
        "pong"
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter()


async def _resolve_user_id(token: str | None) -> int | None:
    """Resolve user ID from JWT token."""
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


async def _resolve_raw_token(token: str | None) -> str | None:
    """Return the raw bearer token if it's valid."""
    if not token:
        return None
    try:
        from pixsim7.backend.main.api.dependencies import get_auth_service
        auth_service = get_auth_service()
        await auth_service.verify_token_claims(token, update_last_used=False)
        return token
    except Exception:
        return None


async def _handle_message(
    websocket: WebSocket,
    data: Dict[str, Any],
    user_id: int | None,
    raw_token: str | None,
) -> None:
    """Dispatch a chat message and stream heartbeats + result back over WS."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
    from pixsim7.backend.main.shared.agent_dispatch import build_task_payload as _build_payload

    tab_id = data.get("tab_id", "")
    message = data.get("message", "")
    if not message:
        await websocket.send_json({"type": "error", "tab_id": tab_id, "error": "Empty message"})
        return

    # Check bridge availability
    if remote_cmd_bridge.connected_count == 0:
        await websocket.send_json({
            "type": "result", "tab_id": tab_id, "ok": False,
            "error": "No bridge running. Start one from the AI Agents panel.",
        })
        return

    agent = remote_cmd_bridge.get_available_agent(user_id=user_id)
    if not agent:
        agents = remote_cmd_bridge.get_agents(user_id=user_id)
        if not agents:
            await websocket.send_json({
                "type": "result", "tab_id": tab_id, "ok": False,
                "error": "No bridge available for your account.",
            })
            return
        agent = min(agents, key=lambda a: a.active_tasks)

    # Resolve profile + system prompt
    engine = data.get("engine", "claude")
    model = data.get("model")
    assistant_id = data.get("assistant_id")
    skip_persona = data.get("skip_persona", False)
    custom_instructions = (data.get("custom_instructions") or "").strip()
    focus = data.get("focus")
    bridge_session_id = data.get("bridge_session_id")
    session_policy = data.get("session_policy")
    scope_key = data.get("scope_key")
    context = data.get("context") or {}
    timeout_val = min(max(int(data.get("timeout", 300)), 10), 900)
    user_token = data.get("user_token")

    # Resolve profile
    profile_prompt: str | None = None
    profile_config: dict | None = None
    system_prompt: str | None = None
    try:
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            if assistant_id:
                from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile
                profile = await resolve_agent_profile(db, user_id or 0, assistant_id)
                if profile:
                    if not skip_persona:
                        profile_prompt = profile.system_prompt
                    if profile.model_id:
                        model = profile.model_id
                    if profile.config:
                        profile_config = profile.config
    except Exception:
        pass

    if custom_instructions:
        if profile_prompt:
            profile_prompt += "\n\n" + custom_instructions
        else:
            profile_prompt = custom_instructions

    try:
        from pixsim7.backend.main.api.v1.meta_contracts import build_user_system_prompt
        system_prompt = build_user_system_prompt(focus=focus)
    except Exception:
        pass

    effective_token = user_token or (raw_token if raw_token and user_id is not None else None)
    task_payload = _build_payload(
        prompt=message,
        model=model,
        context=context,
        engine=engine,
        system_prompt=system_prompt,
        user_token=effective_token,
        profile_prompt=profile_prompt,
        profile_config=profile_config,
        bridge_session_id=bridge_session_id,
        session_policy=session_policy,
        scope_key=scope_key,
    )

    # Handle asset images
    asset_ids = data.get("asset_ids")
    if asset_ids and isinstance(asset_ids, list):
        try:
            from pixsim7.backend.main.api.v1.meta_contracts import (
                _is_local_agent, _resolve_asset_image_paths, _fetch_asset_images_b64,
            )
            is_local = agent.metadata.get("local", False) or _is_local_agent(agent)
            if is_local:
                image_paths = await _resolve_asset_image_paths(asset_ids)
                if image_paths:
                    task_payload["image_paths"] = image_paths
            else:
                images = await _fetch_asset_images_b64(asset_ids)
                if images:
                    task_payload["images"] = images
        except Exception:
            pass

    bridge_client_id = agent.bridge_client_id
    start = time.monotonic()

    try:
        task_id_sent = False
        async for event in remote_cmd_bridge.dispatch_task_streaming(
            task_payload,
            timeout=timeout_val,
            user_id=user_id,
            bridge_client_id=bridge_client_id,
        ):
            if event.get("type") == "heartbeat":
                task_id = event.get("task_id", "")
                # Send task_id with first heartbeat so frontend can reconnect
                msg: dict = {
                    "type": "heartbeat",
                    "tab_id": tab_id,
                    "action": event.get("action", ""),
                    "detail": event.get("detail", ""),
                }
                if not task_id_sent:
                    msg["task_id"] = task_id
                    task_id_sent = True
                await websocket.send_json(msg)
            elif event.get("type") == "result":
                duration_ms = int((time.monotonic() - start) * 1000)
                response_text = (
                    event.get("edited_prompt")
                    or event.get("response")
                    or event.get("output", "")
                )
                cli_session_id = event.get("bridge_session_id")

                # Fire-and-forget chat session upsert
                if cli_session_id:
                    from pixsim7.backend.main.api.v1.meta_contracts import (
                        _upsert_chat_session, _extract_chat_session_scope,
                    )
                    # Build a minimal SendMessageRequest-like object for scope extraction
                    from types import SimpleNamespace
                    pseudo_payload = SimpleNamespace(
                        scope_key=scope_key, context=context,
                    )
                    chat_scope_key, chat_plan_id, chat_contract_id = _extract_chat_session_scope(pseudo_payload)
                    asyncio.ensure_future(_upsert_chat_session(
                        session_id=cli_session_id, user_id=user_id or 0,
                        engine=engine, label=message[:60],
                        profile_id=assistant_id,
                        scope_key=chat_scope_key,
                        last_plan_id=chat_plan_id,
                        last_contract_id=chat_contract_id,
                    ))

                await websocket.send_json({
                    "type": "result",
                    "tab_id": tab_id,
                    "ok": True,
                    "response": response_text,
                    "bridge_session_id": cli_session_id,
                    "bridge_client_id": bridge_client_id,
                    "duration_ms": duration_ms,
                })
    except Exception as e:
        logger.warning("ws_chat_dispatch_error", tab_id=tab_id, error=str(e))
        await websocket.send_json({
            "type": "result", "tab_id": tab_id, "ok": False,
            "error": str(e),
        })


async def _handle_reconnect(
    websocket: WebSocket,
    data: Dict[str, Any],
    user_id: int | None,
) -> None:
    """Reattach to an in-flight or completed task."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    tab_id = data.get("tab_id", "")
    task_id = data.get("task_id", "")

    if not task_id:
        await websocket.send_json({
            "type": "error", "tab_id": tab_id,
            "error": "No task_id for reconnect",
        })
        return

    # Check if result is already cached
    cached = remote_cmd_bridge.get_completed_result(task_id)
    if cached:
        response_text = (
            cached.get("edited_prompt")
            or cached.get("response")
            or cached.get("output", "")
        )
        await websocket.send_json({
            "type": "result",
            "tab_id": tab_id,
            "ok": not cached.get("error"),
            "response": response_text,
            "bridge_session_id": cached.get("bridge_session_id"),
            "error": cached.get("error"),
            "reconnected": True,
        })
        return

    # Check if task is still active — create a new heartbeat queue to reattach
    if task_id in remote_cmd_bridge._active_tasks:
        hb_queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        remote_cmd_bridge._heartbeat_queues[task_id] = hb_queue

        # Also check if there's a pending future we can await
        future = remote_cmd_bridge._pending_tasks.get(task_id)

        await websocket.send_json({
            "type": "heartbeat", "tab_id": tab_id,
            "action": "reconnected", "detail": "Reattached to active task",
            "task_id": task_id,
        })

        if future and not future.done():
            # Stream heartbeats until result arrives
            try:
                timeout = 600  # generous reconnect timeout
                deadline = asyncio.get_event_loop().time() + timeout
                while True:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break

                    if future.done():
                        result = future.result()
                        response_text = (
                            result.get("edited_prompt")
                            or result.get("response")
                            or result.get("output", "")
                        )
                        await websocket.send_json({
                            "type": "result",
                            "tab_id": tab_id,
                            "ok": True,
                            "response": response_text,
                            "bridge_session_id": result.get("bridge_session_id"),
                            "reconnected": True,
                        })
                        return

                    hb_wait = asyncio.ensure_future(hb_queue.get())
                    done, _ = await asyncio.wait(
                        [hb_wait, future],
                        timeout=min(remaining, 10),
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if hb_wait in done:
                        hb = hb_wait.result()
                        deadline = asyncio.get_event_loop().time() + timeout
                        await websocket.send_json({
                            "type": "heartbeat", "tab_id": tab_id,
                            "action": hb.get("action", ""),
                            "detail": hb.get("detail", ""),
                        })
                    else:
                        hb_wait.cancel()

                    if future in done:
                        result = future.result()
                        response_text = (
                            result.get("edited_prompt")
                            or result.get("response")
                            or result.get("output", "")
                        )
                        await websocket.send_json({
                            "type": "result",
                            "tab_id": tab_id,
                            "ok": True,
                            "response": response_text,
                            "bridge_session_id": result.get("bridge_session_id"),
                            "reconnected": True,
                        })
                        return
            except Exception as e:
                await websocket.send_json({
                    "type": "error", "tab_id": tab_id,
                    "error": f"Reconnect stream failed: {e}",
                })
            finally:
                remote_cmd_bridge._heartbeat_queues.pop(task_id, None)
        return

    # Task not found
    await websocket.send_json({
        "type": "error", "tab_id": tab_id,
        "error": "Task not found or expired",
    })


@router.websocket("/ws/chat")
async def websocket_chat(
    websocket: WebSocket,
    token: str = None,
):
    """
    WebSocket for AI Assistant chat.

    Connect:
        ws://host/api/v1/ws/chat?token=JWT_TOKEN

    Multiplexes multiple tab conversations on a single connection via tab_id.
    """
    user_id = await _resolve_user_id(token)
    raw_token = await _resolve_raw_token(token)

    # Allow unauthenticated in debug mode
    from pixsim7.backend.main.shared.config import settings
    if user_id is None and not settings.debug:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await websocket.accept()

    await websocket.send_json({
        "type": "connected",
        "user_id": user_id,
    })

    logger.info("ws_chat_connected", user_id=user_id)

    # Track in-flight dispatch tasks for this connection
    active_dispatches: dict[str, asyncio.Task] = {}  # tab_id -> asyncio.Task

    try:
        while True:
            raw = await websocket.receive_text()

            # Keep-alive
            if raw == "ping":
                await websocket.send_text("pong")
                continue

            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                continue

            msg_type = data.get("type", "")

            if msg_type == "message":
                tab_id = data.get("tab_id", "")
                # Cancel any existing dispatch for this tab (user re-sent)
                existing = active_dispatches.pop(tab_id, None)
                if existing and not existing.done():
                    existing.cancel()
                # Fire-and-forget dispatch — runs concurrently
                task = asyncio.create_task(
                    _handle_message(websocket, data, user_id, raw_token)
                )
                active_dispatches[tab_id] = task
                # Auto-cleanup when done
                task.add_done_callback(lambda t, tid=tab_id: active_dispatches.pop(tid, None))

            elif msg_type == "cancel":
                tab_id = data.get("tab_id", "")
                existing = active_dispatches.pop(tab_id, None)
                if existing and not existing.done():
                    existing.cancel()
                # Always ack so client knows server processed the cancel
                await websocket.send_json({
                    "type": "result", "tab_id": tab_id,
                    "ok": False, "error": "cancelled",
                })

            elif msg_type == "reconnect":
                tab_id = data.get("tab_id", "")
                task = asyncio.create_task(
                    _handle_reconnect(websocket, data, user_id)
                )
                active_dispatches[tab_id] = task
                task.add_done_callback(lambda t, tid=tab_id: active_dispatches.pop(tid, None))

    except WebSocketDisconnect:
        logger.info("ws_chat_disconnected", user_id=user_id)
    except Exception as exc:
        logger.warning("ws_chat_error", user_id=user_id, error=str(exc))
    finally:
        # Cancel all in-flight dispatches
        for task in active_dispatches.values():
            if not task.done():
                task.cancel()
