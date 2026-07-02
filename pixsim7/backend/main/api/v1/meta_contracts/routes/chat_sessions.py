"""Meta-contract chat sessions endpoints."""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from pixsim7.common.scope_helpers import (
    normalize_profile_id as _normalize_profile_id,
)
from sqlalchemy import select, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_current_user_optional, get_database
from pixsim7.backend.main.domain.docs.models import AgentActivityLog
from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
)
from pixsim7.backend.main.services.meta.cli_transcript import (
    CLAUDE_ENGINES as _CLAUDE_ENGINES,
    has_unanswered_user_tail as _has_unanswered_user_tail,
    load_recovered_tail as _load_recovered_tail,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.shared.chat_messages import (
    merge_chat_messages as _merge_chat_messages,
)

from ..models import (
    RegisterSessionRequest,
)
from ..system_prompt import (
    build_user_system_prompt,
)
from ..chat_store import (
    _upsert_chat_session,
)
from ..agent_send import (
    _normalize_agent_type_hint,
    _resolve_assistant_provider,
)

router = APIRouter(tags=["meta"])


@router.get("/agents/chat-sessions")
async def list_chat_sessions(
    engine: Optional[str] = Query(None, description="Filter by engine (claude, codex, api)"),
    status: Optional[str] = Query(None, description="Filter by status (active, archived). Defaults to 'active'."),
    limit: int = Query(20, ge=1, le=100),
    include_empty: bool = Query(False, description="Include sessions with zero messages"),
    user: Optional[Any] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """List recent chat sessions for the /resume picker, scoped by engine."""
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    effective_status = status or "active"

    if not include_empty and effective_status == "active":
        # Remove stale startup placeholders ("CLI session (...)") with no messages.
        prune_stmt = (
            update(ChatSession)
            .where(ChatSession.status == "active")
            .where(ChatSession.message_count == 0)
            .where(ChatSession.label.like("CLI session (%"))
            .values(status="archived")
        )
        if user:
            prune_stmt = prune_stmt.where(or_(ChatSession.user_id == user.id, ChatSession.user_id == 0))
        if engine:
            prune_stmt = prune_stmt.where(ChatSession.engine == engine)
        prune_result = await db.execute(prune_stmt)

        # Archive mcp/mcp-auto rows that never produced any work — empty
        # message_count, no agent_activity_log rows, idle for > 24h. The
        # auto-register path creates one per process and they otherwise
        # accumulate forever.
        activity_subq = (
            select(AgentActivityLog.session_id)
            .where(AgentActivityLog.session_id == ChatSession.id)
            .exists()
        )
        idle_cutoff = utcnow() - timedelta(hours=24)
        idle_prune_stmt = (
            update(ChatSession)
            .where(ChatSession.status == "active")
            .where(ChatSession.source.in_(["mcp", "mcp-auto"]))
            .where(ChatSession.message_count == 0)
            .where(ChatSession.last_used_at < idle_cutoff)
            .where(~activity_subq)
            .values(status="archived")
        )
        if user:
            idle_prune_stmt = idle_prune_stmt.where(or_(ChatSession.user_id == user.id, ChatSession.user_id == 0))
        if engine:
            idle_prune_stmt = idle_prune_stmt.where(ChatSession.engine == engine)
        idle_prune_result = await db.execute(idle_prune_stmt)

        if (getattr(prune_result, "rowcount", 0) or 0) > 0 or (getattr(idle_prune_result, "rowcount", 0) or 0) > 0:
            await db.commit()

    stmt = (
        select(ChatSession)
        .where(ChatSession.status == effective_status)
    )
    if user:
        # Include user's own sessions + shared sessions (user_id=0)
        stmt = stmt.where(or_(ChatSession.user_id == user.id, ChatSession.user_id == 0))
    if engine:
        stmt = stmt.where(ChatSession.engine == engine)
    if not include_empty:
        # MCP/CLI sessions never bump message_count (activity lives in
        # AgentActivityLog instead), so widen the filter to keep them
        # visible in the resume picker.
        stmt = stmt.where(
            or_(
                ChatSession.message_count > 0,
                ChatSession.source.in_(["mcp", "mcp-auto"]),
            )
        )
    stmt = stmt.order_by(ChatSession.last_used_at.desc()).limit(limit)

    sessions = (await db.execute(stmt)).scalars().all()
    return {
        "sessions": [
            {
                "id": s.id,
                "engine": s.engine,
                "profile_id": s.profile_id,
                "scope_key": s.scope_key,
                "last_plan_id": s.last_plan_id,
                "last_contract_id": s.last_contract_id,
                "label": s.label,
                # Agent-set identity mirrored from the tab — lets the resume
                # picker show the same glyph/subtitle the tab had when live.
                "icon": s.icon,
                "subtitle": s.subtitle,
                "message_count": s.message_count,
                "source": getattr(s, "source", None),
                "last_used_at": s.last_used_at.isoformat(),
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ],
    }


@router.get("/agents/chat-sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Get a single chat session by ID.

    Looks up first by primary key, then falls back to ``cli_session_id``
    so the frontend can resolve pasted Claude/Codex CLI resume hashes.

    Returns recent work_summary activity for any source — chat-source
    sessions can also accumulate work_summaries when the agent calls
    ``log_work`` mid-conversation, and the frontend surfaces them
    alongside the chat messages.
    """
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    session = await db.get(ChatSession, session_id)
    if not session:
        # Fall back to matching the agent-CLI-internal session ID.
        alt_rows = (await db.execute(
            select(ChatSession).where(ChatSession.cli_session_id == session_id).limit(1)
        )).scalars().all()
        session = alt_rows[0] if alt_rows else None
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    rows = (await db.execute(
        select(AgentActivityLog)
        .where(AgentActivityLog.session_id == session.id)
        .where(AgentActivityLog.action == "work_summary")
        .order_by(AgentActivityLog.timestamp.asc())
        .limit(20)
    )).scalars().all()
    activity: List[Dict[str, Any]] = [
        {
            "action": r.action,
            "detail": r.detail,
            "plan_id": r.plan_id,
            "contract_id": r.contract_id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "metadata": r.extra if isinstance(r.extra, dict) else None,
        }
        for r in rows
    ]
    session_source = getattr(session, "source", None)

    # Self-heal "response lost": when the snapshot ends on an unanswered user
    # turn, the assistant reply may exist only in the Claude CLI transcript
    # (the snapshot is lossy on interrupted turns / bridge restarts). Recover
    # it from the transcript so the frontend's "check again" actually works
    # instead of re-confirming the loss against a snapshot that will never
    # gain the reply. Gated cheaply on the unanswered-tail shape so healthy
    # sessions never touch the filesystem. See `services/meta/cli_transcript`.
    messages = session.messages
    cli_session_id = getattr(session, "cli_session_id", None)
    if (
        getattr(session, "engine", None) in _CLAUDE_ENGINES
        and cli_session_id
        and _has_unanswered_user_tail(messages)
    ):
        try:
            tail = await run_in_threadpool(
                _load_recovered_tail, cli_session_id, messages
            )
        except Exception:  # noqa: BLE001 - recovery is strictly best-effort
            tail = []
        if tail:
            merged = _merge_chat_messages(messages, tail)
            if len(merged) != len(messages or []):
                session.messages = merged
                session.message_count = len(merged)
                db.add(session)
                await db.commit()
                messages = merged

    return {
        "id": session.id,
        "cli_session_id": session.cli_session_id,
        "engine": session.engine,
        "profile_id": session.profile_id,
        "scope_key": session.scope_key,
        "label": session.label,
        "icon": session.icon,
        "subtitle": session.subtitle,
        "message_count": session.message_count,
        "messages": messages,
        "source": session_source,
        "activity": activity,
        "last_used_at": session.last_used_at.isoformat(),
    }


@router.patch("/agents/chat-sessions/{session_id}/messages")
async def save_chat_session_messages(
    session_id: str,
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Persist chat messages for a session (called by frontend on message changes).

    The client PATCH is merged with the current server state rather than
    overwriting it, so backend-only writes (bridge reply persist, drain
    placeholder) survive the next debounced sync. See ``_merge_chat_messages``
    for identity / ordering rules.
    """
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    messages = body.get("messages")
    if not isinstance(messages, list):
        raise HTTPException(status_code=422, detail="messages must be a list")

    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    merged = _merge_chat_messages(session.messages, messages)
    # Cap at 50 messages server-side — drop oldest, keep newest.
    capped = merged[-50:] if len(merged) > 50 else merged
    session.messages = capped
    session.message_count = len(capped)

    # Revive sessions stranded by the placeholder-prune race. The bridge
    # registers a `CLI session (…)` row with message_count=0; any
    # list_chat_sessions call in the window before the first message-persist
    # archives it (message_count==0 AND label LIKE 'CLI session (%'). Without
    # this, the conversation then accumulates 19+ real messages here but the
    # row stays status='archived' forever — invisible to the resume picker
    # despite holding the full transcript. A non-empty persist is proof the
    # session is live, so un-archive and bump last_used_at (this endpoint
    # otherwise never touched it, leaving the picker's sort key frozen at
    # registration time).
    if capped:
        if session.status == "archived":
            session.status = "active"
        session.last_used_at = utcnow()

    await db.commit()
    return {"ok": True, "count": len(capped)}


@router.delete("/agents/chat-sessions/{session_id}")
async def archive_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Archive a chat session (hide from /resume picker)."""
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "archived"
    await db.commit()
    return {"ok": True}


@router.post("/agents/chat-sessions/{session_id}/restore")
async def restore_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Restore an archived chat session back to active."""
    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "active"
    await db.commit()
    return {"ok": True}


def _is_generic_cli_profile(profile_id: Optional[str]) -> bool:
    return isinstance(profile_id, str) and profile_id.strip().lower().startswith("cli-")


async def _resolve_registration_profile_id(
    db: AsyncSession,
    *,
    user_id: int,
    profile_id: Optional[str],
    engine: Optional[str],
    principal_agent_type: Optional[str],
) -> Optional[str]:
    requested = _normalize_profile_id(profile_id)
    # Explicit non-generic profile IDs are treated as authoritative.
    if requested and not _is_generic_cli_profile(requested):
        return requested

    agent_type_hint = _normalize_agent_type_hint(engine) or _normalize_agent_type_hint(principal_agent_type)
    if not agent_type_hint:
        return requested

    try:
        from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile

        resolved = await resolve_agent_profile(
            db,
            user_id,
            None,
            agent_type=agent_type_hint,
        )
        if resolved:
            return resolved.id
    except Exception:
        pass

    # Preserve the original value if fallback resolution fails.
    return requested


@router.post("/agents/register-chat-session")
async def register_chat_session(
    payload: RegisterSessionRequest,
    _user: Optional[Any] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Register or update a CLI session for tracking (idempotent).

    Called by the MCP server on startup and by ``log_work`` on each summary.
    Uses the same ``_upsert_chat_session`` as the bridge path so both
    produce identical ChatSession records.
    """
    import logging as _stdlib_logging
    _stdlib_register_log = _stdlib_logging.getLogger(__name__)
    user_id = 0
    if _user:
        user_id = getattr(_user, 'user_id', None) or getattr(_user, 'id', 0) or 0
    # DEBUG-floor diagnostic. _upsert_chat_session now self-repairs
    # user_id=0 rows when a real user_id arrives, so a user_id=0 here
    # is no longer permanently fatal — but it's still useful to see
    # what auth the MCP register call carries.
    _stdlib_register_log.debug(
        "register_chat_session_auth session_id=%s user_id_resolved=%s "
        "user_present=%s principal_type=%s principal_id=%s on_behalf_of=%s",
        payload.session_id,
        user_id,
        _user is not None,
        getattr(_user, "principal_type", None),
        getattr(_user, "id", None),
        getattr(_user, "on_behalf_of", None),
    )

    from pixsim7.backend.main.domain.platform.agent_profile import ChatSession

    existing = await db.get(ChatSession, payload.session_id)
    created = existing is None

    resolved_profile_id = await _resolve_registration_profile_id(
        db,
        user_id=user_id,
        profile_id=payload.profile_id,
        engine=payload.engine,
        principal_agent_type=(getattr(_user, "agent_type", None) if _user else None),
    )

    await _upsert_chat_session(
        session_id=payload.session_id,
        user_id=user_id,
        engine=payload.engine,
        label=payload.label or "CLI session",
        profile_id=resolved_profile_id,
        scope_key=payload.scope_key,
        last_plan_id=payload.last_plan_id,
        source=payload.source,
    )

    resumed = not created

    return {
        "ok": True,
        "created": created,
        "resumed": resumed,
        "session_id": payload.session_id,
        "profile_id": resolved_profile_id,
    }


@router.get("/agents/system-prompt-preview")
async def get_system_prompt_preview(
    profile_id: Optional[str] = Query(None, description="Profile ID to include persona"),
    focus: Optional[str] = Query(None, description="Comma-separated focus capability tags to filter the prompt"),
    engine: Optional[str] = Query(None, description="Delivery engine the chat will use (e.g. 'api', 'claude', 'codex'); mirrors send-message so the preview matches what is actually sent"),
    user: Optional[Any] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Return the effective system prompt and available focus areas for the chat UI.

    Combines the base assistant prompt with the profile persona (if any).
    Also returns the focus areas from the user.assistant contract so the
    frontend can render toggleable category chips.

    The base prompt is resolved identically to ``send-message``: the
    dev/coding-agent workflow bullets are included only when the resolved
    delivery method is the tool-capable bridge (not the direct ``api`` path),
    so the preview reflects exactly what will be sent.
    """
    focus_list = [f.strip() for f in focus.split(",") if f.strip()] if focus else None

    # Mirror send-message's method resolution so include_agent_workflow matches.
    _provider_id, _model_id, method = await _resolve_assistant_provider(user.id if user else None)
    if engine == "api":
        method = "api"

    base = build_user_system_prompt(
        focus=focus_list, include_agent_workflow=(method != "api")
    )
    persona: Optional[str] = None

    if profile_id:
        try:
            from pixsim7.backend.main.api.v1.agent_profiles import resolve_agent_profile
            profile = await resolve_agent_profile(db, user.id if user else 0, profile_id)
            if profile and profile.system_prompt:
                persona = profile.system_prompt
        except Exception:
            pass

    # Expose focus areas from user.assistant.provides only.
    # Convention: "parent:child" in related contracts → nested under parent
    # if the parent is in user.assistant.provides.
    focus_areas: List[Dict[str, Any]] = []
    contract = meta_contract_registry.get_or_none("user.assistant")
    if contract and contract.provides:
        # Collect child tags from related contracts (parent:child convention)
        parent_children: Dict[str, List[Dict[str, str]]] = {}
        for related_id in (contract.relates_to or []):
            related = meta_contract_registry.get_or_none(related_id)
            if not related:
                continue
            for cap in related.provides:
                if ":" in cap:
                    parent, child = cap.split(":", 1)
                    if parent in contract.provides:
                        parent_children.setdefault(parent, []).append({
                            "id": cap,
                            "label": child.replace("_", " ").title(),
                        })

        for cap in contract.provides:
            entry: Dict[str, Any] = {
                "id": cap,
                "label": cap.replace("_", " ").title(),
            }
            if cap in parent_children:
                entry["children"] = parent_children[cap]
            focus_areas.append(entry)

    return {"base_prompt": base, "persona": persona, "focus_areas": focus_areas}
