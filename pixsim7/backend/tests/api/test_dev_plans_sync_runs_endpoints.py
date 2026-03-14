"""
API tests for /dev/plans/sync-runs and retention endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

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


class _ScalarRows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


def _app(
    db,
    *,
    authenticated: bool = True,
    admin: bool = True,
) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield db

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
        app.dependency_overrides[get_current_admin_user] = lambda: SimpleNamespace(id=321, role="admin")

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def _run_row(run_id):
    ts = datetime(2026, 3, 13, 11, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=run_id,
        status="success",
        started_at=ts,
        finished_at=ts,
        duration_ms=1200,
        commit_sha="abc123",
        actor="user:321",
        error_message=None,
        created=1,
        updated=2,
        removed=0,
        unchanged=3,
        events=4,
        changed_fields={"status": 2, "owner": 1},
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlanSyncRunsEndpoints:
    @pytest.mark.asyncio
    async def test_list_sync_runs_returns_metrics(self):
        run_id = uuid4()
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarRows([_run_row(run_id)])),
            get=AsyncMock(),
        )
        app = _app(db)

        async with _client(app) as c:
            response = await c.get("/api/v1/dev/plans/sync-runs")

        assert response.status_code == 200
        payload = response.json()
        assert payload["runs"][0]["id"] == str(run_id)
        assert payload["runs"][0]["durationMs"] == 1200
        assert payload["runs"][0]["changedFields"]["status"] == 2

    @pytest.mark.asyncio
    async def test_get_sync_run_returns_404_when_missing(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarRows([])),
            get=AsyncMock(return_value=None),
        )
        app = _app(db)
        run_id = uuid4()

        async with _client(app) as c:
            response = await c.get(f"/api/v1/dev/plans/sync-runs/{run_id}")

        assert response.status_code == 404
        assert "Sync run not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_sync_run_returns_entry(self):
        run_id = uuid4()
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarRows([])),
            get=AsyncMock(return_value=_run_row(run_id)),
        )
        app = _app(db)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/dev/plans/sync-runs/{run_id}")

        assert response.status_code == 200
        payload = response.json()
        assert payload["id"] == str(run_id)
        assert payload["actor"] == "user:321"
        assert payload["changedFields"]["owner"] == 1

    @pytest.mark.asyncio
    async def test_retention_requires_admin(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarRows([])),
            get=AsyncMock(return_value=None),
        )
        app = _app(db, authenticated=True, admin=False)

        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans/sync-runs/retention")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_retention_invokes_service_and_returns_payload(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarRows([])),
            get=AsyncMock(return_value=None),
        )
        app = _app(db, authenticated=True, admin=True)
        prune_result = SimpleNamespace(
            dry_run=False,
            retention_days=30,
            cutoff="2026-02-11T12:00:00+00:00",
            events_deleted=7,
            runs_deleted=3,
        )
        mock_prune = AsyncMock(return_value=prune_result)

        with patch("pixsim7.backend.main.api.v1.dev_plans.prune_plan_sync_history", new=mock_prune):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/sync-runs/retention?days=30&dry_run=false")

        assert response.status_code == 200
        payload = response.json()
        assert payload["dryRun"] is False
        assert payload["retentionDays"] == 30
        assert payload["eventsDeleted"] == 7
        assert payload["runsDeleted"] == 3

        _, kwargs = mock_prune.await_args
        assert kwargs["retention_days"] == 30
        assert kwargs["dry_run"] is False

    @pytest.mark.asyncio
    async def test_retention_returns_conflict_when_sync_lock_is_held(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarRows([])),
            get=AsyncMock(return_value=None),
        )
        app = _app(db, authenticated=True, admin=True)
        mock_prune = AsyncMock(side_effect=PlanSyncLockedError("A plan sync is already in progress."))

        with patch("pixsim7.backend.main.api.v1.dev_plans.prune_plan_sync_history", new=mock_prune):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/sync-runs/retention")

        assert response.status_code == 409
        assert "already in progress" in response.json()["detail"]
