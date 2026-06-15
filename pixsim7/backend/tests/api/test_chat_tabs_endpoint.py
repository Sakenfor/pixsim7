"""End-to-end coverage for /chat-tabs CRUD endpoints.

Calls the endpoint functions directly with a fake AsyncSession - same
pattern as ``test_automation_preset_endpoints.py``. Verifies:

* Owner scoping on every endpoint (other users' tabs return 403/missing).
* DELETE removes the ChatTab but never touches the underlying
  ChatSession (the Option-B invariant from plan
  ``chat-tab-server-persistence``).
* Auto-creation of a ChatSession when POST omits ``session_id``.
* PATCH semantics: ``exclude_unset`` means absent fields are untouched
  while explicit ``null`` clears nullable fields like ``plan_id``.
* Reorder is all-or-nothing - a foreign or unknown id rejects the
  whole request (no partial writes).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-tabs-endpoint",
    "label": "Chat Tabs CRUD Endpoint Tests",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "chat-tabs",
    "covers": [
        "pixsim7/backend/main/api/v1/chat_tabs.py",
        "pixsim7/backend/main/domain/platform/agent_profile.py",
    ],
    "order": 27.5,
}

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from pixsim7.backend.main.api.v1.chat_tabs import (
    ChatTabCreateRequest,
    ChatTabReorderEntry,
    ChatTabReorderRequest,
    ChatTabUpdateRequest,
    NOTIF_REF_TYPE_CHAT_SESSION,
    NOTIF_REF_TYPE_CHAT_TAB,
    create_chat_tab,
    delete_chat_tab,
    list_chat_tabs,
    list_orphan_sessions,
    reorder_chat_tabs,
    update_chat_tab,
)
from pixsim7.backend.main.domain.platform.agent_profile import (
    ChatSession,
    ChatTab,
)
from pixsim7.backend.main.domain.platform.notification import Notification


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


def _user(user_id: int) -> SimpleNamespace:
    return SimpleNamespace(id=user_id, is_admin=lambda: False)


class _ScalarsResult:
    def __init__(self, rows: List[Any]):
        self._rows = rows

    def all(self) -> List[Any]:
        return list(self._rows)

    def first(self) -> Any:
        return self._rows[0] if self._rows else None


class _ExecuteResult:
    def __init__(self, rows: List[Any], scalar: Any = None):
        self._rows = rows
        self._scalar = scalar

    def scalars(self) -> _ScalarsResult:
        return _ScalarsResult(self._rows)

    def scalar(self) -> Any:
        return self._scalar


@dataclass
class _FakeSession:
    """In-memory async session for ChatTab + ChatSession.

    Models ``get`` / ``add`` / ``delete`` / ``commit`` / ``refresh`` plus
    enough of ``execute`` to drive the three query shapes the endpoints
    actually issue: ``select(ChatTab).where(user_id=...).order_by(...)``,
    ``select(func.max(order_index)).where(user_id=...)``, and the
    reorder ``id IN (...)`` variant.
    """

    tabs: Dict[UUID, ChatTab] = field(default_factory=dict)
    sessions: Dict[str, ChatSession] = field(default_factory=dict)
    notifications: Dict[UUID, Notification] = field(default_factory=dict)
    commits: int = 0
    deleted_tabs: List[ChatTab] = field(default_factory=list)
    deleted_sessions: List[ChatSession] = field(default_factory=list)
    flushes: int = 0

    def seed_tab(self, tab: ChatTab) -> ChatTab:
        self.tabs[tab.id] = tab
        return tab

    def seed_session(self, session: ChatSession) -> ChatSession:
        self.sessions[session.id] = session
        return session

    def seed_notification(self, notif: Notification) -> Notification:
        self.notifications[notif.id] = notif
        return notif

    async def get(self, model: Any, key: Any) -> Optional[Any]:
        if model is ChatTab:
            return self.tabs.get(key)
        if model is ChatSession:
            return self.sessions.get(key)
        return None

    def add(self, entity: Any) -> None:
        if isinstance(entity, ChatTab):
            self.tabs[entity.id] = entity
        elif isinstance(entity, ChatSession):
            self.sessions[entity.id] = entity

    async def delete(self, entity: Any) -> None:
        if isinstance(entity, ChatTab):
            self.deleted_tabs.append(entity)
            self.tabs.pop(entity.id, None)
        elif isinstance(entity, ChatSession):
            self.deleted_sessions.append(entity)
            self.sessions.pop(entity.id, None)

    async def commit(self) -> None:
        self.commits += 1

    async def flush(self) -> None:
        self.flushes += 1

    async def refresh(self, entity: Any) -> None:
        # In-memory entities don't need a server round-trip.
        return None

    async def execute(self, stmt: Any) -> _ExecuteResult:
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()

        # max(order_index) for a user
        if "max(" in sql and "order_index" in sql:
            user_id = _extract_user_id(sql)
            indices = [
                t.order_index for t in self.tabs.values() if t.user_id == user_id
            ]
            return _ExecuteResult(rows=[], scalar=(max(indices) if indices else None))

        # count(chat_tabs.id) — used by delete_chat_tab's "remaining tabs for
        # this session" check before mark-reading session-scoped notifications
        # (plan checkpoint D).
        if "count(" in sql and "chat_tabs" in sql:
            user_id = _extract_user_id(sql)
            session_id = _extract_session_id(sql)
            matches = [
                t for t in self.tabs.values()
                if t.user_id == user_id and t.session_id == session_id
            ]
            return _ExecuteResult(rows=[], scalar=len(matches))

        # UPDATE notifications SET read=true WHERE … — checkpoint D
        # orphan-cleanup path. We only need to honour the (ref_type, ref_id,
        # user_id) filters my code emits; other fields (created_at, severity)
        # are read-only here. The compiled SQL is schema-qualified
        # (``dev_meta.notifications``) so we match on the suffix.
        if sql.lstrip().startswith("update") and "notifications" in sql and "set read" in sql:
            user_id = _extract_user_id(sql)
            matched_pairs = _extract_ref_pairs(sql)
            for n in self.notifications.values():
                if user_id is not None and n.user_id != user_id:
                    continue
                if (n.ref_type, n.ref_id) not in matched_pairs:
                    continue
                n.read = True
            return _ExecuteResult(rows=[])

        # select(ChatSession) — checkpoint E orphan-sessions endpoint
        if "chat_sessions" in sql:
            rows = list(self.sessions.values())
            user_id = _extract_user_id(sql)
            # Code path uses `user_id == X OR user_id == 0` — accept that
            # union when a literal `or` is present.
            if user_id is not None and " or " in sql and "user_id = 0" in sql:
                rows = [s for s in rows if s.user_id in (user_id, 0)]
            elif user_id is not None:
                rows = [s for s in rows if s.user_id == user_id]
            # NOT IN (… session_ids from chat_tabs …)
            occupied = _extract_not_in_session_ids(sql, self.tabs, user_id)
            if occupied is not None:
                rows = [s for s in rows if s.id not in occupied]
            # status != 'archived'
            if "status !=" in sql or "status <>" in sql:
                rows = [s for s in rows if s.status != "archived"]
            # ORDER BY last_used_at DESC
            if "order by" in sql and "last_used_at" in sql:
                rows.sort(key=lambda s: s.last_used_at, reverse=True)
            # LIMIT N
            limit = _extract_limit(sql)
            if limit is not None:
                rows = rows[:limit]
            return _ExecuteResult(rows=rows)

        # select(ChatTab) — filter by user_id, optional id IN, ordered
        if "chat_tabs" in sql:
            rows = list(self.tabs.values())
            user_id = _extract_user_id(sql)
            if user_id is not None:
                rows = [t for t in rows if t.user_id == user_id]
            id_filter = _extract_id_in(sql)
            if id_filter is not None:
                rows = [t for t in rows if t.id in id_filter]
            if "order by" in sql and "order_index" in sql:
                rows.sort(key=lambda t: (t.order_index, t.created_at))
            return _ExecuteResult(rows=rows)

        return _ExecuteResult(rows=[])


def _extract_user_id(sql: str) -> Optional[int]:
    m = re.search(r"user_id\s*=\s*(\d+)", sql)
    return int(m.group(1)) if m else None


def _extract_session_id(sql: str) -> Optional[str]:
    """Pull the literal session_id from a `session_id = '<id>'` clause."""
    m = re.search(r"session_id\s*=\s*'([^']+)'", sql)
    return m.group(1) if m else None


def _extract_limit(sql: str) -> Optional[int]:
    m = re.search(r"\blimit\s+(\d+)", sql)
    return int(m.group(1)) if m else None


def _extract_ref_pairs(sql: str) -> set:
    """Collect (ref_type, ref_id) literals from the UPDATE notifications WHERE clause.

    My code emits ``or_(and_(ref_type='chat_tab', ref_id='<uuid>'), …)`` —
    we walk the compiled SQL looking for adjacent ``ref_type = '…' AND
    ref_id = '…'`` pairs. The pairs land in a set so duplicate-emitting
    filters don't double-count.
    """
    pairs: set = set()
    # Match `[schema.][table.]ref_type = 'x' AND [schema.][table.]ref_id = 'y'`.
    # The compiled SQL prefixes columns with `dev_meta.notifications.` because
    # of the table's schema qualifier, so we tolerate optional dotted prefixes.
    pattern = re.compile(
        r"(?:\w+\.)*ref_type\s*=\s*'([^']+)'\s+and\s+(?:\w+\.)*ref_id\s*=\s*'([^']+)'",
        re.IGNORECASE,
    )
    for ref_type, ref_id in pattern.findall(sql):
        pairs.add((ref_type, ref_id))
    return pairs


def _extract_not_in_session_ids(
    sql: str, tabs: Dict[UUID, ChatTab], user_id: Optional[int]
) -> Optional[set]:
    """For the orphan-sessions endpoint: resolve the ``id NOT IN (subselect)``.

    The compiled SQL embeds the subselect as ``id NOT IN (SELECT
    chat_tabs.session_id … WHERE user_id = …)`` — rather than re-parse the
    subselect, we approximate it by reading our in-memory tabs for the same
    user (which is exactly what the subselect computes).
    """
    if "not in" not in sql or "chat_tabs" not in sql or user_id is None:
        return None
    # Mirror the production filter that excludes NULL session_ids from the
    # occupied subquery — otherwise NULL-bound tabs would still hide every
    # session via SQL three-valued NOT IN semantics.
    return {
        t.session_id
        for t in tabs.values()
        if t.user_id == user_id and t.session_id is not None
    }


def _extract_id_in(sql: str) -> Optional[set]:
    m = re.search(r"\bid\s+in\s*\(([^)]+)\)", sql)
    if not m:
        return None
    ids: set = set()
    for raw in m.group(1).split(","):
        token = raw.strip().strip("'\"")
        # Drop CAST(... AS UUID) wrappers some dialects emit.
        token = re.sub(r"^cast\(\s*'", "", token, flags=re.IGNORECASE)
        token = re.sub(r"'\s*as\s+uuid\s*\)$", "", token, flags=re.IGNORECASE)
        try:
            ids.add(UUID(token))
        except ValueError:
            continue
    return ids


def _make_session(
    user_id: int,
    session_id: Optional[str] = None,
    *,
    engine: str = "claude",
    profile_id: Optional[str] = None,
) -> ChatSession:
    return ChatSession(
        id=session_id or uuid4().hex,
        user_id=user_id,
        engine=engine,
        profile_id=profile_id,
        label="Untitled",
        source="chat",
        created_at=datetime.now(timezone.utc),
        last_used_at=datetime.now(timezone.utc),
    )


def _make_tab(
    user_id: int,
    *,
    session_id: Optional[str] = None,
    order_index: int = 0,
    label: str = "Tab",
    plan_id: Optional[str] = None,
    draft: Optional[str] = None,
    pinned: bool = False,
) -> ChatTab:
    return ChatTab(
        id=uuid4(),
        user_id=user_id,
        session_id=session_id or uuid4().hex,
        label=label,
        draft=draft,
        order_index=order_index,
        plan_id=plan_id,
        pinned=pinned,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# list_chat_tabs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_returns_only_callers_tabs() -> None:
    db = _FakeSession()
    db.seed_tab(_make_tab(user_id=1, label="mine-1"))
    db.seed_tab(_make_tab(user_id=2, label="theirs"))
    db.seed_tab(_make_tab(user_id=1, label="mine-2"))

    result = await list_chat_tabs(user=_user(1), db=db)
    labels = sorted(t.label for t in result.tabs)
    assert labels == ["mine-1", "mine-2"]


@pytest.mark.asyncio
async def test_list_orders_by_order_index() -> None:
    db = _FakeSession()
    db.seed_tab(_make_tab(user_id=1, label="c", order_index=2))
    db.seed_tab(_make_tab(user_id=1, label="a", order_index=0))
    db.seed_tab(_make_tab(user_id=1, label="b", order_index=1))

    result = await list_chat_tabs(user=_user(1), db=db)
    assert [t.label for t in result.tabs] == ["a", "b", "c"]


@pytest.mark.asyncio
async def test_list_empty_for_user_with_no_tabs() -> None:
    db = _FakeSession()
    db.seed_tab(_make_tab(user_id=2, label="theirs"))

    result = await list_chat_tabs(user=_user(1), db=db)
    assert result.tabs == []


@pytest.mark.asyncio
async def test_list_includes_session_engine_and_profile_hints() -> None:
    db = _FakeSession()
    session = db.seed_session(
        _make_session(
            user_id=1,
            session_id="sess-hints",
            engine="codex",
            profile_id="assistant:code-helper",
        )
    )
    db.seed_tab(_make_tab(user_id=1, session_id=session.id, label="bound"))

    result = await list_chat_tabs(user=_user(1), db=db)
    assert len(result.tabs) == 1
    assert result.tabs[0].engine == "codex"
    assert result.tabs[0].profileId == "assistant:code-helper"


# ---------------------------------------------------------------------------
# create_chat_tab
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_leaves_session_unbound_when_omitted() -> None:
    """Tabs are now created unbound; the bridge's first-turn cli_session_id
    PATCHes the binding via ws_chat's `_bind_tab_to_session`. Auto-minting
    a synthetic session UUID at create time made Claude's ``--resume`` fail
    instantly with an empty-result error (plan ``chat-tab-server-persistence``
    — first-turn resume-failure fix).
    """
    db = _FakeSession()
    payload = ChatTabCreateRequest(label="new chat")

    result = await create_chat_tab(payload=payload, user=_user(1), db=db)

    assert result.label == "new chat"
    assert result.sessionId is None
    # No ChatSession created; only the ChatTab row is seeded.
    assert db.sessions == {}
    assert UUID(result.id) in db.tabs
    assert db.tabs[UUID(result.id)].session_id is None


@pytest.mark.asyncio
async def test_create_uses_existing_session_when_provided() -> None:
    db = _FakeSession()
    session = _make_session(user_id=1, session_id="session-abc")
    db.seed_session(session)

    payload = ChatTabCreateRequest(session_id="session-abc", label="bound")
    result = await create_chat_tab(payload=payload, user=_user(1), db=db)

    assert result.sessionId == "session-abc"
    # No new session created beyond the seeded one.
    assert len(db.sessions) == 1


@pytest.mark.asyncio
async def test_create_rejects_other_users_session() -> None:
    db = _FakeSession()
    db.seed_session(_make_session(user_id=2, session_id="theirs"))

    payload = ChatTabCreateRequest(session_id="theirs")
    with pytest.raises(HTTPException) as exc:
        await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_create_accepts_system_session_user_id_zero() -> None:
    """Resume-from-history must work for legacy / system-owned sessions.

    ``meta_contracts.list_chat_sessions`` (the resume picker source) surfaces
    sessions with ``user_id == user.id OR user_id == 0``. The tab-create
    endpoint must accept the same set or the optimistic insert rolls back
    and the resumed tab vanishes on screen.
    """
    db = _FakeSession()
    db.seed_session(_make_session(user_id=0, session_id="legacy-shared"))

    payload = ChatTabCreateRequest(session_id="legacy-shared", label="resumed")
    result = await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert result.sessionId == "legacy-shared"
    assert result.label == "resumed"


@pytest.mark.asyncio
async def test_create_rejects_unknown_session() -> None:
    db = _FakeSession()
    payload = ChatTabCreateRequest(session_id="does-not-exist")
    with pytest.raises(HTTPException) as exc:
        await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_create_appends_to_end_when_order_index_omitted() -> None:
    db = _FakeSession()
    db.seed_tab(_make_tab(user_id=1, order_index=0))
    db.seed_tab(_make_tab(user_id=1, order_index=5))
    # Another user's higher index must NOT affect our append.
    db.seed_tab(_make_tab(user_id=2, order_index=99))

    payload = ChatTabCreateRequest()
    result = await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert result.orderIndex == 6


@pytest.mark.asyncio
async def test_create_first_tab_starts_at_zero() -> None:
    db = _FakeSession()
    payload = ChatTabCreateRequest()
    result = await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert result.orderIndex == 0


@pytest.mark.asyncio
async def test_create_honours_explicit_order_index() -> None:
    db = _FakeSession()
    payload = ChatTabCreateRequest(order_index=42)
    result = await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert result.orderIndex == 42


@pytest.mark.asyncio
async def test_create_honours_client_provided_id() -> None:
    db = _FakeSession()
    client_id = uuid4()

    payload = ChatTabCreateRequest(id=client_id, label="optimistic")
    result = await create_chat_tab(payload=payload, user=_user(1), db=db)

    # Server uses the id the client minted — enables sync optimistic UI.
    assert result.id == str(client_id)
    assert client_id in db.tabs


@pytest.mark.asyncio
async def test_create_rejects_duplicate_client_id() -> None:
    db = _FakeSession()
    existing = _make_tab(user_id=1)
    db.seed_tab(existing)

    payload = ChatTabCreateRequest(id=existing.id, label="collision")
    with pytest.raises(HTTPException) as exc:
        await create_chat_tab(payload=payload, user=_user(1), db=db)
    assert exc.value.status_code == 409


# ---------------------------------------------------------------------------
# update_chat_tab
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_partial_only_changes_provided_fields() -> None:
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(
        user_id=1,
        label="original",
        plan_id="plan-keep",
        draft="keep draft",
        pinned=False,
    ))

    payload = ChatTabUpdateRequest(label="renamed")
    result = await update_chat_tab(
        tab_id=tab.id, payload=payload, user=_user(1), db=db
    )

    assert result.label == "renamed"
    assert result.planId == "plan-keep"  # untouched
    assert result.draft == "keep draft"  # untouched
    assert result.pinned is False  # untouched


@pytest.mark.asyncio
async def test_update_null_clears_plan_id() -> None:
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=1, plan_id="plan-old"))

    payload = ChatTabUpdateRequest(plan_id=None)
    # Pydantic v2: explicit None on an Optional field counts as "set".
    payload = ChatTabUpdateRequest.model_validate({"plan_id": None})
    result = await update_chat_tab(
        tab_id=tab.id, payload=payload, user=_user(1), db=db
    )
    assert result.planId is None


@pytest.mark.asyncio
async def test_update_other_users_tab_403() -> None:
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=2))

    with pytest.raises(HTTPException) as exc:
        await update_chat_tab(
            tab_id=tab.id,
            payload=ChatTabUpdateRequest(label="hack"),
            user=_user(1),
            db=db,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_update_missing_tab_404() -> None:
    db = _FakeSession()
    with pytest.raises(HTTPException) as exc:
        await update_chat_tab(
            tab_id=uuid4(),
            payload=ChatTabUpdateRequest(label="x"),
            user=_user(1),
            db=db,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_binds_session_id_to_existing_session() -> None:
    """First-turn bind path: ws_chat's `_bind_tab_to_session` writes the
    cli_session_id, but a client-side PATCH against an existing ChatSession
    must also succeed (used by explicit re-bind flows). Plan
    ``chat-tab-server-persistence`` — first-turn resume-failure fix.
    """
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=1, session_id=None))
    # ChatTab created without a session_id (the new default after the fix).
    tab.session_id = None
    db.seed_session(_make_session(user_id=1, session_id="claude-real-uuid"))

    payload = ChatTabUpdateRequest(session_id="claude-real-uuid")
    result = await update_chat_tab(
        tab_id=tab.id, payload=payload, user=_user(1), db=db,
    )
    assert result.sessionId == "claude-real-uuid"
    assert db.tabs[tab.id].session_id == "claude-real-uuid"


@pytest.mark.asyncio
async def test_update_session_id_rejects_unknown_session() -> None:
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=1, session_id=None))
    tab.session_id = None

    payload = ChatTabUpdateRequest(session_id="does-not-exist")
    with pytest.raises(HTTPException) as exc:
        await update_chat_tab(
            tab_id=tab.id, payload=payload, user=_user(1), db=db,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_session_id_rejects_other_users_session() -> None:
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=1, session_id=None))
    tab.session_id = None
    db.seed_session(_make_session(user_id=2, session_id="theirs"))

    payload = ChatTabUpdateRequest(session_id="theirs")
    with pytest.raises(HTTPException) as exc:
        await update_chat_tab(
            tab_id=tab.id, payload=payload, user=_user(1), db=db,
        )
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# delete_chat_tab — the key Option-B invariant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_removes_tab_but_preserves_session() -> None:
    db = _FakeSession()
    session = db.seed_session(_make_session(user_id=1, session_id="keep-me"))
    tab = db.seed_tab(_make_tab(user_id=1, session_id="keep-me"))

    result = await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)

    assert result == {"ok": True}
    assert tab.id not in db.tabs
    # Critical: the underlying ChatSession survives so it can be reopened.
    assert session.id in db.sessions
    assert db.deleted_sessions == []


@pytest.mark.asyncio
async def test_delete_snapshots_tab_identity_onto_session() -> None:
    """Closing a tab persists its real name/icon/subtitle onto the session.

    The ChatSession.label is otherwise a generic "CLI session (…)" placeholder
    (or the last message); the human name lives on the ChatTab. Since the tab
    row is deleted on close, its identity must be snapshotted onto the session
    so the Recent Chats picker keeps showing the real name afterwards.
    """
    db = _FakeSession()
    session = db.seed_session(_make_session(user_id=1, session_id="keep-me"))
    session.label = "CLI session (keep-me)"
    tab = db.seed_tab(_make_tab(user_id=1, session_id="keep-me", label="variables etc"))
    tab.icon = "clipboard"
    tab.subtitle = "plan: prompt-variable-placeholders"

    await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)

    assert session.id in db.sessions  # survives
    assert session.label == "variables etc"
    assert session.icon == "clipboard"
    assert session.subtitle == "plan: prompt-variable-placeholders"


@pytest.mark.asyncio
async def test_delete_untitled_tab_does_not_clobber_session_label() -> None:
    """The "Untitled" create-time default is not a real name — closing such a
    tab must leave the session's own (possibly meaningful) label intact, and an
    empty tab icon/subtitle must not wipe an existing session one.
    """
    db = _FakeSession()
    session = db.seed_session(_make_session(user_id=1, session_id="keep-me"))
    session.label = "real session label"
    session.icon = "sparkles"
    session.subtitle = "kept"
    tab = db.seed_tab(_make_tab(user_id=1, session_id="keep-me", label="Untitled"))

    await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)

    assert session.label == "real session label"
    assert session.icon == "sparkles"
    assert session.subtitle == "kept"


@pytest.mark.asyncio
async def test_delete_other_users_tab_403() -> None:
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=2))

    with pytest.raises(HTTPException) as exc:
        await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)
    assert exc.value.status_code == 403
    # And the tab is still there.
    assert tab.id in db.tabs


@pytest.mark.asyncio
async def test_delete_missing_tab_404() -> None:
    db = _FakeSession()
    with pytest.raises(HTTPException) as exc:
        await delete_chat_tab(tab_id=uuid4(), user=_user(1), db=db)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_unbound_tab_no_session_cleanup() -> None:
    """A tab created but never first-turn-bound has ``session_id = NULL``.
    Deleting it must succeed and skip the session-scoped notification
    cleanup branch (no session to reference).
    """
    db = _FakeSession()
    tab = db.seed_tab(_make_tab(user_id=1))
    tab.session_id = None

    result = await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)

    assert result == {"ok": True}
    assert tab.id not in db.tabs
    # No ChatSession was created or deleted.
    assert db.sessions == {}
    assert db.deleted_sessions == []


# ---------------------------------------------------------------------------
# reorder_chat_tabs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reorder_updates_indexes() -> None:
    db = _FakeSession()
    a = db.seed_tab(_make_tab(user_id=1, label="a", order_index=0))
    b = db.seed_tab(_make_tab(user_id=1, label="b", order_index=1))
    c = db.seed_tab(_make_tab(user_id=1, label="c", order_index=2))

    payload = ChatTabReorderRequest(tabs=[
        ChatTabReorderEntry(id=str(a.id), order_index=2),
        ChatTabReorderEntry(id=str(b.id), order_index=0),
        ChatTabReorderEntry(id=str(c.id), order_index=1),
    ])
    result = await reorder_chat_tabs(payload=payload, user=_user(1), db=db)

    assert result == {"ok": True, "updated": 3}
    assert a.order_index == 2
    assert b.order_index == 0
    assert c.order_index == 1


@pytest.mark.asyncio
async def test_reorder_rejects_foreign_tab_no_partial_writes() -> None:
    db = _FakeSession()
    mine = db.seed_tab(_make_tab(user_id=1, order_index=0))
    theirs = db.seed_tab(_make_tab(user_id=2, order_index=0))

    payload = ChatTabReorderRequest(tabs=[
        ChatTabReorderEntry(id=str(mine.id), order_index=5),
        ChatTabReorderEntry(id=str(theirs.id), order_index=5),
    ])
    with pytest.raises(HTTPException) as exc:
        await reorder_chat_tabs(payload=payload, user=_user(1), db=db)
    assert exc.value.status_code == 400
    # Critical: even MY own tab in the payload wasn't moved — all-or-nothing.
    assert mine.order_index == 0
    assert theirs.order_index == 0
    assert db.commits == 0


@pytest.mark.asyncio
async def test_reorder_empty_is_noop() -> None:
    db = _FakeSession()
    result = await reorder_chat_tabs(
        payload=ChatTabReorderRequest(tabs=[]),
        user=_user(1),
        db=db,
    )
    assert result == {"ok": True, "updated": 0}
    assert db.commits == 0


@pytest.mark.asyncio
async def test_reorder_only_writes_tabs_whose_index_actually_changed() -> None:
    db = _FakeSession()
    a = db.seed_tab(_make_tab(user_id=1, order_index=0))
    b = db.seed_tab(_make_tab(user_id=1, order_index=1))

    # Both entries match current indexes — no actual change.
    payload = ChatTabReorderRequest(tabs=[
        ChatTabReorderEntry(id=str(a.id), order_index=0),
        ChatTabReorderEntry(id=str(b.id), order_index=1),
    ])
    result = await reorder_chat_tabs(payload=payload, user=_user(1), db=db)
    assert result == {"ok": True, "updated": 0}


# ---------------------------------------------------------------------------
# delete_chat_tab — orphan-notification cleanup (checkpoint D)
# ---------------------------------------------------------------------------


def _make_notification(
    user_id: int,
    ref_type: str,
    ref_id: str,
    *,
    read: bool = False,
) -> Notification:
    return Notification(
        id=uuid4(),
        title="agent ping",
        body=None,
        category="agent",
        severity="info",
        source="agent:test",
        event_type="chat.message",
        ref_type=ref_type,
        ref_id=ref_id,
        broadcast=False,
        user_id=user_id,
        read=read,
        created_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_delete_marks_per_tab_notifications_read() -> None:
    """Closing a tab always clears notifications scoped to that tab id."""
    db = _FakeSession()
    session = _make_session(user_id=1, session_id="sess-A")
    db.seed_session(session)
    tab = db.seed_tab(_make_tab(user_id=1, session_id="sess-A"))
    notif = db.seed_notification(
        _make_notification(user_id=1, ref_type=NOTIF_REF_TYPE_CHAT_TAB, ref_id=str(tab.id))
    )

    await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)

    assert notif.read is True


@pytest.mark.asyncio
async def test_delete_clears_session_notifications_when_last_tab() -> None:
    """When the last tab for a session is closed, session-scoped notifs clear too."""
    db = _FakeSession()
    db.seed_session(_make_session(user_id=1, session_id="sess-final"))
    tab = db.seed_tab(_make_tab(user_id=1, session_id="sess-final"))
    session_notif = db.seed_notification(
        _make_notification(
            user_id=1,
            ref_type=NOTIF_REF_TYPE_CHAT_SESSION,
            ref_id="sess-final",
        )
    )

    await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)
    assert session_notif.read is True


@pytest.mark.asyncio
async def test_delete_preserves_session_notifications_when_other_tabs_remain() -> None:
    """Cross-device safety: another tab on the same session keeps the unread alive."""
    db = _FakeSession()
    db.seed_session(_make_session(user_id=1, session_id="sess-shared"))
    closing = db.seed_tab(_make_tab(user_id=1, session_id="sess-shared"))
    other = db.seed_tab(_make_tab(user_id=1, session_id="sess-shared"))
    void = other  # noqa: F841  (kept just for clarity in the test body)
    session_notif = db.seed_notification(
        _make_notification(
            user_id=1,
            ref_type=NOTIF_REF_TYPE_CHAT_SESSION,
            ref_id="sess-shared",
        )
    )

    await delete_chat_tab(tab_id=closing.id, user=_user(1), db=db)
    # Other tab still binds the session → session notif stays unread.
    assert session_notif.read is False


@pytest.mark.asyncio
async def test_delete_does_not_touch_other_users_notifications() -> None:
    """User scoping: notifs owned by another user are never written by my delete."""
    db = _FakeSession()
    db.seed_session(_make_session(user_id=1, session_id="sess-mine"))
    tab = db.seed_tab(_make_tab(user_id=1, session_id="sess-mine"))
    # Same ref_id but different user_id — a hypothetical cross-account notif.
    foreign = db.seed_notification(
        _make_notification(user_id=2, ref_type=NOTIF_REF_TYPE_CHAT_TAB, ref_id=str(tab.id))
    )

    await delete_chat_tab(tab_id=tab.id, user=_user(1), db=db)
    assert foreign.read is False


# ---------------------------------------------------------------------------
# list_orphan_sessions (checkpoint E)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orphan_sessions_excludes_sessions_with_open_tabs() -> None:
    """Only sessions with NO ChatTab row for the caller should be returned."""
    db = _FakeSession()
    bound = _make_session(user_id=1, session_id="sess-bound")
    orphan = _make_session(user_id=1, session_id="sess-orphan")
    db.seed_session(bound)
    db.seed_session(orphan)
    db.seed_tab(_make_tab(user_id=1, session_id="sess-bound"))

    result = await list_orphan_sessions(user=_user(1), db=db)
    ids = [s.id for s in result.sessions]
    assert ids == ["sess-orphan"]


@pytest.mark.asyncio
async def test_orphan_sessions_includes_system_user_zero() -> None:
    """user_id=0 system/legacy sessions are surfaceable for resume (mirrors create_chat_tab)."""
    db = _FakeSession()
    db.seed_session(_make_session(user_id=0, session_id="sess-system"))

    result = await list_orphan_sessions(user=_user(1), db=db)
    ids = [s.id for s in result.sessions]
    assert "sess-system" in ids


@pytest.mark.asyncio
async def test_orphan_sessions_excludes_archived() -> None:
    """Status='archived' sessions are intentionally hidden (use the resume picker for those)."""
    db = _FakeSession()
    live = _make_session(user_id=1, session_id="sess-live")
    archived = _make_session(user_id=1, session_id="sess-archived")
    archived.status = "archived"
    db.seed_session(live)
    db.seed_session(archived)

    result = await list_orphan_sessions(user=_user(1), db=db)
    ids = [s.id for s in result.sessions]
    assert "sess-live" in ids
    assert "sess-archived" not in ids


@pytest.mark.asyncio
async def test_orphan_sessions_sorted_by_last_used_at_desc() -> None:
    """Most-recently-used surfaces first so the picker shows the obvious resume target."""
    db = _FakeSession()
    older = _make_session(user_id=1, session_id="sess-older")
    older.last_used_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = _make_session(user_id=1, session_id="sess-newer")
    newer.last_used_at = datetime(2026, 5, 1, tzinfo=timezone.utc)
    db.seed_session(older)
    db.seed_session(newer)

    result = await list_orphan_sessions(user=_user(1), db=db)
    ids = [s.id for s in result.sessions]
    assert ids == ["sess-newer", "sess-older"]


@pytest.mark.asyncio
async def test_orphan_sessions_excludes_other_users_sessions() -> None:
    """Cross-account isolation: sessions owned by user_id=2 are invisible to user 1."""
    db = _FakeSession()
    db.seed_session(_make_session(user_id=2, session_id="sess-foreign"))
    db.seed_session(_make_session(user_id=1, session_id="sess-mine"))

    result = await list_orphan_sessions(user=_user(1), db=db)
    ids = [s.id for s in result.sessions]
    assert "sess-mine" in ids
    assert "sess-foreign" not in ids
