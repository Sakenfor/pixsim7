"""API tests for /dev/plans/update/{plan_id} payload handling."""

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
class TestDevPlansUpdateEndpoint:
    @pytest.mark.asyncio
    async def test_update_accepts_checkpoints_target_and_patch(self):
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a",
            changes=[{"field": "checkpoints"}],
            commit_sha=None,
            new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {
            "checkpoints": [
                {"id": "phase_1", "label": "Phase 1", "status": "active"},
            ],
            "target": {"type": "system", "id": "agent-infra"},
            "patch": {"task_scope": "user", "plan_type": "feature"},
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "plan-a"

        args, kwargs = mock_update.await_args
        assert args[1] == "plan-a"
        updates = args[2]
        assert updates["checkpoints"][0]["id"] == "phase_1"
        assert updates["target"]["id"] == "agent-infra"
        assert updates["task_scope"] == "user"
        assert updates["plan_type"] == "feature"
        principal = kwargs["principal"]
        assert principal.source == "user:123"
        assert principal.id == 123

    @pytest.mark.asyncio
    async def test_update_explicit_fields_override_patch_keys(self):
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a",
            changes=[{"field": "stage"}],
            commit_sha=None,
            new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {
            "stage": "execution",
            "patch": {"stage": "proposed"},
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        args, _kwargs = mock_update.await_args
        updates = args[2]
        assert updates["stage"] == "execution"

    @pytest.mark.asyncio
    async def test_update_requires_non_empty_payload(self):
        app = _app(authenticated=True)

        async with _client(app) as c:
            response = await c.patch("/api/v1/dev/plans/update/plan-a", json={})

        assert response.status_code == 400
        assert "No fields to update" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/dev/plans/update/plan-a",
                json={"status": "active"},
            )

        assert response.status_code == 401
