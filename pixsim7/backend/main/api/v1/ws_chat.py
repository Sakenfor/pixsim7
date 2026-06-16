"""
WebSocket endpoint for AI Assistant chat.

Replaces HTTP POST + SSE with a persistent WebSocket connection per user.
Supports multiplexed tab conversations via ``tab_id`` in every message.

Protocol:
    Connect:
        ws://host/api/v1/ws/chat?token=JWT_TOKEN

    Client -> Server:
        {"type": "message", "tab_id": "...", "message": "...", ...}
        {"type": "reconnect", "tab_id": "...", "task_id": "...", "bridge_session_id": "..."}
        "ping"

    Server -> Client:
        {"type": "connected", "user_id": ...}
        {"type": "heartbeat", "tab_id": "...", "task_id": "...", "action": "...", "detail": "..."}
        {"type": "confirmation_request", "tab_id": "...", "confirmation_id": "...", "title": "...", ...}
        {"type": "result", "tab_id": "...", "ok": true, "response": "...", ...}
        {"type": "error", "tab_id": "...", "error": "..."}
        "pong"
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Optional

import logging as _stdlib_logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pixsim_logging import get_logger

from pixsim7.backend.main.services.meta.agent_dispatch import extract_response_text

logger = get_logger()
# Stdlib logger alongside the structlog one. Some log viewers (notably the
# launcher's debug panel during the chat-unread-dot regression hunt) showed
# stdlib INFO events but not structlog events, leaving the auth-resolve trail
# invisible. The structlog path is still primary; this is a parallel sink for
# the few probes that need to show up no matter what.
_stdlib_log = _stdlib_logging.getLogger(__name__)

router = APIRouter()

# Give reconnect a short grace window to catch bridge-side buffered replay
# after backend restarts.
_RECONNECT_REPLAY_WAIT_S = 8.0
_RECONNECT_REPLAY_POLL_S = 0.25

# After a backend restart the browser panel reconnects far faster than the
# agent bridge (which is on its own reconnect backoff). Hold an unknown-task
# reconnect open this long for a bridge to (re)connect and re-report its
# in-flight task via the pool_status handshake, instead of instantly failing
# the panel with task_not_found. Plan: launcher-health-probe-stability.
_RECONNECT_BRIDGE_RETURN_WAIT_S = 10.0


def _bridge_present(bridge: Any) -> bool:
    """True if at least one agent bridge is currently connected."""
    count = getattr(bridge, "connected_count", 0)
    return isinstance(count, int) and count > 0


async def _wait_for_bridge_return(task_id: str, *, bridge: Any) -> bool:
    """Wait briefly for an agent bridge to (re)connect after a restart.

    The browser panel reconnects far faster than the agent bridge, so right
    after a backend restart the panel can ask to reattach before any bridge is
    back. Rather than instantly failing with ``task_not_found``, hold the
    reconnect open until a bridge connects (and can re-report its in-flight
    task via the ``pool_status`` handshake) or a bounded deadline passes.

    Returns ``True`` if a bridge is present by the time it returns, or early if
    the task itself surfaces (rebuilt into ``_active_tasks`` or landed in the
    completed cache) while waiting.
    """
    if _bridge_present(bridge):
        return True

    wait_s = max(float(_RECONNECT_BRIDGE_RETURN_WAIT_S), 0.0)
    if wait_s <= 0:
        return _bridge_present(bridge)

    poll_s = max(float(_RECONNECT_REPLAY_POLL_S), 0.05)
    loop = asyncio.get_event_loop()
    deadline = loop.time() + wait_s

    while loop.time() < deadline:
        if _bridge_present(bridge):
            return True
        if task_id in getattr(bridge, "_active_tasks", {}):
            return True
        if bridge.get_completed_result(task_id):
            return True
        await asyncio.sleep(poll_s)
    return _bridge_present(bridge)


async def _resolve_user_id(token: str | None, db) -> int | None:
    """Resolve user ID from JWT token.

    Must be given a real ``AsyncSession`` (NOT ``get_auth_service()``
    outside DI — that returns a service whose ``.db`` is an unbound
    ``Depends`` placeholder; when ``jwt_require_session`` is on,
    ``verify_token_claims`` then raises ``AttributeError`` on
    ``self.db.execute`` and the bare except below silently returns
    None. See plan ``community-chat`` Pitfalls / Canon.
    """
    if not token:
        _stdlib_log.debug("ws_chat_resolve_user_id_no_token")
        return None
    try:
        from pixsim7.backend.main.services.user.auth_service import AuthService
        from pixsim7.backend.main.services.user.user_service import UserService
        from pixsim7.backend.main.shared.actor import RequestPrincipal
        auth_service = AuthService(db, UserService(db))
        payload = await auth_service.verify_token_claims(token, update_last_used=False)
        principal = RequestPrincipal.from_jwt_payload(payload)
        resolved = principal.user_id
        _stdlib_log.debug(
            "ws_chat_resolve_user_id_ok resolved=%s principal_type=%s sub=%s",
            resolved,
            principal.principal_type,
            payload.get("sub"),
        )
        return resolved
    except Exception as exc:
        logger.warning(
            "ws_chat_auth_resolve_failed",
            error_type=type(exc).__name__,
            error=str(exc),
        )
        _stdlib_log.exception(
            "ws_chat_resolve_user_id_failed error_type=%s", type(exc).__name__,
        )
        return None


async def _resolve_raw_token(token: str | None, db) -> str | None:
    """Return the raw bearer token if it's valid. Needs a real session;
    see ``_resolve_user_id`` for the rationale."""
    if not token:
        return None
    try:
        from pixsim7.backend.main.services.user.auth_service import AuthService
        from pixsim7.backend.main.services.user.user_service import UserService
        auth_service = AuthService(db, UserService(db))
        await auth_service.verify_token_claims(token, update_last_used=False)
        return token
    except Exception as exc:
        logger.warning(
            "ws_chat_raw_token_verify_failed",
            error_type=type(exc).__name__,
            error=str(exc),
        )
        return None


def _token_expired(token: str | None) -> bool:
    """True iff ``token`` is a well-formed JWT whose ``exp`` is in the past.

    Deliberately narrow: only a parseable JWT with an elapsed ``exp`` is
    treated as expired. A *missing* token (absence is handled by the
    caller's fallback chain) or a non-JWT opaque value is NOT blocked — we
    don't re-verify signatures here (that already happened at connect), we
    only catch the specific failure this guards against.

    Why per-message (not once at connect): a long-lived chat WS otherwise
    forwards a stale connect-time ``raw_token`` (or an expired pre-minted
    ``user_token``) down to the bridge → per-session MCP token file. The MCP
    server reads that file on every call, so an elapsed token there turns
    every MCP request into a silent 401 the agent surfaces as "MCP
    disconnected" — even on sessions younger than 24h, when the per-message
    mint silently failed and the connect-time token leaked through.
    """
    if not token:
        return False
    try:
        from jose import jwt as _jose_jwt

        claims = _jose_jwt.get_unverified_claims(token)
    except Exception:
        return False  # not a JWT we can reason about — preserve legacy pass-through
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)):
        return False
    import time as _time

    return exp <= _time.time()


def _error_payload(
    message: str,
    *,
    code: str,
    details: dict | None = None,
) -> dict:
    payload: dict[str, Any] = {"error": message, "error_code": code}
    if isinstance(details, dict) and details:
        payload["error_details"] = details
    return payload


def _error_payload_from_exception(exc: BaseException) -> dict:
    text = str(exc or "").strip() or exc.__class__.__name__
    code = getattr(exc, "code", None) or getattr(exc, "error_code", None) or "dispatch_error"
    details = getattr(exc, "details", None) or getattr(exc, "error_details", None)
    return _error_payload(text, code=str(code), details=details if isinstance(details, dict) else None)


async def _bind_tab_to_session(tab_id: str, cli_session_id: str, user_id: int | None) -> None:
    """Bind ``ChatTab.session_id`` (if currently NULL) to the freshly-minted
    ``cli_session_id`` returned by the bridge on the first turn.

    Tabs are now created **unbound** (see plan
    ``chat-tab-server-persistence`` — first-turn resume-failure fix). The
    bridge always assigns a real Claude/Codex conversation UUID; this
    helper persists that UUID so future turns can resume the same
    conversation. Already-bound tabs are left alone — re-pointing is an
    explicit client action via PATCH ``/chat-tabs/{id}``.
    """
    if not tab_id or not cli_session_id:
        return
    try:
        from uuid import UUID

        from pixsim7.backend.main.domain.platform.agent_profile import ChatTab
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        try:
            tab_uuid = UUID(tab_id)
        except ValueError:
            return

        async with AsyncSessionLocal() as db:
            tab = await db.get(ChatTab, tab_uuid)
            if tab is None:
                return
            if user_id is not None and tab.user_id != user_id:
                return
            if tab.session_id:
                return  # already bound — leave alone
            tab.session_id = cli_session_id
            tab.updated_at = utcnow()
            await db.commit()
    except Exception as exc:
        logger.warning("ws_chat_bind_tab_failed", tab_id=tab_id, error=str(exc))


async def _handle_resume_failure(
    resume_failed: dict,
    tab_id: str,
    user_id: int | None,
) -> None:
    """Plan ``chat-session-durable-resume`` CP-D: the CLI started a fresh
    conversation instead of restoring the requested one. The tab is still
    bound to the dead conversation id; **force**-repoint it to the new
    ``actual`` id (unlike ``_bind_tab_to_session``, which only binds when
    NULL) so the next turn continues the conversation that actually exists
    rather than re-failing to resume the gone one every time.

    The user-facing warning is delivered by the ``resume_failed`` event the
    caller forwards over the WS — this helper owns only the server-side
    rebind. Idempotent: a no-op once the tab already points at ``actual``.
    """
    actual = resume_failed.get("actual")
    requested = resume_failed.get("requested")
    if not actual or not tab_id:
        return
    try:
        from uuid import UUID

        from pixsim7.backend.main.domain.platform.agent_profile import ChatTab
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        try:
            tab_uuid = UUID(tab_id)
        except ValueError:
            return

        async with AsyncSessionLocal() as db:
            tab = await db.get(ChatTab, tab_uuid)
            if tab is None:
                return
            if user_id is not None and tab.user_id != user_id:
                return
            if tab.session_id == actual:
                return  # already repointed — nothing to do
            logger.warning(
                "ws_chat_resume_failed_rebind",
                tab_id=tab_id,
                old_session=str(tab.session_id or requested)[:12],
                new_session=str(actual)[:12],
            )
            tab.session_id = actual
            tab.updated_at = utcnow()
            await db.commit()
    except Exception as exc:
        logger.warning(
            "ws_chat_resume_failed_rebind_error",
            tab_id=tab_id,
            error=str(exc),
        )


async def _bind_and_persist_result(
    *,
    tab_id: str,
    cli_session_id: str | None,
    user_id: int | None,
    user_message: str,
    response_text: str,
    duration_ms: int | None,
) -> None:
    """Bind the tab + persist assistant reply on the replay path.

    Sister to the canonical bridge-side ``_schedule_session_persistence``
    (runs the instant ``resolve_task`` fires). This helper is the
    belt-and-suspenders that closes two gaps when a result reaches the
    client via a replay route (cached / streamed / replayed) rather than
    the live ``_handle_message`` result branch:

      * **Tab bind.** CP-A's early-bind requires a ``session_resolved``
        heartbeat — a page reload between dispatch and first heartbeat
        misses it, leaving the originating ``ChatTab`` unbound after the
        result lands. ``_bind_tab_to_session`` is a no-op for tabs that
        are already bound, so calling it here on the live path too is
        cheap and keeps both flows identical.

      * **Notification.** ``_store_session_response`` houses the
        ``chat.message`` emit gate (assistant-is-new dedupe). If the
        bridge persist failed silently, re-entering here triggers the
        gate without double-emitting on the happy path: the merge keys
        on ``(role, stripped text, kind)``, so a second call sees the
        prior commit's row in ``pre_keys`` and skips the emit.

    Passing ``user_message=""`` is safe: ``_store_session_response``
    only appends a user row if the string is truthy, and the user turn
    was already written by CP-A's ``_store_pending_user_message``.
    """
    if not cli_session_id:
        return
    # Reply durability must NOT depend on the tab bind succeeding. The bind
    # only drives the unread pip; the persist is what keeps the assistant
    # reply recoverable. Isolate the bind so a bind failure (ownership race,
    # tab deleted mid-turn, DB hiccup) can't skip the persist below and lose
    # the reply — the exact "reply exists nowhere" failure this path guards.
    try:
        await _bind_tab_to_session(tab_id, cli_session_id, user_id)
    except Exception as exc:
        logger.warning(
            "ws_chat_replay_bind_tab_failed",
            tab_id=tab_id,
            session_id=cli_session_id,
            error=str(exc),
        )
    if response_text:
        try:
            from pixsim7.backend.main.api.v1.meta_contracts import (
                _store_session_response,
            )
            await _store_session_response(
                session_id=cli_session_id,
                user_message=user_message,
                assistant_response=response_text,
                duration_ms=duration_ms,
            )
        except Exception as exc:
            logger.warning(
                "ws_chat_replay_store_response_failed",
                session_id=cli_session_id,
                error=str(exc),
            )


async def _wait_for_replayed_result(
    task_id: str,
    *,
    bridge: Any,
) -> Dict[str, Any] | None:
    """Wait briefly for a bridge replayed result to land in completed cache.

    Also returns early (with the sentinel ``{"_status": "active"}``) if the
    task is rebuilt into the bridge's ``_active_tasks`` mid-wait — which
    happens when a reconnecting bridge reports it via ``pool_status``. The
    caller then switches to streaming mode instead of polling further.
    """
    wait_s = max(float(_RECONNECT_REPLAY_WAIT_S), 0.0)
    if wait_s <= 0:
        return None

    poll_s = max(float(_RECONNECT_REPLAY_POLL_S), 0.05)
    loop = asyncio.get_event_loop()
    deadline = loop.time() + wait_s

    while loop.time() < deadline:
        cached = bridge.get_completed_result(task_id)
        if cached:
            return cached
        if task_id in getattr(bridge, "_active_tasks", {}):
            return {"_status": "active"}
        await asyncio.sleep(poll_s)
    return None


async def _recover_session_tail_response(
    session_hint: str | None,
    *,
    user_id: int | None,
) -> tuple[str, str] | None:
    """Recover a just-missed assistant response from persisted session tail."""
    session_key = (session_hint or "").strip()
    if not session_key:
        logger.info("ws_chat_tier4_skip", reason="no_session_hint")
        return None

    try:
        from sqlalchemy import select

        from pixsim7.backend.main.domain.platform.agent_profile import ChatSession
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            session = await db.get(ChatSession, session_key)
            if not session:
                rows = (await db.execute(
                    select(ChatSession)
                    .where(ChatSession.cli_session_id == session_key)
                    .limit(1)
                )).scalars().all()
                session = rows[0] if rows else None

            if not session:
                logger.info("ws_chat_tier4_skip", session=session_key, reason="session_not_found")
                return None

            owner_id = int(getattr(session, "user_id", 0) or 0)
            if user_id is not None and owner_id not in {0, int(user_id)}:
                logger.info(
                    "ws_chat_tier4_skip",
                    session=session_key,
                    reason="owner_mismatch",
                    owner=owner_id,
                    requester=user_id,
                )
                return None

            messages = list(session.messages or [])
            if not messages:
                logger.info("ws_chat_tier4_skip", session=session_key, reason="empty_messages")
                return None

            last = messages[-1]
            if not isinstance(last, dict):
                logger.info("ws_chat_tier4_skip", session=session_key, reason="malformed_tail")
                return None
            if str(last.get("role") or "").strip().lower() != "assistant":
                logger.info(
                    "ws_chat_tier4_skip",
                    session=session_key,
                    reason="tail_not_assistant",
                    tail_role=last.get("role"),
                    msg_count=len(messages),
                )
                return None

            text = last.get("text")
            if not isinstance(text, str) or not text.strip():
                logger.info("ws_chat_tier4_skip", session=session_key, reason="empty_tail_text")
                return None

            canonical_session_id = str(
                getattr(session, "cli_session_id", None)
                or getattr(session, "id", session_key)
            )
            logger.info(
                "ws_chat_tier4_recovered",
                session=session_key,
                tail_chars=len(text),
                msg_count=len(messages),
            )
            return text, canonical_session_id
    except Exception as exc:
        logger.warning("ws_chat_tier4_error", session=session_key, error=str(exc))
        return None


# How long to keep watching for a late agent result after the dispatch
# has timed out. Bounded by the bridge's _COMPLETED_TTL_S (5 min) — anything
# longer than that and the cache evicts before we'd see it anyway.
_LATE_RESULT_DRAIN_S = 240.0
_LATE_RESULT_POLL_S = 1.0


async def _drain_late_result(
    *,
    task_id: str,
    bridge: Any,
    session_id: str | None,
    user_message: str,
    dispatch_started_at: float,
    timeout_s: int,
) -> None:
    """Watch for a late-arriving result after a dispatch timeout; if the grace
    window expires with no result, write an "abandoned" placeholder so the
    user's timeline reflects the lost turn instead of a silent gap.

    Persistence of late-arriving real results is now handled by the bridge
    itself (``resolve_task`` schedules ``_store_session_response`` the moment
    the agent reply lands). The drain therefore only needs to detect arrival
    so it can skip the placeholder; the dedupe in ``_store_session_response``
    keeps things idempotent if both ever fire.
    """
    del dispatch_started_at  # retained in signature for caller/tests; no longer used

    if not session_id:
        # Without a session id we have nowhere to persist; nothing to do.
        logger.info("ws_chat_drain_skip", task_id=task_id, reason="no_session_id")
        return

    loop = asyncio.get_event_loop()
    deadline = loop.time() + _LATE_RESULT_DRAIN_S

    while loop.time() < deadline:
        cached = None
        try:
            cached = bridge.get_completed_result(task_id)
        except Exception:
            cached = None
        if cached:
            # resolve_task already scheduled persistence on the loop — nothing
            # to do here. Log so operators can correlate timeout-with-late-arrival.
            logger.info(
                "ws_chat_drain_late_arrival",
                task_id=task_id,
                session_id=session_id,
            )
            return
        await asyncio.sleep(_LATE_RESULT_POLL_S)

    # Drain expired with no late result — write a placeholder so the user
    # can see the timeout in their timeline (and "check again" reflects it).
    try:
        from pixsim7.backend.main.domain.platform.agent_profile import ChatSession
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            session = await db.get(ChatSession, session_id)
            if not session:
                rows = (await db.execute(
                    select(ChatSession)
                    .where(ChatSession.cli_session_id == session_id)
                    .limit(1)
                )).scalars().all()
                session = rows[0] if rows else None
            if not session:
                logger.info("ws_chat_drain_placeholder_skip", session_id=session_id, reason="not_found")
                return
            # Don't drop placeholders into archived sessions — the user has
            # explicitly hidden them. The agent's late-arriving response is
            # also worthless here (no UI surface to consume it).
            if session.status == "archived":
                logger.info("ws_chat_drain_placeholder_skip", session_id=session_id, reason="archived")
                return

            # Merge (rather than overwrite) so a concurrent frontend PATCH
            # landing between our initial fetch and our commit doesn't get
            # clobbered. See pixsim7/backend/main/shared/chat_messages.py for
            # the merge identity and rationale — this is the same race window
            # the b9792a1e fix patched on the frontend→backend side, in the
            # opposite direction.
            from pixsim7.backend.main.shared.chat_messages import merge_chat_messages

            now = utcnow().isoformat()
            new_rows: list[dict] = [
                {"role": "user", "text": user_message, "timestamp": now},
                {
                    "role": "system",
                    # Structured terminal marker: the frontend's responseLost
                    # detection treats `kind: "abandoned"` as a definitive answer
                    # to the unresolved user turn so the rose chip stops firing.
                    # Plain text is preserved for legacy renderers / UIs that
                    # haven't been taught about the kind field yet.
                    "kind": "abandoned",
                    "text": f"Agent did not respond within {timeout_s}s — response abandoned.",
                    "timestamp": now,
                },
            ]
            # Refresh to pick up any concurrent frontend PATCH that committed
            # while the drain was sleeping (it sleeps for _LATE_RESULT_DRAIN_S
            # before reaching here — wide window).
            await db.refresh(session, ["messages"])
            merged = merge_chat_messages(session.messages, new_rows)
            session.messages = merged[-50:]
            session.last_used_at = utcnow()
            await db.commit()
            logger.info("ws_chat_drain_placeholder_written", task_id=task_id, session_id=session_id)
    except Exception as exc:
        logger.warning("ws_chat_drain_placeholder_failed", task_id=task_id, error=str(exc))


async def _handle_message(
    websocket: WebSocket,
    data: Dict[str, Any],
    user_id: int | None,
    raw_token: str | None,
) -> None:
    """Dispatch a chat message and stream heartbeats + result back over WS."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
    from pixsim7.backend.main.services.meta.agent_dispatch import build_task_payload as _build_payload

    tab_id = data.get("tab_id", "")
    message = data.get("message", "")
    _stdlib_log.debug(
        "ws_chat_handle_message_entry tab_id=%s user_id=%s msg_len=%d",
        tab_id,
        user_id,
        len(message or ""),
    )
    if not message:
        await websocket.send_json({
            "type": "error",
            "tab_id": tab_id,
            **_error_payload("Empty message", code="empty_message"),
        })
        return

    # Check bridge availability
    if remote_cmd_bridge.connected_count == 0:
        await websocket.send_json({
            "type": "result", "tab_id": tab_id, "ok": False,
            **_error_payload(
                "No bridge running. Start one from the AI Agents panel.",
                code="bridge_offline",
            ),
        })
        return

    from pixsim7.backend.main.services.llm.remote_cmd_bridge import normalize_engine

    # ── Parse request fields needed for profile resolution ──
    model_raw = data.get("model")
    model = model_raw.strip() if isinstance(model_raw, str) else model_raw
    if isinstance(model, str) and not model:
        model = None
    # Per-turn reasoning-effort override (composer dropdown). Wins over the
    # profile's effort when present — mirrors the per-message `model` override.
    effort_raw = data.get("reasoning_effort")
    request_effort = effort_raw.strip().lower() if isinstance(effort_raw, str) else None
    if not request_effort:
        request_effort = None
    assistant_id_raw = data.get("assistant_id")
    assistant_id = assistant_id_raw.strip() if isinstance(assistant_id_raw, str) else assistant_id_raw
    if isinstance(assistant_id, str) and assistant_id.lower() in {"unknown", "none", "null"}:
        assistant_id = None
    skip_persona = data.get("skip_persona", False)
    request_engine = (data.get("engine") or "").strip().lower() or None

    # ── Resolve the profile FIRST: its agent_type is the authoritative
    # engine intent. The chat tab's `engine` field can lag the selected
    # profile (e.g. a codex "Code Reviewer" picked in a claude tab); if we
    # let the tab/bridge decide the engine, a codex profile's model_id
    # (gpt-5.3-codex) would be dispatched to the claude binary and 404.
    # Resolve once here and reuse the result downstream (no double lookup).
    profile = None
    profile_prompt: str | None = None
    profile_config: dict | None = None
    system_prompt: str | None = None
    resolved_profile_id: str | None = None
    profile_engine: str | None = None
    try:
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile

            agent_type_hint = request_engine if request_engine in {"claude", "codex"} else None
            if assistant_id:
                profile = await resolve_agent_profile(db, user_id or 0, assistant_id)
            if not profile:
                profile = await resolve_agent_profile(
                    db, user_id or 0, None, agent_type=agent_type_hint,
                )
            if profile:
                resolved_profile_id = profile.id
                profile_engine = normalize_engine(getattr(profile, "agent_type", None))
                if not skip_persona:
                    profile_prompt = profile.system_prompt
                if not (model or "").strip() and profile.model_id:
                    prof_model = str(profile.model_id).strip()
                    if prof_model:
                        model = prof_model
                merged_config = dict(profile.config or {})
                if profile.reasoning_effort:
                    merged_config["reasoning_effort"] = profile.reasoning_effort
                if merged_config:
                    profile_config = merged_config
            elif assistant_id:
                resolved_profile_id = assistant_id
    except Exception:
        pass

    # Per-turn effort override wins over the profile's effort (and applies even
    # with no profile resolved). The bridge reads `profile_config["reasoning_effort"]`.
    if request_effort:
        profile_config = dict(profile_config or {})
        profile_config["reasoning_effort"] = request_effort

    # Engine match: pick a bridge that actually serves the requested engine.
    # Profile agent_type wins (user's actual selection); the tab's `engine`
    # field is only a fallback. Without this a multi-engine bridge would
    # silently run a codex profile's model on the claude binary.
    requested_engine = profile_engine or request_engine
    agent = remote_cmd_bridge.get_available_agent(
        user_id=user_id,
        agent_type=requested_engine,
    )
    if not agent and requested_engine:
        # Engine-specific lookup failed — check whether a different-engine
        # bridge is available so we can return a precise diagnosis instead
        # of the generic "no bridge".
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import normalize_engine
        any_agent = remote_cmd_bridge.get_available_agent(user_id=user_id)
        if any_agent:
            connected_engine = (
                normalize_engine(any_agent.agent_type)
                or (any_agent.agent_type or "unknown")
            )
            await websocket.send_json({
                "type": "result", "tab_id": tab_id, "ok": False,
                **_error_payload(
                    f"No bridge available for engine '{requested_engine}'. "
                    f"Connected bridge runs '{connected_engine}'. "
                    f"Restart your local agent client to re-register the "
                    f"'{requested_engine}' engine, or switch this tab to "
                    f"'{connected_engine}'.",
                    code="bridge_engine_unavailable",
                ),
            })
            return
    if not agent:
        agents = remote_cmd_bridge.get_agents(user_id=user_id)
        if not agents:
            await websocket.send_json({
                "type": "result", "tab_id": tab_id, "ok": False,
                **_error_payload(
                    "No bridge available for your account. "
                    "Start your local agent client (pixsim-cli) to connect a bridge.",
                    code="bridge_unavailable",
                ),
            })
            return
        agent = min(agents, key=lambda a: a.active_tasks)

    # Engine resolution. The profile's agent_type (resolved above) is the
    # user's actual selection and wins. The tab's `engine` field is a
    # fallback for profile-less chats; the bridge's registered agent_type
    # is only a last resort. Deriving engine from agent.agent_type (a
    # multi-engine bridge registers as just "claude") was the bug that ran
    # codex profiles on the claude binary.
    engine = (
        profile_engine
        or request_engine
        or normalize_engine(agent.agent_type)
        or "claude"
    )

    # Remaining request fields (model / assistant_id / skip_persona +
    # profile already resolved before bridge selection).
    custom_instructions = (data.get("custom_instructions") or "").strip()
    focus = data.get("focus")
    bridge_session_id = data.get("bridge_session_id")
    session_policy = data.get("session_policy")
    scope_key = data.get("scope_key")
    context = data.get("context") or {}
    timeout_val = min(max(int(data.get("timeout", 900)), 10), 1800)
    user_token = data.get("user_token")

    # Resolve default model when profile didn't specify one.
    # For Codex the bridge reports available models; for Claude it doesn't,
    # so we use a static fallback so the task payload carries a real model name.
    if not model:
        try:
            bridge_models = remote_cmd_bridge.get_available_models(agent_type=engine)
            default_model = next((m["id"] for m in bridge_models if m.get("is_default")), None)
            if default_model:
                model = default_model
        except Exception:
            pass
    # If the bridge hasn't reported its catalog yet (model/list reply races
    # the first dispatch on a fresh bridge), fall back to a known-good
    # static default per engine so the payload carries a real model name
    # instead of letting the engine's local config silently decide.
    if not model:
        from pixsim7.backend.main.services.meta.agent_dispatch import resolve_default_model
        fallback = resolve_default_model(engine)
        if fallback:
            model = fallback

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

    # Per-message re-validation. The chat WS validates its token once at
    # connect; without this guard a stale connect-time token (or an expired
    # pre-minted user_token) flows down to the per-session MCP token file and
    # turns every MCP call into a silent 401 the agent reports as "MCP
    # disconnected". Refuse loudly here instead of forwarding it — the typed
    # ``token_expired`` code lets the panel reconnect (re-minting raw_token)
    # or re-mint user_token rather than fail opaquely.
    if _token_expired(effective_token):
        await websocket.send_json({
            "type": "error",
            "tab_id": tab_id,
            **_error_payload(
                "Auth token expired — message not sent. Reconnect the "
                "assistant (or retry) to mint a fresh token; sending it "
                "anyway would make this agent's MCP tools fail silently.",
                code="token_expired",
                details={"source": "user_token" if user_token else "ws_raw_token"},
            ),
        })
        return

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
        tab_id=tab_id,
        profile_id=resolved_profile_id,
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
    # Capture the dispatch task_id so we can spawn a drain on TimeoutError.
    dispatch_task_id: str | None = None

    # Plan `chat-session-durable-resume` CP-A: persist + bind the ChatSession
    # the moment the bridge first surfaces Claude's cli_session_id (via the
    # `session_resolved` heartbeat), instead of waiting for a `result` event
    # that an interrupted/timed-out turn never produces. Without this, an
    # interrupted turn leaves no resumable server session and the tab unbound
    # — exactly the silent context-loss this plan fixes.
    from pixsim7.common.scope_helpers import extract_scope
    chat_scope_key, chat_plan_id, chat_contract_id = extract_scope(context, scope_key)
    early_bound_session_id: str | None = None

    async def _ensure_session_persisted(sid: str | None) -> None:
        nonlocal early_bound_session_id
        if not sid or sid == early_bound_session_id:
            return
        early_bound_session_id = sid
        from pixsim7.backend.main.api.v1.meta_contracts import (
            _store_pending_user_message,
            _upsert_chat_session,
        )
        try:
            # increment_messages=False: the result path owns the count bump
            # (idempotent upsert updates in place). cli_session_id is set so
            # the agent_pool DB-backed resume (CP-B) can recover the mapping
            # after a bridge restart — for chat turns the surfaced id IS
            # Claude's conversation UUID (bridge.py keys them equal).
            await _upsert_chat_session(
                session_id=sid, user_id=user_id or 0,
                engine=engine, label=message[:60],
                profile_id=resolved_profile_id,
                scope_key=chat_scope_key,
                last_plan_id=chat_plan_id or "",
                last_contract_id=chat_contract_id or "",
                increment_messages=False,
                source="chat",
                cli_session_id=sid,
            )
            await _bind_tab_to_session(tab_id, sid, user_id)
            await _store_pending_user_message(session_id=sid, user_message=message)
        except Exception as exc:
            logger.warning(
                "ws_chat_early_bind_failed",
                session_id=sid,
                tab_id=tab_id,
                error=str(exc),
            )

    try:
        task_id_sent = False
        async for event in remote_cmd_bridge.dispatch_task_streaming(
            task_payload,
            timeout=timeout_val,
            user_id=user_id,
            bridge_client_id=bridge_client_id,
        ):
            if event.get("type") == "task_created":
                # Send task_id to client immediately — before any agent
                # heartbeats — so it can persist an inflight entry for
                # reconnect even if the page refreshes right away.
                dispatch_task_id = event["task_id"]
                await websocket.send_json({
                    "type": "heartbeat",
                    "tab_id": tab_id,
                    "task_id": event["task_id"],
                    "action": "dispatched",
                    "detail": "Task dispatched",
                })
                task_id_sent = True
            elif event.get("type") == "heartbeat":
                task_id = event.get("task_id", "")
                if task_id and not dispatch_task_id:
                    dispatch_task_id = task_id
                msg: dict = {
                    "type": "heartbeat",
                    "tab_id": tab_id,
                    "action": event.get("action", ""),
                    "detail": event.get("detail", ""),
                }
                if not task_id_sent:
                    msg["task_id"] = task_id
                    task_id_sent = True
                # Forward bridge_session_id when the agent client surfaces it —
                # lets the frontend mirror it onto the panel tab BEFORE the
                # final result arrives, so a mid-turn HMR/reload can still
                # reconcile against server state via tab.sessionId.
                upstream_session_id = event.get("bridge_session_id")
                if isinstance(upstream_session_id, str) and upstream_session_id:
                    msg["bridge_session_id"] = upstream_session_id
                    # Durable-resume CP-A: bind/persist as soon as the id is
                    # known (idempotent + once-per-turn guarded internally).
                    await _ensure_session_persisted(upstream_session_id)
                # CP-C/CP-D: the CLI couldn't restore the prior conversation.
                # Forward the verdict so the panel can warn the user, and
                # repoint the tab off the dead conversation onto the fresh
                # one so subsequent turns stay coherent (not silently lost).
                rf = event.get("resume_failed")
                if isinstance(rf, dict) and rf:
                    msg["resume_failed"] = rf
                    await _handle_resume_failure(rf, tab_id, user_id)
                await websocket.send_json(msg)
            elif event.get("type") == "confirmation_request":
                msg = {
                    "type": "confirmation_request",
                    "tab_id": tab_id,
                    "confirmation_id": event.get("confirmation_id", ""),
                    "title": event.get("title", "Confirmation Required"),
                    "description": event.get("description", ""),
                    "tool_name": event.get("tool_name"),
                    "tool_input": event.get("tool_input"),
                    "timeout_s": event.get("timeout_s"),
                }
                # Forward interaction type fields for choice/text_input prompts
                for key in ("interaction_type", "choices", "placeholder"):
                    if event.get(key) is not None:
                        msg[key] = event[key]
                await websocket.send_json(msg)
                # Phase 4b: surface the unanswered question as a per-tab
                # nudge so it isn't silently missed if the prompt UI is off
                # screen / the page reloaded. GENERIC — this gate is shared
                # by PixSim ask_user and Claude's AskUserQuestion. Isolated
                # so a notification failure can't disturb the dispatch.
                try:
                    from pixsim7.backend.main.api.v1.meta_contracts import (
                        _emit_ask_user_pending,
                    )
                    await _emit_ask_user_pending(
                        tab_id=tab_id,
                        user_id=user_id,
                        title=event.get("title"),
                        description=event.get("description"),
                    )
                except Exception as exc:
                    logger.warning(
                        "ws_chat_ask_user_pending_emit_failed",
                        tab_id=tab_id,
                        error=str(exc),
                    )
            elif event.get("type") == "result":
                duration_ms = int((time.monotonic() - start) * 1000)
                response_text = extract_response_text(event)
                cli_session_id = event.get("bridge_session_id")

                if cli_session_id:
                    from pixsim7.backend.main.api.v1.meta_contracts import _upsert_chat_session
                    # chat_scope_key/plan/contract computed once before the
                    # dispatch loop (CP-A) — reused here.

                    # Await the primary upsert so the row exists before the
                    # response store call runs. Previously this was fire-and-
                    # forget; if the response store won the race the message
                    # was silently dropped on first turn.
                    try:
                        await _upsert_chat_session(
                            session_id=cli_session_id, user_id=user_id or 0,
                            engine=engine, label=message[:60],
                            profile_id=resolved_profile_id,
                            scope_key=chat_scope_key,
                            last_plan_id=chat_plan_id or "",
                            last_contract_id=chat_contract_id or "",
                            increment_messages=True,
                            source="chat",
                            # CP-B b2: populate the cli_session_id column so
                            # agent_pool's DB-backed resume can recover the
                            # mapping after a bridge restart. Chat turns key
                            # the row id == cli conversation UUID, so this is
                            # the same value (kept explicit for the lookup).
                            cli_session_id=cli_session_id,
                        )
                    except Exception as exc:
                        logger.warning(
                            "ws_chat_upsert_session_failed",
                            session_id=cli_session_id,
                            error=str(exc),
                        )

                    # One-directional chat→plan bridge: make a chat-driven
                    # agent visible in the cross-plan active-agent roster
                    # (it never calls progress/claim, so it would otherwise
                    # be invisible). Lightweight, best-effort; the canonical
                    # boundary vs ChatSession.last_plan_id is documented on
                    # record_chat_plan_participant. Live-path only — the
                    # replay path lacks dispatch-time plan/profile context.
                    if chat_plan_id:
                        try:
                            from pixsim7.backend.main.api.v1.plans.helpers import (
                                record_chat_plan_participant,
                            )
                            await record_chat_plan_participant(
                                plan_id=chat_plan_id,
                                profile_id=resolved_profile_id,
                                session_id=cli_session_id,
                                user_id=user_id or None,
                                agent_type=engine,
                            )
                        except Exception as exc:
                            logger.warning(
                                "ws_chat_record_participant_failed",
                                session_id=cli_session_id,
                                error=str(exc),
                            )

                    # First-turn bind + assistant-reply persist (which also
                    # houses the chat.message notification gate). Shared
                    # with the reconnect/replay routes so any path that
                    # delivers a `result` event to the client goes through
                    # the same bind+notify surface. Belt-and-suspenders to
                    # the canonical bridge `_schedule_session_persistence`:
                    # if the bridge persist failed silently, this re-entry
                    # still emits the unread pip; if it succeeded, the
                    # assistant-key dedupe collapses the second call.
                    await _bind_and_persist_result(
                        tab_id=tab_id,
                        cli_session_id=cli_session_id,
                        user_id=user_id,
                        user_message=message,
                        response_text=response_text,
                        duration_ms=duration_ms,
                    )

                    # MCP-hash → CLI UUID alias row stays fire-and-forget;
                    # it's a tracking row, not the durability path.
                    original_session_id = event.get("original_session_id")
                    if original_session_id and original_session_id != cli_session_id:
                        asyncio.ensure_future(_upsert_chat_session(
                            session_id=original_session_id,
                            user_id=user_id or 0,
                            engine=engine,
                            label=message[:60],
                            profile_id=resolved_profile_id,
                            cli_session_id=cli_session_id,
                            source="chat",
                        ))

                # CP-C/CP-D: if the bridge reported a resume failure and the
                # heartbeats carrying it were missed (WS hiccup), the result
                # still carries the verdict — forward + rebind here too.
                result_rf = event.get("resume_failed")
                if isinstance(result_rf, dict) and result_rf:
                    await _handle_resume_failure(result_rf, tab_id, user_id)

                result_payload = {
                    "type": "result",
                    "tab_id": tab_id,
                    "ok": True,
                    "response": response_text,
                    "bridge_session_id": cli_session_id,
                    "bridge_client_id": bridge_client_id,
                    "duration_ms": duration_ms,
                }
                if isinstance(result_rf, dict) and result_rf:
                    result_payload["resume_failed"] = result_rf
                await websocket.send_json(result_payload)
    except TimeoutError as e:
        # Dispatch timed out — agent went silent for the full window. Spawn
        # a background drain to persist the answer if it still arrives, or
        # write a placeholder so the user's timeline shows the lost turn.
        if dispatch_task_id:
            asyncio.ensure_future(_drain_late_result(
                task_id=dispatch_task_id,
                bridge=remote_cmd_bridge,
                # Prefer the cli_session_id captured mid-turn (CP-A early
                # bind) over the requested resume id — on a first turn the
                # latter is None, which is why an interrupted opening turn
                # used to leave no placeholder at all.
                session_id=early_bound_session_id or bridge_session_id,
                user_message=message,
                dispatch_started_at=start,
                timeout_s=timeout_val,
            ))
        err = _error_payload_from_exception(e)
        logger.warning(
            "ws_chat_dispatch_timeout",
            tab_id=tab_id,
            task_id=dispatch_task_id,
            timeout_s=timeout_val,
        )
        await websocket.send_json({
            "type": "result", "tab_id": tab_id, "ok": False,
            **err,
        })
    except Exception as e:
        err = _error_payload_from_exception(e)
        logger.warning(
            "ws_chat_dispatch_error",
            tab_id=tab_id,
            error=err["error"],
            error_code=err["error_code"],
        )
        await websocket.send_json({
            "type": "result", "tab_id": tab_id, "ok": False,
            **err,
        })


async def _stream_active_task(
    websocket: WebSocket,
    *,
    tab_id: str,
    task_id: str,
    bridge: Any,
    user_id: int | None,
) -> bool:
    """Stream heartbeats and the eventual result for an in-flight task.

    Returns True if a terminal message (result or stream-failure error) was
    sent on this WS, False if there was nothing to wait on (no future).

    Every ``result`` send goes through ``_bind_and_persist_result`` first
    so a reconnect/replay still binds the originating tab and re-enters
    the ``chat.message`` emit gate — the live result branch's job when a
    turn lives long enough to flow through it, but missed here previously
    if the original ``_handle_message`` task died before its result branch
    ran (page reload, backend restart with bridge buffering, etc).
    """
    hb_queue: asyncio.Queue = asyncio.Queue(maxsize=64)
    bridge._heartbeat_queues[task_id] = hb_queue
    future = bridge._pending_tasks.get(task_id)

    await websocket.send_json({
        "type": "heartbeat", "tab_id": tab_id,
        "action": "reconnected", "detail": "Reattached to active task",
        "task_id": task_id,
    })

    if not (future and not future.done()):
        bridge._heartbeat_queues.pop(task_id, None)
        return False

    async def _emit_result(result: Dict[str, Any]) -> None:
        response_text = extract_response_text(result)
        cli_session_id = result.get("bridge_session_id")
        duration_ms = result.get("duration_ms")
        try:
            duration_ms = int(duration_ms) if duration_ms is not None else None
        except (TypeError, ValueError):
            duration_ms = None
        # Bind + persist BEFORE wiring the result down to the client so a
        # fast frontend refetch immediately after seeing the result finds
        # the row populated (same ordering guarantee as the live path).
        await _bind_and_persist_result(
            tab_id=tab_id,
            cli_session_id=cli_session_id,
            user_id=user_id,
            user_message="",
            response_text=response_text,
            duration_ms=duration_ms,
        )
        await websocket.send_json({
            "type": "result",
            "tab_id": tab_id,
            "ok": True,
            "response": response_text,
            "bridge_session_id": cli_session_id,
            "reconnected": True,
        })

    try:
        # Heartbeat-gap idle bound on the reconnect stream (reset on each
        # heartbeat below), aligned with the dispatch-side gap so a task that
        # stalls after a reconnect fails as fast as one that stalls on the
        # live path — not after a 10-minute idle wait.
        timeout = getattr(bridge, "HEARTBEAT_GAP_TIMEOUT_S", 90)
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                break

            if future.done():
                await _emit_result(future.result())
                return True

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
                await _emit_result(future.result())
                return True
    except Exception as e:
        await websocket.send_json({
            "type": "error", "tab_id": tab_id,
            **_error_payload(f"Reconnect stream failed: {e}", code="reconnect_stream_failed"),
        })
        return True
    finally:
        bridge._heartbeat_queues.pop(task_id, None)
    return True


async def _handle_reconnect(
    websocket: WebSocket,
    data: Dict[str, Any],
    user_id: int | None,
) -> None:
    """Reattach to an in-flight or completed task."""
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

    tab_id = data.get("tab_id", "")
    task_id = data.get("task_id", "")
    session_hint_raw = data.get("bridge_session_id")
    session_hint = session_hint_raw if isinstance(session_hint_raw, str) else ""

    if not task_id:
        await websocket.send_json({
            "type": "error", "tab_id": tab_id,
            **_error_payload("No task_id for reconnect", code="reconnect_missing_task_id"),
        })
        return

    # Check if result is already cached
    cached = remote_cmd_bridge.get_completed_result(task_id)
    if cached:
        response_text = extract_response_text(cached)
        # Bind tab + re-enter the assistant-reply persist (which houses
        # the chat.message emit gate). Skip on error results — they're
        # transient and never land in ChatSession.messages anyway.
        if not cached.get("error"):
            duration_ms_raw = cached.get("duration_ms")
            try:
                duration_ms = int(duration_ms_raw) if duration_ms_raw is not None else None
            except (TypeError, ValueError):
                duration_ms = None
            await _bind_and_persist_result(
                tab_id=tab_id,
                cli_session_id=cached.get("bridge_session_id"),
                user_id=user_id,
                user_message="",
                response_text=response_text,
                duration_ms=duration_ms,
            )
        await websocket.send_json({
            "type": "result",
            "tab_id": tab_id,
            "ok": not cached.get("error"),
            "response": response_text,
            "bridge_session_id": cached.get("bridge_session_id"),
            "error": cached.get("error"),
            "error_code": cached.get("error_code"),
            "error_details": cached.get("error_details"),
            "reconnected": True,
        })
        return

    # Active task — either still alive from this backend instance or rebuilt
    # from a reconnecting bridge's pool_status handshake.
    if task_id in remote_cmd_bridge._active_tasks:
        if await _stream_active_task(
            websocket, tab_id=tab_id, task_id=task_id, bridge=remote_cmd_bridge,
            user_id=user_id,
        ):
            return

    # Backend may have restarted while the bridge still has buffered result
    # (or is mid-flight and about to report it via pool_status). The agent
    # bridge reconnects on its own backoff — slower than the browser panel —
    # so it may not be back yet. Hold the reconnect open for it to return
    # rather than instantly failing with task_not_found (the restart race).
    bridge_present = _bridge_present(remote_cmd_bridge)
    if not bridge_present:
        await websocket.send_json({
            "type": "heartbeat",
            "tab_id": tab_id,
            "task_id": task_id,
            "action": "recovering",
            "detail": "Waiting for agent to reconnect",
        })
        bridge_present = await _wait_for_bridge_return(task_id, bridge=remote_cmd_bridge)
        # The handshake may have rebuilt the task straight into _active_tasks
        # while we waited — stream it directly.
        if task_id in remote_cmd_bridge._active_tasks:
            if await _stream_active_task(
                websocket, tab_id=tab_id, task_id=task_id, bridge=remote_cmd_bridge,
                user_id=user_id,
            ):
                return

    if bridge_present:
        await websocket.send_json({
            "type": "heartbeat",
            "tab_id": tab_id,
            "task_id": task_id,
            "action": "recovering",
            "detail": "Waiting for bridge replay",
        })
        replayed = await _wait_for_replayed_result(task_id, bridge=remote_cmd_bridge)
        if replayed and replayed.get("_status") == "active":
            # Bridge rebuilt the task into _active_tasks during the wait —
            # switch to streaming the live result.
            if await _stream_active_task(
                websocket, tab_id=tab_id, task_id=task_id, bridge=remote_cmd_bridge,
                user_id=user_id,
            ):
                return
        elif replayed:
            response_text = extract_response_text(replayed)
            if not replayed.get("error"):
                duration_ms_raw = replayed.get("duration_ms")
                try:
                    duration_ms = int(duration_ms_raw) if duration_ms_raw is not None else None
                except (TypeError, ValueError):
                    duration_ms = None
                await _bind_and_persist_result(
                    tab_id=tab_id,
                    cli_session_id=replayed.get("bridge_session_id"),
                    user_id=user_id,
                    user_message="",
                    response_text=response_text,
                    duration_ms=duration_ms,
                )
            await websocket.send_json({
                "type": "result",
                "tab_id": tab_id,
                "ok": not replayed.get("error"),
                "response": response_text,
                "bridge_session_id": replayed.get("bridge_session_id"),
                "error": replayed.get("error"),
                "error_code": replayed.get("error_code"),
                "error_details": replayed.get("error_details"),
                "reconnected": True,
            })
            return

    # Last-resort recovery from persisted ChatSession tail.
    recovered = await _recover_session_tail_response(session_hint, user_id=user_id)
    if recovered:
        response_text, recovered_session_id = recovered
        await websocket.send_json({
            "type": "result",
            "tab_id": tab_id,
            "ok": True,
            "response": response_text,
            "bridge_session_id": recovered_session_id,
            "reconnected": True,
        })
        return

    # Task not found
    await websocket.send_json({
        "type": "error", "tab_id": tab_id,
        **_error_payload("Task not found or expired", code="task_not_found"),
    })


async def _cancel_dispatch_task(
    task: asyncio.Task | None,
    *,
    tab_id: str,
    reason: str,
) -> None:
    """Cancel a per-tab dispatch and wait briefly for cancellation cleanup."""
    if not task or task.done():
        return
    task.cancel()
    try:
        await asyncio.wait_for(task, timeout=1.5)
    except asyncio.CancelledError:
        return
    except asyncio.TimeoutError:
        logger.warning("ws_chat_cancel_timeout", tab_id=tab_id, reason=reason)
    except Exception as exc:
        logger.debug("ws_chat_cancel_error", tab_id=tab_id, reason=reason, error=str(exc))


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
    from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
    async with AsyncSessionLocal() as auth_db:
        user_id = await _resolve_user_id(token, auth_db)
        raw_token = await _resolve_raw_token(token, auth_db)

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
    _stdlib_log.debug(
        "ws_chat_connected_stdlib user_id=%s token_present=%s debug=%s",
        user_id,
        token is not None and token != "",
        bool(getattr(settings, "debug", False)),
    )

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
                await _cancel_dispatch_task(existing, tab_id=tab_id, reason="resend")
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
                await _cancel_dispatch_task(existing, tab_id=tab_id, reason="cancel")
                # Phase 4b: dispatch aborted — any pending question on this
                # tab is moot, so clear its nudge.
                try:
                    from pixsim7.backend.main.api.v1.meta_contracts import (
                        _clear_ask_user_pending,
                    )
                    await _clear_ask_user_pending(tab_id=tab_id, user_id=user_id)
                except Exception as exc:
                    logger.warning(
                        "ws_chat_ask_user_clear_failed",
                        tab_id=tab_id,
                        error=str(exc),
                    )
                # Always ack so client knows server processed the cancel
                await websocket.send_json({
                    "type": "result", "tab_id": tab_id,
                    "ok": False,
                    **_error_payload("cancelled", code="cancelled"),
                })

            elif msg_type == "confirmation_response":
                # User responded to a prompt — resolve the gate with full response
                from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
                conf_id = data.get("confirmation_id", "")
                approved = bool(data.get("approved", False))
                extra = {}
                if data.get("choice") is not None:
                    extra["choice"] = data["choice"]
                if data.get("choices") is not None:
                    # Plural — used by multi_choice mode; list of selected option ids.
                    extra["choices"] = data["choices"]
                if data.get("text") is not None:
                    extra["text"] = data["text"]
                if conf_id:
                    remote_cmd_bridge.resolve_confirmation(conf_id, approved, **extra)
                # Phase 4b: question answered — clear its pending nudge.
                try:
                    from pixsim7.backend.main.api.v1.meta_contracts import (
                        _clear_ask_user_pending,
                    )
                    await _clear_ask_user_pending(
                        tab_id=data.get("tab_id", ""),
                        user_id=user_id,
                    )
                except Exception as exc:
                    logger.warning(
                        "ws_chat_ask_user_clear_failed",
                        tab_id=data.get("tab_id", ""),
                        error=str(exc),
                    )

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
