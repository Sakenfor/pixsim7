"""API tests for destructive Dev Plans endpoints (archive/unarchive/delete)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_admin_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.dev_plans import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(*, authenticated: bool = True, admin: bool = True) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_admin_principal] = _deny
    elif not admin:
        async def _forbidden():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_principal] = _forbidden
    else:
        app.dependency_overrides[get_current_admin_principal] = lambda: SimpleNamespace(
            id=123,
            role="admin",
            source="user:123",
            actor_display_name="Admin",
            user_id=123,
            is_agent=False,
        )

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansDestructivePermissions:
    @pytest.mark.asyncio
    async def test_delete_requires_authentication(self):
        app = _app(authenticated=False)
        async with _client(app) as c:
            response = await c.delete("/api/v1/dev/plans/plan-a")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_requires_admin(self):
        app = _app(authenticated=True, admin=False)
        async with _client(app) as c:
            response = await c.delete("/api/v1/dev/plans/plan-a")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_archive_requires_admin(self):
        app = _app(authenticated=True, admin=False)
        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans/archive/plan-a", json={})
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_unarchive_requires_admin(self):
        app = _app(authenticated=True, admin=False)
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans/unarchive/plan-a",
                json={"restore_status": "active"},
            )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_admin_calls_service_and_returns_response(self):
        app = _app(authenticated=True, admin=True)
        mock_delete = AsyncMock(
            return_value=SimpleNamespace(
                success=True,
                message="Plan 'plan-a' permanently deleted.",
            )
        )

        with patch("pixsim7.backend.main.api.v1.dev_plans.delete_plan", new=mock_delete):
            async with _client(app) as c:
                response = await c.delete("/api/v1/dev/plans/plan-a?hard=true")

        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert "deleted" in payload["message"]

        args, kwargs = mock_delete.await_args
        assert args[1] == "plan-a"
        assert kwargs["hard"] is True
        assert kwargs["principal"].id == 123

    @pytest.mark.asyncio
    async def test_archive_admin_calls_service(self):
        app = _app(authenticated=True, admin=True)
        mock_archive = AsyncMock(return_value=SimpleNamespace(changes=[{"field": "status"}]))

        with patch("pixsim7.backend.main.api.v1.dev_plans.archive_plan", new=mock_archive):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/archive/plan-a", json={})

        assert response.status_code == 200
        payload = response.json()
        assert payload["planId"] == "plan-a"
        assert payload["status"] == "archived"
        assert len(payload["changes"]) == 1

        args, kwargs = mock_archive.await_args
        assert args[1] == "plan-a"
        assert kwargs["principal"].id == 123

    @pytest.mark.asyncio
    async def test_unarchive_admin_calls_service(self):
        app = _app(authenticated=True, admin=True)
        mock_unarchive = AsyncMock(return_value=SimpleNamespace(changes=[{"field": "status"}]))

        with patch("pixsim7.backend.main.api.v1.dev_plans.unarchive_plan", new=mock_unarchive):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/unarchive/plan-a",
                    json={"restore_status": "parked"},
                )

        assert response.status_code == 200
        payload = response.json()
        assert payload["planId"] == "plan-a"
        assert payload["status"] == "parked"
        assert len(payload["changes"]) == 1

        args, kwargs = mock_unarchive.await_args
        assert args[1] == "plan-a"
        assert kwargs["restore_status"] == "parked"
        assert kwargs["principal"].id == 123
