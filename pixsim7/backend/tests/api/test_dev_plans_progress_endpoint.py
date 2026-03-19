"""API tests for /dev/plans/progress/{plan_id} checkpoint progress updates."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(*, authenticated: bool = True) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_principal] = _deny
    else:
        app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
            id=123, role="user", username="user123",
        )

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansProgressEndpoint:
    @pytest.mark.asyncio
    async def test_progress_updates_checkpoint_points_and_metadata(self):
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "phase_1",
                        "label": "Phase 1",
                        "status": "pending",
                        "points_total": 5,
                        "points_done": 1,
                        "evidence": ["existing-proof"],
                    }
                ]
            )
        )
        update_result = SimpleNamespace(
            plan_id="plan-a",
            changes=[{"field": "checkpoints"}],
            commit_sha="abc123",
            new_scope=None,
        )

        payload = {
            "checkpoint_id": "phase_1",
            "points_delta": 2,
            "append_evidence": ["new-proof"],
            "note": "Added tests",
            "sync_plan_stage": True,
        }

        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.update_plan",
                new=AsyncMock(return_value=update_result),
            ) as mock_update,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/progress/plan-a", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "plan-a"
        assert body["checkpointId"] == "phase_1"

        args, kwargs = mock_update.await_args
        updates = args[2]
        checkpoint = updates["checkpoints"][0]
        assert checkpoint["points_done"] == 3
        assert checkpoint["points_total"] == 5
        assert checkpoint["status"] == "active"
        evidence = checkpoint["evidence"]
        if evidence and isinstance(evidence[0], dict):
            refs = [item.get("ref") for item in evidence if isinstance(item, dict)]
            assert refs == ["existing-proof", "new-proof"]
        else:
            assert evidence == ["existing-proof", "new-proof"]
        assert checkpoint["last_update"]["by"] == "user123"
        assert updates["stage"] == "phase_1"
        principal = kwargs["principal"]
        assert principal.source == "user:123"
        assert principal.id == 123

    @pytest.mark.asyncio
    async def test_progress_requires_action_fields(self):
        app = _app(authenticated=True)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans/progress/plan-a",
                json={"checkpoint_id": "phase_1"},
            )

        assert response.status_code == 400
        assert "No progress fields to update" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_returns_404_when_checkpoint_missing(self):
        app = _app(authenticated=True)
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[{"id": "phase_x", "label": "Phase X", "status": "pending"}]
            )
        )

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/progress/plan-a",
                    json={"checkpoint_id": "phase_1", "points_delta": 1},
                )

        assert response.status_code == 404
        assert "Checkpoint not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_progress_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans/progress/plan-a",
                json={"checkpoint_id": "phase_1", "points_delta": 1},
            )

        assert response.status_code == 401
