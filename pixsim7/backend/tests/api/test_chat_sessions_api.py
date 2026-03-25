"""Tests for chat session tracking — list, archive, upsert."""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-sessions-api",
    "label": "Chat Sessions API",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "chat",
    "covers": [
        "pixsim7/backend/main/services/meta/agent_sessions.py",
    ],
    "order": 32,
}

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_current_user_optional,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import meta_contracts

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class _ScalarResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)


class _ExecuteResult:
    def __init__(self, *, scalars=None):
        self._scalars = list(scalars or [])

    def scalars(self):
        return _ScalarResult(self._scalars)


class _FakeDB:
    def __init__(self):
        self.execute_results = []
        self.get_values = {}
        self.added = []
        self.commit_count = 0

    async def execute(self, _stmt):
        if not self.execute_results:
            return _ExecuteResult(scalars=[])
        return self.execute_results.pop(0)

    async def get(self, model, key):
        return self.get_values.get(key)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, obj):
        pass


def _make_session_obj(
    id: str,
    engine: str = "claude",
    label: str = "test chat",
    message_count: int = 3,
    scope_key: str | None = None,
    last_plan_id: str | None = None,
    last_contract_id: str | None = None,
):
    return SimpleNamespace(
        id=id,
        user_id=1,
        engine=engine,
        profile_id=None,
        scope_key=scope_key,
        last_plan_id=last_plan_id,
        last_contract_id=last_contract_id,
        label=label,
        message_count=message_count,
        last_used_at=SimpleNamespace(isoformat=lambda: "2026-03-20T10:00:00"),
        created_at=SimpleNamespace(isoformat=lambda: "2026-03-20T09:00:00"),
        status="active",
    )


def _principal(*, user_id: int = 1, admin: bool = False):
    return SimpleNamespace(
        id=user_id,
        user_id=user_id,
        is_active=True,
        is_admin=lambda: admin,
    )


def _app(db: _FakeDB, *, principal=None):
    app = FastAPI()
    # Router already has prefix="/meta" built in
    app.include_router(meta_contracts.router, prefix="/api/v1")
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_current_user_optional] = lambda: SimpleNamespace(id=1, is_active=True)
    app.dependency_overrides[get_current_user] = lambda: principal or _principal()
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


class TestListChatSessions:
    """GET /agents/chat-sessions — list with engine filter."""

    @pytest.mark.asyncio
    async def test_list_returns_sessions(self):
        db = _FakeDB()
        s = _make_session_obj(
            "sess-1",
            engine="claude",
            label="hello world",
            scope_key="plan:identity-refactor",
            last_plan_id="identity-refactor",
            last_contract_id="plans.management",
        )
        db.execute_results = [_ExecuteResult(scalars=[s])]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions")

        assert r.status_code == 200
        data = r.json()
        assert "sessions" in data
        assert len(data["sessions"]) == 1
        assert data["sessions"][0]["id"] == "sess-1"
        assert data["sessions"][0]["engine"] == "claude"
        assert data["sessions"][0]["scope_key"] == "plan:identity-refactor"
        assert data["sessions"][0]["last_plan_id"] == "identity-refactor"
        assert data["sessions"][0]["last_contract_id"] == "plans.management"

    @pytest.mark.asyncio
    async def test_list_empty(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions")

        assert r.status_code == 200
        assert r.json()["sessions"] == []

    @pytest.mark.asyncio
    async def test_list_with_engine_filter(self):
        db = _FakeDB()
        s = _make_session_obj("sess-1", engine="codex")
        db.execute_results = [_ExecuteResult(scalars=[s])]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions", params={"engine": "codex"})

        assert r.status_code == 200


class TestArchiveChatSession:
    """DELETE /agents/chat-sessions/{id} — archive."""

    @pytest.mark.asyncio
    async def test_archive_existing(self):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        async with _client(app) as c:
            r = await c.delete("/api/v1/meta/agents/chat-sessions/sess-1")

        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert session_obj.status == "archived"
        assert db.commit_count == 1

    @pytest.mark.asyncio
    async def test_archive_not_found(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.delete("/api/v1/meta/agents/chat-sessions/nonexistent")

        assert r.status_code == 404


class TestActiveTask:
    """GET /agents/bridge/active-task."""

    @pytest.mark.asyncio
    async def test_returns_idle_when_no_bridge(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/active-task")

        assert r.status_code == 200
        assert r.json()["status"] == "idle"


class TestTaskResult:
    """GET /agents/bridge/task-result/{task_id}."""

    @pytest.mark.asyncio
    async def test_not_found(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/task-result/nonexistent")

        assert r.status_code == 200
        assert r.json()["status"] == "not_found"


class TestBridgeMachines:
    """GET /agents/bridge/machines."""

    @pytest.mark.asyncio
    async def test_returns_known_machine_rows(self):
        db = _FakeDB()
        row = SimpleNamespace(
            bridge_client_id="machine-a",
            bridge_id="9a4ff4f3-6421-4e76-bc1d-1f91264a9d12",
            agent_type="claude",
            status="offline",
            first_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-20T08:00:00"),
            last_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:30:00"),
            last_connected_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:00:00"),
            last_disconnected_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:30:00"),
            meta={"model": "claude-3.7-sonnet", "client_host": "127.0.0.1"},
        )
        db.execute_results = [_ExecuteResult(scalars=[row])]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines")

        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["machines"][0]["bridge_client_id"] == "machine-a"
        assert data["machines"][0]["status"] == "offline"
        assert data["machines"][0]["online"] is False
        assert data["machines"][0]["model"] == "claude-3.7-sonnet"
        assert data["machines"][0]["client_host"] == "127.0.0.1"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_memberships(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines")

        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 0
        assert data["machines"] == []

    @pytest.mark.asyncio
    async def test_admin_can_query_other_user_machines(self):
        db = _FakeDB()
        row = SimpleNamespace(
            bridge_client_id="machine-user-42",
            bridge_id="11111111-1111-1111-1111-111111111111",
            agent_type="codex",
            status="online",
            first_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-22T08:00:00"),
            last_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-23T10:00:00"),
            last_connected_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:59:00"),
            last_disconnected_at=None,
            meta={"model": "gpt-5.2", "client_host": "10.0.0.42"},
        )
        db.execute_results = [_ExecuteResult(scalars=[row])]

        app = _app(db, principal=_principal(user_id=1, admin=True))
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines", params={"user_id": 42})

        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["machines"][0]["bridge_client_id"] == "machine-user-42"
        assert data["machines"][0]["online"] is True

    @pytest.mark.asyncio
    async def test_non_admin_cannot_query_other_user_machines(self):
        db = _FakeDB()
        app = _app(db, principal=_principal(user_id=1, admin=False))

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines", params={"user_id": 42})

        assert r.status_code == 403
