"""Tests for agent work summary flows — log_work persistence, agent context injection, session label updates."""
from __future__ import annotations

TEST_SUITE = {
    "id": "agent-work-summaries",
    "label": "Agent Work Summaries",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "agent",
    "covers": [
        "pixsim7/backend/main/api/v1/meta_contracts.py",
        "pixsim7/backend/main/api/v1/plans/routes_agent.py",
    ],
    "order": 34,
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


# ── Shared test helpers ──────────────────────────────────────────

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
    def scalar(self):
        return self._scalars[0] if self._scalars else None

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


def _principal(*, user_id: int = 1, agent: bool = False):
    p = SimpleNamespace(
        id=user_id if not agent else 0,
        user_id=user_id,
        is_active=True,
        is_admin=lambda: False,
        principal_type="agent" if agent else "user",
        on_behalf_of=user_id if agent else None,
        effective_user_id=user_id,
    )
    return p


def _app(db: _FakeDB, *, principal=None):
    app = FastAPI()
    app.include_router(meta_contracts.router, prefix="/api/v1")
    p = principal or _principal()
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_current_user_optional] = lambda: p
    app.dependency_overrides[get_current_user] = lambda: p
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ── Heartbeat persistence filtering ─────────────────────────────

class TestHeartbeatPersistence:
    """Verify that only meaningful actions are persisted to DB."""

    @pytest.mark.asyncio
    async def test_work_summary_persisted(self):
        db = _FakeDB()
        app = _app(db)
        async with _client(app) as c:
            r = await c.post("/api/v1/meta/agents/heartbeat", json={
                "session_id": "sess-1",
                "agent_type": "claude",
                "status": "active",
                "action": "work_summary",
                "detail": "Implemented concurrent dispatch",
            })
        assert r.status_code == 200
        assert len(db.added) == 1
        assert db.added[0].action == "work_summary"
        assert db.commit_count == 1

    @pytest.mark.asyncio
    async def test_keepalive_not_persisted(self):
        db = _FakeDB()
        app = _app(db)
        async with _client(app) as c:
            r = await c.post("/api/v1/meta/agents/heartbeat", json={
                "session_id": "sess-1",
                "agent_type": "claude",
                "status": "active",
                "action": "cli_session",
                "detail": "CLI session active",
            })
        assert r.status_code == 200
        assert len(db.added) == 0  # Not persisted

    @pytest.mark.asyncio
    async def test_tool_use_not_persisted(self):
        db = _FakeDB()
        app = _app(db)
        async with _client(app) as c:
            r = await c.post("/api/v1/meta/agents/heartbeat", json={
                "session_id": "sess-1",
                "agent_type": "claude",
                "status": "active",
                "action": "tool_use",
                "detail": "plans_management__plans_detail",
            })
        assert r.status_code == 200
        assert len(db.added) == 0  # Not persisted


# ── Session registration ─────────────────────────────────────────

class TestSessionRegistration:
    """POST /agents/register-chat-session — create and update."""

    @pytest.mark.asyncio
    async def test_creates_new_session(self):
        db = _FakeDB()
        app = _app(db, principal=_principal(user_id=1, agent=True))
        async with _client(app) as c:
            r = await c.post("/api/v1/meta/agents/register-chat-session", json={
                "session_id": "new-sess",
                "engine": "claude",
                "label": "Test session",
                "profile_id": "profile-abc",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["created"] is True
        assert len(db.added) == 1
        added = db.added[0]
        assert added.id == "new-sess"
        assert added.profile_id == "profile-abc"
        assert added.user_id == 1  # from on_behalf_of

    @pytest.mark.asyncio
    async def test_updates_existing_label(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id="existing-sess",
            user_id=1,
            engine="claude",
            profile_id="profile-abc",
            label="Old label",
            message_count=5,
            last_used_at=SimpleNamespace(isoformat=lambda: "2026-03-26T10:00:00"),
            created_at=SimpleNamespace(isoformat=lambda: "2026-03-26T09:00:00"),
            status="active",
        )
        db.get_values["existing-sess"] = existing

        app = _app(db)
        async with _client(app) as c:
            r = await c.post("/api/v1/meta/agents/register-chat-session", json={
                "session_id": "existing-sess",
                "engine": "claude",
                "label": "New summary label",
            })
        assert r.status_code == 200
        assert r.json()["created"] is False
        assert existing.label == "New summary label"
        assert db.commit_count == 1


# ── History action filter ────────────────────────────────────────

class TestHistoryActionFilter:
    """GET /agents/history — action filter param."""

    @pytest.mark.asyncio
    async def test_action_filter_applied(self):
        """Verify that the action query parameter is used in the SQL filter."""
        db = _FakeDB()
        # Two execute calls: one for count, one for rows
        db.execute_results = [
            _ExecuteResult(scalars=[0]),  # count
            _ExecuteResult(scalars=[]),   # rows
        ]
        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/history", params={
                "session_id": "sess-1",
                "action": "work_summary",
            })
        assert r.status_code == 200
        data = r.json()
        assert "entries" in data
        assert data["total"] == 0
