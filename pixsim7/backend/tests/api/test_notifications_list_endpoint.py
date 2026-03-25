"""API tests for /notifications list filtering semantics."""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-list-endpoint",
    "label": "Notifications List Endpoint Tests",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "notifications-list",
    "covers": [
        "pixsim7/backend/main/api/v1/notifications.py",
    ],
    "order": 27.3,
}

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
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


class _ScalarResult:
    def __init__(self, rows: List[Any]):
        self._rows = rows

    def all(self) -> List[Any]:
        return list(self._rows)


class _ExecuteResult:
    def __init__(self, rows: List[Any]):
        self._rows = rows

    def scalars(self) -> _ScalarResult:
        return _ScalarResult(self._rows)

    def all(self) -> List[Any]:
        return list(self._rows)


@dataclass
class _ListDbStub:
    rows: List[Notification] = field(default_factory=list)

    async def execute(self, stmt: Any) -> _ExecuteResult:
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
        rows = list(self.rows)

        # User-visible rows (broadcast + targeted).
        if "notifications.broadcast = true" in sql and "notifications.user_id = 1" in sql:
            rows = [r for r in rows if r.broadcast or r.user_id == 1]

        if "notifications.read = false" in sql:
            rows = [r for r in rows if r.read is False]

        scope_match = re.search(
            r"notifications\.category = '([^']+)'\s+or\s+.*?notifications\.category like '([^']+)'",
            sql,
        )
        if scope_match:
            exact = scope_match.group(1)
            like_prefix = scope_match.group(2)
            prefix = like_prefix[:-1] if like_prefix.endswith("%") else like_prefix
            rows = [r for r in rows if r.category == exact or r.category.startswith(prefix)]

        if "order by" in sql and "created_at desc" in sql:
            rows.sort(key=lambda r: r.created_at, reverse=True)

        limit_match = re.search(r"limit\s+(\d+)", sql)
        offset_match = re.search(r"offset\s+(\d+)", sql)
        offset = int(offset_match.group(1)) if offset_match else 0
        if offset:
            rows = rows[offset:]
        if limit_match:
            rows = rows[: int(limit_match.group(1))]

        return _ExecuteResult(rows)


def _make_notification(*, category: str, read: bool, minutes_ago: int) -> Notification:
    return Notification(
        title=f"{category} event",
        body=None,
        category=category,
        severity="info",
        source="user:1",
        event_type="plan.updated" if category.startswith("plan") else "notification.manual",
        actor_name=None,
        actor_user_id=None,
        ref_type=None,
        ref_id=None,
        payload={},
        broadcast=True,
        user_id=None,
        read=read,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    )


def _app(db_stub: _ListDbStub) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield db_stub

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1,
        username="notif-user",
        display_name="Notif User",
        preferences={"notifications": {"plan": {"granularity": "all_changes"}}},
    )
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestNotificationListEndpoint:
    @pytest.mark.asyncio
    async def test_category_plan_includes_plan_subcategories(self):
        db_stub = _ListDbStub(
            rows=[
                _make_notification(category="plan.created", read=False, minutes_ago=1),
                _make_notification(category="plan.status", read=False, minutes_ago=2),
                _make_notification(category="plan", read=True, minutes_ago=3),
                _make_notification(category="feature", read=False, minutes_ago=4),
            ]
        )
        app = _app(db_stub)

        async with _client(app) as c:
            response = await c.get("/api/v1/notifications?category=plan&include_suppressed=true")

        assert response.status_code == 200
        body = response.json()
        categories = [n["category"] for n in body["notifications"]]
        assert "plan.created" in categories
        assert "plan.status" in categories
        assert "feature" not in categories
        assert body["unreadCount"] == 2

    @pytest.mark.asyncio
    async def test_category_alias_plans_matches_category_plan(self):
        db_stub = _ListDbStub(
            rows=[
                _make_notification(category="plan.created", read=False, minutes_ago=1),
                _make_notification(category="plan.stage", read=False, minutes_ago=2),
                _make_notification(category="plan", read=True, minutes_ago=3),
                _make_notification(category="system", read=False, minutes_ago=4),
            ]
        )
        app = _app(db_stub)

        async with _client(app) as c:
            plan_response = await c.get("/api/v1/notifications?category=plan&include_suppressed=true")
            plans_response = await c.get("/api/v1/notifications?category=plans&include_suppressed=true")

        assert plan_response.status_code == 200
        assert plans_response.status_code == 200

        plan_body = plan_response.json()
        plans_body = plans_response.json()
        assert [n["id"] for n in plan_body["notifications"]] == [n["id"] for n in plans_body["notifications"]]
        assert plan_body["unreadCount"] == plans_body["unreadCount"] == 2
