"""
API tests for /dev/plans/sync admin + lock behavior.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import get_current_admin_user, get_database
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.services.docs.plan_sync import PlanSyncLockedError

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(*, authenticated: bool = True, admin: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_admin_user] = _deny
    elif not admin:
        async def _forbidden():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_user] = _forbidden
    else:
        app.dependency_overrides[get_current_admin_user] = lambda: SimpleNamespace(id=123, role="admin")

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansSyncPermissions:
    @pytest.mark.asyncio
    async def test_sync_requires_authentication(self):
        app = _app(authenticated=False)
        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans/sync")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_sync_requires_admin(self):
        app = _app(authenticated=True, admin=False)
        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans/sync")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_sync_returns_conflict_when_lock_is_held(self):
        app = _app(authenticated=True, admin=True)

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.sync_plans",
            new=AsyncMock(side_effect=PlanSyncLockedError("A plan sync is already in progress.")),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/sync")

        assert response.status_code == 409
        assert "already in progress" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_sync_passes_actor_to_service_and_returns_run_id(self):
        app = _app(authenticated=True, admin=True)
        sync_result = SimpleNamespace(
            run_id="2a9d2a62-5284-46ca-b820-2f0b37eb8c8e",
            created=1,
            updated=2,
            removed=0,
            unchanged=3,
            events=4,
            duration_ms=1200,
            changed_fields={"status": 2},
            details=[],
        )
        mock_sync = AsyncMock(return_value=sync_result)

        with patch("pixsim7.backend.main.api.v1.dev_plans.sync_plans", new=mock_sync):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/sync?commit_sha=abc123")

        assert response.status_code == 200
        payload = response.json()
        assert payload["runId"] == sync_result.run_id
        assert payload["created"] == 1
        assert payload["updated"] == 2
        assert payload["events"] == 4
        assert payload["durationMs"] == 1200
        assert payload["changedFields"]["status"] == 2

        _, kwargs = mock_sync.await_args
        assert kwargs["commit_sha"] == "abc123"
        assert kwargs["actor"] == "user:123"
