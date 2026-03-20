"""Tests for /notifications/emit structured contract endpoint."""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-emit-endpoint",
    "label": "Notifications Emit Endpoint Tests",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "notifications-emit",
    "covers": [
        "pixsim7/backend/main/api/v1/notifications.py",
    ],
    "order": 27.1,
}

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any, List

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_current_user, get_database
    from pixsim7.backend.main.api.v1.notifications import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


@dataclass
class _DbStub:
    added: List[Any] = field(default_factory=list)
    commits: int = 0

    def add(self, item: Any) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1


def _app(db_stub: _DbStub) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield db_stub

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=123,
        username="contract-user",
        display_name=None,
        preferences={},
    )
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestNotificationEmitEndpoint:
    @pytest.mark.asyncio
    async def test_emit_plan_created_derives_defaults(self):
        db_stub = _DbStub()
        app = _app(db_stub)

        payload = {
            "event_type": "plan.created",
            "ref_type": "plan",
            "ref_id": "plan-a",
            "payload": {"planTitle": "Plan A"},
        }

        async with _client(app) as c:
            response = await c.post("/api/v1/notifications/emit", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert body["eventType"] == "plan.created"
        assert body["category"] == "plan.created"
        assert body["severity"] == "success"
        assert body["title"] == "Plan created: Plan A"
        assert body["body"] == "New plan: **Plan A**"
        assert body["source"] == "user:123"
        assert body["actorName"] == "contract-user"

        assert db_stub.commits == 1
        assert len(db_stub.added) == 1
        row = db_stub.added[0]
        assert row.actor_user_id == 123
        assert row.payload == {"planTitle": "Plan A"}

    @pytest.mark.asyncio
    async def test_emit_plan_updated_requires_changes(self):
        db_stub = _DbStub()
        app = _app(db_stub)

        payload = {
            "event_type": "plan.updated",
            "ref_type": "plan",
            "ref_id": "plan-a",
            "payload": {},
        }

        async with _client(app) as c:
            response = await c.post("/api/v1/notifications/emit", json=payload)

        assert response.status_code == 400
        assert "payload.changes" in response.json()["detail"]
        assert db_stub.commits == 0

    @pytest.mark.asyncio
    async def test_emit_custom_event_requires_title(self):
        db_stub = _DbStub()
        app = _app(db_stub)

        async with _client(app) as c:
            bad_response = await c.post(
                "/api/v1/notifications/emit",
                json={
                    "event_type": "custom.system.event",
                    "payload": {"foo": "bar"},
                },
            )

            ok_response = await c.post(
                "/api/v1/notifications/emit",
                json={
                    "event_type": "custom.system.event",
                    "title": "Custom notification",
                    "body": "Structured custom payload",
                    "payload": {"foo": "bar"},
                },
            )

        assert bad_response.status_code == 400
        assert "title is required" in bad_response.json()["detail"]

        assert ok_response.status_code == 200
        data = ok_response.json()
        assert data["eventType"] == "custom.system.event"
        assert data["category"] == "system"
        assert data["severity"] == "info"
        assert data["title"] == "Custom notification"
