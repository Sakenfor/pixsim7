"""API tests for the per-surface scoped-unread endpoints.

`/notifications/unread-by-ref` + `/notifications/mark-read-by-ref` power
the per-tab unread pip (notification-system Phase 4a). The two invariants
that matter most and aren't obvious from the handler in isolation:

* The scoped query DELIBERATELY bypasses category suppression — the
  `chat` category is off-by-default so chat pings never inflate the bell,
  but the pip must still see them.
* `mark-read-by-ref` only flips the caller's OWN targeted rows, never
  broadcasts (one shared `read` bool ⇒ a broadcast can't be read
  per-user without clobbering it for everyone).

Same compiled-SQL stub pattern as ``test_notifications_list_endpoint.py``
(no aiosqlite in this env; the real query semantics are exercised by
filtering an in-memory row list against the compiled WHERE clause).
"""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-scoped-unread",
    "label": "Notifications Scoped Unread Endpoints",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "notifications-scoped",
    "covers": [
        "pixsim7/backend/main/api/v1/notifications.py",
    ],
    "order": 27.4,
}

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, List

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_current_user, get_database
    from pixsim7.backend.main.api.v1.notifications import router
    from pixsim7.backend.main.domain.platform.notification import Notification

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not IMPORTS_AVAILABLE, reason="backend deps not available"
)


class _SelectResult:
    def __init__(self, rows: List[Any]):
        self._rows = rows

    def all(self) -> List[Any]:
        return list(self._rows)


class _UpdateResult:
    def __init__(self, rowcount: int):
        self.rowcount = rowcount


@dataclass
class _ScopedDbStub:
    """Interprets the two scoped statements against an in-memory list.

    Filters are read off the compiled SQL (literal binds) so the test
    exercises the handler's real WHERE/GROUP BY composition rather than a
    re-implementation of it.
    """

    rows: List[Notification] = field(default_factory=list)
    committed: bool = False

    def _visible(self, sql: str) -> List[Notification]:
        rows = list(self.rows)
        # _user_filter: broadcast OR user_id == 1
        if "notifications.broadcast = true" in sql and "notifications.user_id = 1" in sql:
            rows = [r for r in rows if r.broadcast or r.user_id == 1]
        # mark-read-by-ref scopes strictly to the owner, no broadcasts.
        elif "notifications.user_id = 1" in sql:
            rows = [r for r in rows if r.user_id == 1]
        if "notifications.read = false" in sql:
            rows = [r for r in rows if r.read is False]
        m = re.search(r"notifications\.ref_type = '([^']+)'", sql)
        if m:
            rows = [r for r in rows if r.ref_type == m.group(1)]
        m = re.search(r"notifications\.ref_id = '([^']+)'", sql)
        if m:
            rows = [r for r in rows if r.ref_id == m.group(1)]
        in_match = re.search(r"notifications\.ref_id in \(([^)]+)\)", sql)
        if in_match:
            wanted = {s.strip().strip("'") for s in in_match.group(1).split(",")}
            rows = [r for r in rows if r.ref_id in wanted]
        return rows

    async def execute(self, stmt: Any) -> Any:
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
        rows = self._visible(sql)

        if sql.startswith("update"):
            for r in rows:
                r.read = True
            return _UpdateResult(rowcount=len(rows))

        # SELECT ref_id, count(*) ... GROUP BY ref_id
        grouped: dict[str, int] = {}
        for r in rows:
            grouped[r.ref_id] = grouped.get(r.ref_id, 0) + 1
        return _SelectResult([(rid, cnt) for rid, cnt in grouped.items()])

    async def commit(self) -> None:
        self.committed = True


def _notif(
    *,
    ref_type: str | None,
    ref_id: str | None,
    read: bool,
    user_id: int | None,
    broadcast: bool,
    category: str = "chat",
) -> Notification:
    return Notification(
        title="reply",
        body="hi",
        category=category,
        severity="info",
        source="assistant",
        event_type="chat.message",
        ref_type=ref_type,
        ref_id=ref_id,
        payload={},
        broadcast=broadcast,
        user_id=user_id,
        read=read,
        created_at=datetime.now(timezone.utc),
    )


def _app(db_stub: _ScopedDbStub) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield db_stub

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1,
        username="notif-user",
        display_name="Notif User",
        # `chat` is off in prefs — the scoped query must ignore that.
        preferences={"notifications": {"chat": {"granularity": "off"}}},
    )
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


class TestUnreadByRef:
    @pytest.mark.asyncio
    async def test_groups_unread_counts_per_ref_id(self):
        db = _ScopedDbStub(
            rows=[
                _notif(ref_type="chat_session", ref_id="s1", read=False, user_id=1, broadcast=False),
                _notif(ref_type="chat_session", ref_id="s1", read=False, user_id=1, broadcast=False),
                _notif(ref_type="chat_session", ref_id="s2", read=False, user_id=1, broadcast=False),
                # read → excluded
                _notif(ref_type="chat_session", ref_id="s1", read=True, user_id=1, broadcast=False),
                # different ref_type → excluded
                _notif(ref_type="plan", ref_id="s1", read=False, user_id=1, broadcast=False),
            ]
        )
        async with _client(_app(db)) as c:
            resp = await c.get(
                "/api/v1/notifications/unread-by-ref",
                params={"ref_type": "chat_session", "ref_id": ["s1", "s2"]},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["refType"] == "chat_session"
        assert body["counts"] == {"s1": 2, "s2": 1}

    @pytest.mark.asyncio
    async def test_ignores_category_suppression(self):
        """`chat` is suppressed in user prefs; the pip must still count it."""
        db = _ScopedDbStub(
            rows=[
                _notif(ref_type="chat_session", ref_id="s1", read=False,
                       user_id=1, broadcast=False, category="chat"),
            ]
        )
        async with _client(_app(db)) as c:
            resp = await c.get(
                "/api/v1/notifications/unread-by-ref",
                params={"ref_type": "chat_session", "ref_id": "s1"},
            )
        assert resp.status_code == 200
        assert resp.json()["counts"] == {"s1": 1}

    @pytest.mark.asyncio
    async def test_excludes_other_users_targeted_rows(self):
        db = _ScopedDbStub(
            rows=[
                _notif(ref_type="chat_session", ref_id="s1", read=False, user_id=1, broadcast=False),
                # targeted at someone else
                _notif(ref_type="chat_session", ref_id="s1", read=False, user_id=999, broadcast=False),
            ]
        )
        async with _client(_app(db)) as c:
            resp = await c.get(
                "/api/v1/notifications/unread-by-ref",
                params={"ref_type": "chat_session", "ref_id": "s1"},
            )
        assert resp.json()["counts"] == {"s1": 1}

    @pytest.mark.asyncio
    async def test_missing_ref_type_is_422(self):
        async with _client(_app(_ScopedDbStub())) as c:
            resp = await c.get("/api/v1/notifications/unread-by-ref")
        assert resp.status_code == 422


class TestMarkReadByRef:
    @pytest.mark.asyncio
    async def test_clears_only_the_scoped_ref(self):
        target = _notif(ref_type="chat_session", ref_id="s1", read=False, user_id=1, broadcast=False)
        other_ref = _notif(ref_type="chat_session", ref_id="s2", read=False, user_id=1, broadcast=False)
        db = _ScopedDbStub(rows=[target, other_ref])

        async with _client(_app(db)) as c:
            resp = await c.post(
                "/api/v1/notifications/mark-read-by-ref",
                json={"ref_type": "chat_session", "ref_id": "s1"},
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True, "marked": 1}
        assert target.read is True
        assert other_ref.read is False  # untouched
        assert db.committed is True

    @pytest.mark.asyncio
    async def test_never_flips_broadcasts_or_other_users(self):
        broadcast_row = _notif(ref_type="chat_session", ref_id="s1", read=False,
                                user_id=None, broadcast=True)
        other_user = _notif(ref_type="chat_session", ref_id="s1", read=False,
                             user_id=999, broadcast=False)
        db = _ScopedDbStub(rows=[broadcast_row, other_user])

        async with _client(_app(db)) as c:
            resp = await c.post(
                "/api/v1/notifications/mark-read-by-ref",
                json={"ref_type": "chat_session", "ref_id": "s1"},
            )
        assert resp.status_code == 200
        assert resp.json()["marked"] == 0
        assert broadcast_row.read is False
        assert other_user.read is False
