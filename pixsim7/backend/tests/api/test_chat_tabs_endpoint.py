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
    create_chat_tab,
    delete_chat_tab,
    list_chat_tabs,
    reorder_chat_tabs,
    update_chat_tab,
)
from pixsim7.backend.main.domain.platform.agent_profile import (
    ChatSession,
    ChatTab,
)


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
    commits: int = 0
    deleted_tabs: List[ChatTab] = field(default_factory=list)
    deleted_sessions: List[ChatSession] = field(default_factory=list)

    def seed_tab(self, tab: ChatTab) -> ChatTab:
        self.tabs[tab.id] = tab
        return tab

    def seed_session(self, session: ChatSession) -> ChatSession:
        self.sessions[session.id] = session
        return session

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


def _make_session(user_id: int, session_id: Optional[str] = None) -> ChatSession:
    return ChatSession(
        id=session_id or uuid4().hex,
        user_id=user_id,
        engine="claude",
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


# ---------------------------------------------------------------------------
# create_chat_tab
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_auto_creates_session_when_omitted() -> None:
    db = _FakeSession()
    payload = ChatTabCreateRequest(label="new chat")

    result = await create_chat_tab(payload=payload, user=_user(1), db=db)

    assert result.label == "new chat"
    assert result.sessionId is not None
    # One ChatSession seeded; same id as response.sessionId
    assert result.sessionId in db.sessions
    assert db.sessions[result.sessionId].user_id == 1
    assert db.sessions[result.sessionId].source == "chat"
    # One ChatTab seeded
    assert UUID(result.id) in db.tabs


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
