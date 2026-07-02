"""Chat-session persistence + notification helpers (agent messaging)."""
from __future__ import annotations

from typing import Optional


from pixsim7.common.scope_helpers import (
    extract_scope,
    normalize_profile_id as _normalize_profile_id,
)
from sqlalchemy import select

from pixsim7.backend.main.shared.chat_messages import (
    chat_message_key as _chat_message_key,
    merge_chat_messages as _merge_chat_messages,
)

from .models import (
    SendMessageRequest,
)


def _extract_chat_session_scope(payload: SendMessageRequest) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Extract scope from a SendMessageRequest. Delegates to shared ``extract_scope``."""
    context = payload.context if isinstance(payload.context, dict) else {}
    return extract_scope(context, payload.scope_key)


async def _upsert_chat_session(
    session_id: str,
    user_id: int,
    engine: str,
    label: str,
    profile_id: Optional[str] = None,
    scope_key: Optional[str] = None,
    last_plan_id: Optional[str] = None,
    last_contract_id: Optional[str] = None,
    increment_messages: bool = False,
    source: Optional[str] = None,
    cli_session_id: Optional[str] = None,
) -> None:
    """Create or update a chat session record (fire-and-forget).

    ``increment_messages`` should only be True for actual user↔agent
    message turns — not for registration, log_work, or metadata updates.
    """
    try:
        from pixsim7.backend.main.domain.platform.agent_profile import ChatSession
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        normalized_profile_id = _normalize_profile_id(profile_id)

        async with AsyncSessionLocal() as db:
            existing = await db.get(ChatSession, session_id)
            if existing:
                # Archived sessions are explicitly user-hidden. Background
                # heartbeats / log_work calls keep firing on them indefinitely
                # if the MCP process holds the stale id, which bumped
                # `last_used_at` forever and gradually polluted other fields
                # too. List endpoint filters by status so they don't reappear,
                # but the data drift is real — gate writes here.
                # `/restore` is the documented un-archive path.
                if existing.status == "archived":
                    import logging
                    logging.getLogger(__name__).debug(
                        "chat_session_upsert_skipped_archived session_id=%s",
                        session_id,
                    )
                    return
                # Self-repair stale user_id=0 rows. Background: row creation
                # races between the MCP server's `register-chat-session` (which
                # defaults to user_id=0 when its request lacks auth) and the
                # WS chat handler's CP-A early-bind (which has the real user
                # id). Whichever fires first wins, and since this update path
                # never touched user_id, a row born with 0 stayed 0 forever —
                # and every chat.message notification it produced was
                # invisible to the authenticated frontend. See plan
                # `chat-unread-dot-regression`.
                if user_id and user_id > 0 and (existing.user_id or 0) == 0:
                    import logging
                    logging.getLogger(__name__).info(
                        "chat_session_user_id_self_repair session_id=%s "
                        "old_user_id=%s new_user_id=%s",
                        session_id,
                        existing.user_id,
                        user_id,
                    )
                    existing.user_id = user_id
                if increment_messages:
                    existing.message_count += 1
                existing.last_used_at = utcnow()
                # Heal a stale engine. Historically engine was set only on
                # INSERT, so a row first created by the bridge-pool sync with
                # the wrong (bridge-wide) engine could never be corrected by a
                # later authoritative turn — a codex session stayed pinned to
                # "claude". A session's engine is fixed for its lifetime, and
                # every wrong value is the "claude" field/column default; the
                # only writers that emit a *concrete non-default* engine are
                # the authoritative ones (per-session bridge sync, profile
                # agent_type). So accept a differing engine, but never let a
                # defaulted "claude" downgrade a concrete engine — that guards
                # the reverse regression (a callers' omitted engine clobbering
                # a correct "codex").
                if (
                    engine
                    and engine != existing.engine
                    and not (engine == "claude" and existing.engine not in (None, "", "claude"))
                ):
                    existing.engine = engine
                if label and label != existing.label:
                    existing.label = label
                if normalized_profile_id is not None:
                    existing.profile_id = normalized_profile_id
                if scope_key is not None:
                    existing.scope_key = scope_key
                if last_plan_id is not None:
                    # Empty string means "clear" — normalize to None for DB
                    existing.last_plan_id = last_plan_id or None
                if last_contract_id is not None:
                    existing.last_contract_id = last_contract_id or None
                if source and not existing.source:
                    existing.source = source  # set once, don't overwrite
                if cli_session_id:
                    existing.cli_session_id = cli_session_id
            else:
                db.add(ChatSession(
                    id=session_id,
                    user_id=user_id,
                    engine=engine,
                    profile_id=normalized_profile_id,
                    scope_key=scope_key,
                    last_plan_id=last_plan_id,
                    last_contract_id=last_contract_id,
                    label=label or "Untitled",
                    source=source,
                    cli_session_id=cli_session_id,
                    message_count=1 if increment_messages else 0,
                ))
            await db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("chat_session_upsert_failed: %s", e)


async def _store_pending_user_message(
    session_id: str,
    user_message: str,
) -> None:
    """Persist just the user turn server-side, before any assistant reply.

    Plan ``chat-session-durable-resume`` CP-A: durability used to be gated
    entirely on the ``result`` event, so an interrupted turn (bridge/MCP
    drop, timeout) left no server-side trace of the user's message at all —
    only the frontend's localStorage held it. Writing the user row as soon
    as the session is known means the turn survives even if no reply ever
    arrives, and ``_drain_late_result``'s abandoned-placeholder has a real
    session to land on.

    Merge (not overwrite) via the shared identity rules so the later
    ``_store_session_response`` (same user text) collapses to one row.
    """
    import logging

    log = logging.getLogger(__name__)
    if not user_message:
        return
    try:
        from pixsim7.backend.main.domain.platform.agent_profile import (
            ChatSession,
            ChatTab,
        )
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

        notif_session_id: str | None = None
        notif_user_id: int | None = None
        notif_label: str | None = None
        has_tab_surface = False

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
                log.warning(
                    "store_pending_user_message_session_missing session_id=%s",
                    session_id,
                )
                return
            if session.status == "archived":
                return
            await db.refresh(session, ["messages"])
            new_rows = [{
                "role": "user",
                "text": user_message,
                "timestamp": utcnow().isoformat(),
            }]
            merged = _merge_chat_messages(session.messages, new_rows)
            session.messages = merged[-50:]
            session.last_used_at = utcnow()
            # Capture before commit (expire_on_commit would detach these) so we
            # can emit the cross-device live-sync ping after the transaction.
            notif_session_id = session.id
            notif_user_id = session.user_id
            notif_label = session.label
            # Only ping if a ChatTab surfaces this session — same gate as the
            # assistant reply ping, so tab-less probe/CLI sessions don't accrue
            # an uncleanable unread (see `_store_session_response`).
            tab_match_ids = [notif_session_id]
            if session.cli_session_id and session.cli_session_id != notif_session_id:
                tab_match_ids.append(session.cli_session_id)
            has_tab_surface = (
                await db.execute(
                    select(ChatTab.id)
                    .where(ChatTab.session_id.in_(tab_match_ids))
                    .limit(1)
                )
            ).first() is not None
            await db.commit()

        # Cross-device live-sync ping: emit a pip-FREE activity notification
        # for the USER turn. Only assistant replies tripped the chat-unread
        # poll before, so a message typed on one device never surfaced live on
        # the other — only the agent's reply did. This uses ref_type
        # `chat_session_activity` (not `chat_session`) so it nudges the peer's
        # poll to re-pull the transcript WITHOUT lighting the blue "unread
        # reply" pip for the user's own message. Isolated from the persist
        # transaction (its own session, swallowed errors) so a notification
        # failure can't roll back the message we just saved.
        if has_tab_surface and notif_user_id is not None and notif_session_id:
            await _emit_chat_message_notification(
                session_id=notif_session_id,
                user_id=notif_user_id,
                label=notif_label or "AI Assistant",
                preview=user_message,
                source="user",
                ref_type="chat_session_activity",
            )
    except Exception as e:
        log.warning(
            "store_pending_user_message_failed session_id=%s err=%s",
            session_id,
            e,
        )


async def _store_session_response(
    session_id: str,
    user_message: str,
    assistant_response: str,
    duration_ms: int | None = None,
) -> None:
    """Append user + assistant messages to the ChatSession's messages JSON.

    Called server-side when the result arrives so the response is persisted
    even if the WebSocket to the client has already dropped (page refresh).
    This provides a recovery source for the frontend fallback.

    Looks up by primary key first, then by ``cli_session_id`` so MCP-derived
    sessions whose row is keyed by an alias still receive the append. If the
    row is missing entirely (race with ``_upsert_chat_session``), logs a
    warning so silent loss can be diagnosed instead of dropped.
    """
    import logging
    log = logging.getLogger(__name__)

    try:
        from pixsim7.backend.main.domain.platform.agent_profile import (
            ChatSession,
            ChatTab,
        )
        from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
        from pixsim7.backend.main.shared.datetime_utils import utcnow

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
                log.warning(
                    "store_session_response_session_missing session_id=%s "
                    "(upsert race or unknown id — assistant response not persisted)",
                    session_id,
                )
                return
            # Don't append to archived sessions — the user has explicitly
            # hidden them. Bridge-side reply persist can still race the
            # archive flip; this guard is the second line of defense.
            if session.status == "archived":
                log.debug(
                    "store_session_response_skipped_archived session_id=%s",
                    session_id,
                )
                return
            # Build the row(s) we want to land. Merge (rather than overwrite)
            # so a concurrent frontend PATCH that lands between our read and
            # our commit doesn't get clobbered. Duplicates are handled by the
            # merge's (role, stripped-text, kind) identity — re-entry from the
            # bridge persist + WS handler call sites collapses to one row.
            now = utcnow().isoformat()
            new_rows: list[dict] = []
            if user_message:
                new_rows.append({"role": "user", "text": user_message, "timestamp": now})
            entry: dict = {"role": "assistant", "text": assistant_response, "timestamp": now}
            if duration_ms is not None:
                entry["duration_ms"] = duration_ms
            new_rows.append(entry)
            # Refresh to minimise the window in which a frontend PATCH could
            # commit between our initial fetch and the merge. Race isn't fully
            # closed without SELECT FOR UPDATE, but the merge keeps both sides'
            # rows even if a PATCH commits during our transaction.
            await db.refresh(session, ["messages"])
            # Was this assistant reply genuinely new? `_store_session_response`
            # is re-entered from both the bridge persist and the WS handler
            # with the same text; the merge collapses them by identity. We
            # gate the unread ping on the same identity so the pip fires once.
            pre_keys = {
                _chat_message_key(m)
                for m in (session.messages or [])
                if isinstance(m, dict)
            }
            entry_key = _chat_message_key(entry)
            assistant_is_new = entry_key not in pre_keys
            merged = _merge_chat_messages(session.messages, new_rows)
            session.messages = merged[-50:]
            session.last_used_at = utcnow()
            # Capture before commit — expire_on_commit would detach these.
            notif_session_id = session.id
            notif_user_id = session.user_id
            notif_label = session.label
            # Only ping if this session is surfaced in a ChatTab — i.e. there
            # is a UI affordance that can ever clear the unread count via
            # clear-on-focus (AIAssistantPanel) or chat_tabs DELETE cleanup.
            # Ephemeral probe/CLI/bridge/mcp sessions that no human opened a
            # tab for would otherwise emit a chat_session unread that the
            # activity-bar aggregate badge counts forever (it sums ALL
            # chat_session unread) with no way to dismiss it — the "stuck at
            # N unread" bug. Match both the canonical id and the cli_session
            # alias because MCP-derived sessions key the tab by the alias.
            # Tab binding always precedes this call on every reply path
            # (_bind_and_persist_result binds before persisting; CP-A
            # early-binds on the live path), so a real chat's first reply is
            # never suppressed. Closing the tab deletes the row, so a late
            # drain to a closed tab self-heals instead of re-sticking.
            tab_match_ids = [notif_session_id]
            if session.cli_session_id and session.cli_session_id != notif_session_id:
                tab_match_ids.append(session.cli_session_id)
            has_tab_surface = (
                await db.execute(
                    select(ChatTab.id)
                    .where(ChatTab.session_id.in_(tab_match_ids))
                    .limit(1)
                )
            ).first() is not None
            await db.commit()

        # DEBUG-floor diagnostic for the chat.message emit gate. Flip the
        # logger floor to DEBUG when investigating "no unread dot" symptoms
        # to see exactly which side of the gate fired (assistant_is_new
        # True/False), with whose user_id, and what text identity matched.
        # Kept in tree because the failure mode is hard to reason about
        # from notification rows alone — see plan
        # `chat-unread-dot-regression`.
        log.debug(
            "store_session_response_decision session_id=%s assistant_is_new=%s "
            "has_tab_surface=%s user_id=%s pre_keys_count=%d entry_text_head=%r",
            session_id,
            assistant_is_new,
            has_tab_surface,
            notif_user_id,
            len(pre_keys),
            (assistant_response or "")[:60],
        )

        # Per-tab unread pip source (notification-system Phase 4a).
        # ref_type='chat_session' so cross-device tabs on the same session
        # share one unread state (convention: chat_tabs.py:27-34). Targeted,
        # not broadcast — chat tabs are user-private. Isolated from the
        # message-persist transaction so a notification failure can never
        # roll back the reply we just saved. Gated on `has_tab_surface` so
        # tab-less probe/CLI sessions don't accrue an uncleanable unread.
        if (
            assistant_is_new
            and assistant_response
            and assistant_response.strip()
            and has_tab_surface
        ):
            await _emit_chat_message_notification(
                session_id=notif_session_id,
                user_id=notif_user_id,
                label=notif_label,
                preview=assistant_response,
            )
    except Exception:
        # exception() includes the traceback — previously the bare warning
        # ate the cause and the chat-unread-dot regression hunt had no
        # signal beyond "no notification row exists". See plan
        # `chat-unread-dot-regression`.
        log.exception(
            "store_session_response_failed session_id=%s",
            session_id,
        )


async def _emit_chat_message_notification(
    *,
    session_id: str,
    user_id: int,
    label: str,
    preview: str,
    source: str = "assistant",
    ref_type: str = "chat_session",
) -> None:
    """Emit the chat unread/activity ping for one chat message.

    Assistant replies use ``ref_type="chat_session"`` (the blue unread pip).
    The user's own turn uses ``ref_type="chat_session_activity"``: a separate,
    pip-free channel that only nudges a SECOND device's chat-unread poll to
    re-pull the transcript, so a message typed elsewhere syncs cross-device —
    without lighting an "unread reply" pip for the user's own message.

    Best-effort and fully isolated: its own DB session + swallowed errors so
    it can never disturb the caller's message persistence.
    """
    import logging

    log = logging.getLogger(__name__)
    # DEBUG-floor diagnostic. Pairs with `store_session_response_decision`
    # — together they tell us whether the gate skipped, the emit threw, or
    # the row was created and the failure is downstream.
    log.debug(
        "emit_chat_message_notification_attempt session_id=%s user_id=%s",
        session_id,
        user_id,
    )
    try:
        from pixsim7.backend.main.api.v1.notifications import emit_notification
        from pixsim7.backend.main.infrastructure.database.session import (
            AsyncSessionLocal,
        )

        snippet = preview.strip().replace("\n", " ")
        if len(snippet) > 140:
            snippet = snippet[:139].rstrip() + "…"

        async with AsyncSessionLocal() as db:
            n = await emit_notification(
                db,
                title=label or "AI Assistant",
                body=snippet or None,
                category="chat",
                severity="info",
                source=source,
                event_type="chat.message",
                ref_type=ref_type,
                ref_id=str(session_id),
                broadcast=False,
                user_id=user_id,
                payload={"sessionId": str(session_id)},
            )
            await db.commit()
            log.debug(
                "emit_chat_message_notification_committed session_id=%s "
                "user_id=%s notif_id=%s",
                session_id,
                user_id,
                getattr(n, "id", None),
            )
    except Exception:
        # exception() includes the traceback. Previously a bare warning
        # ate the cause and the chat-unread-dot regression hunt had no
        # signal beyond "no notification row exists". See plan
        # `chat-unread-dot-regression`.
        log.exception(
            "emit_chat_message_notification_failed session_id=%s user_id=%s",
            session_id,
            user_id,
        )


async def _emit_ask_user_pending(
    *,
    tab_id: str,
    user_id: int | None,
    title: str | None = None,
    description: str | None = None,
) -> None:
    """Emit the per-tab 'pending question' nudge (notification-system Phase 4b).

    GENERIC across ask paths: this fires from the bridge confirmation gate
    (``ws_chat.py`` ``confirmation_request``), so it covers the PixSim
    ``ask_user`` MCP tool *and* Claude's harness ``AskUserQuestion`` — both
    funnel through that one gate.

    Keyed ``ref_type='chat_tab'`` / ``ref_id=tab_id`` (the cli_session_id is
    not reliably known mid-turn; tab_id always is, and the Phase 4a frontend
    already supports per-tab keying). At most ONE unread nudge per tab: the
    agent blocks on a single question at a time, so we clear any prior
    pending for this tab before inserting, keeping the scoped count binary.
    Best-effort + fully isolated (own DB session, swallowed errors) so it can
    never disturb the dispatch path.
    """
    import logging

    log = logging.getLogger(__name__)
    if not tab_id or user_id is None:
        return
    try:
        from sqlalchemy import update

        from pixsim7.backend.main.api.v1.notifications import emit_notification
        from pixsim7.backend.main.domain.platform.notification import (
            Notification,
        )
        from pixsim7.backend.main.infrastructure.database.session import (
            AsyncSessionLocal,
        )

        snippet = (title or "").strip().replace("\n", " ")
        if len(snippet) > 140:
            snippet = snippet[:139].rstrip() + "…"
        body = (description or "").strip().replace("\n", " ") or None

        async with AsyncSessionLocal() as db:
            # Collapse to one: clear any prior unread pending for this tab.
            await db.execute(
                update(Notification)
                .where(Notification.user_id == user_id)
                .where(Notification.ref_type == "chat_tab")
                .where(Notification.ref_id == str(tab_id))
                .where(Notification.event_type == "ask_user.pending")
                .where(Notification.read == False)  # noqa: E712
                .values(read=True)
            )
            await emit_notification(
                db,
                title=snippet or "Agent needs your input",
                body=body,
                category="agent_question",
                severity="warning",
                source="assistant",
                event_type="ask_user.pending",
                ref_type="chat_tab",
                ref_id=str(tab_id),
                broadcast=False,
                user_id=user_id,
                payload={"tabId": str(tab_id)},
            )
            await db.commit()
    except Exception as e:
        log.warning(
            "emit_ask_user_pending_failed tab_id=%s err=%s", tab_id, e
        )


async def _clear_ask_user_pending(
    *,
    tab_id: str,
    user_id: int | None,
) -> None:
    """Clear the per-tab pending-question nudge (Phase 4b s4).

    Called when the question is answered (``confirmation_response``) or the
    dispatch is aborted (``cancel``). Deliberately NOT called on generic
    turn-end/disconnect: a question can still be genuinely pending across a
    page reload, and that's exactly when the nudge must survive. Stale
    timed-out nudges self-heal via clear-on-focus (reuses Phase 4a
    ``mark-read-by-ref``). Best-effort + isolated.
    """
    import logging

    log = logging.getLogger(__name__)
    if not tab_id or user_id is None:
        return
    try:
        from sqlalchemy import update

        from pixsim7.backend.main.domain.platform.notification import (
            Notification,
        )
        from pixsim7.backend.main.infrastructure.database.session import (
            AsyncSessionLocal,
        )

        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Notification)
                .where(Notification.user_id == user_id)
                .where(Notification.ref_type == "chat_tab")
                .where(Notification.ref_id == str(tab_id))
                .where(Notification.event_type == "ask_user.pending")
                .where(Notification.read == False)  # noqa: E712
                .values(read=True)
            )
            await db.commit()
    except Exception as e:
        log.warning(
            "clear_ask_user_pending_failed tab_id=%s err=%s", tab_id, e
        )
