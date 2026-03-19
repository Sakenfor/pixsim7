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
    async def test_update_commit_sha_passed_to_service(self):
        """commit_sha on update request is validated and passed as evidence_commit_sha."""
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[{"field": "stage"}], commit_sha=None, new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {
            "stage": "implementation",
            "commit_sha": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        _, kwargs = mock_update.await_args
        assert kwargs["evidence_commit_sha"] == "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    @pytest.mark.asyncio
    async def test_update_invalid_commit_sha_returns_400(self):
        """Invalid commit SHA on update request returns 400."""
        app = _app(authenticated=True)

        payload = {
            "stage": "implementation",
            "commit_sha": "not-valid!!",
        }

        async with _client(app) as c:
            response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 400
        assert "Invalid commit SHA" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_without_commit_sha_backward_compatible(self):
        """Update without commit_sha still works (evidence_commit_sha=None)."""
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[{"field": "stage"}], commit_sha=None, new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {"stage": "execution"}

        with patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        _, kwargs = mock_update.await_args
        assert kwargs["evidence_commit_sha"] is None

    @pytest.mark.asyncio
    async def test_update_commit_sha_not_treated_as_plan_field(self):
        """commit_sha is not passed as a plan update field."""
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[{"field": "stage"}], commit_sha=None, new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {
            "stage": "done",
            "commit_sha": "abcdef1234567",
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        args, _ = mock_update.await_args
        updates = args[2]
        assert "commit_sha" not in updates  # not a plan field
        assert "stage" in updates

    @pytest.mark.asyncio
    async def test_update_auto_head_resolves_commit_sha(self):
        """auto_head=True resolves HEAD when commit_sha is not set."""
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[{"field": "stage"}], commit_sha=None, new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {"stage": "implementation", "auto_head": True}

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update),
            patch("pixsim7.backend.main.api.v1.dev_plans.git_resolve_head", return_value="aabbccdd11223344556677889900aabbccddeeff"),
        ):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        _, kwargs = mock_update.await_args
        assert kwargs["evidence_commit_sha"] == "aabbccdd11223344556677889900aabbccddeeff"

    @pytest.mark.asyncio
    async def test_update_auto_head_does_not_override_explicit_sha(self):
        """auto_head=True does not override an explicit commit_sha."""
        app = _app(authenticated=True)
        update_result = SimpleNamespace(
            plan_id="plan-a", changes=[{"field": "stage"}], commit_sha=None, new_scope=None,
        )
        mock_update = AsyncMock(return_value=update_result)

        payload = {
            "stage": "implementation",
            "commit_sha": "1234567890abcdef1234567890abcdef12345678",
            "auto_head": True,
        }

        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.update_plan", new=mock_update),
            patch("pixsim7.backend.main.api.v1.dev_plans.git_resolve_head", return_value="aabbccdd11223344556677889900aabbccddeeff"),
        ):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 200
        _, kwargs = mock_update.await_args
        # Explicit SHA wins over auto_head
        assert kwargs["evidence_commit_sha"] == "1234567890abcdef1234567890abcdef12345678"

    @pytest.mark.asyncio
    async def test_update_verify_commits_rejects_missing(self):
        """verify_commits=True with a missing SHA returns 400."""
        app = _app(authenticated=True)

        payload = {
            "stage": "done",
            "commit_sha": "abcdef1234567",
            "verify_commits": True,
        }

        with patch("pixsim7.backend.main.api.v1.dev_plans.git_verify_commit", return_value=False):
            async with _client(app) as c:
                response = await c.patch("/api/v1/dev/plans/update/plan-a", json=payload)

        assert response.status_code == 400
        assert "Commit not found in repository" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/dev/plans/update/plan-a",
                json={"status": "active"},
            )

        assert response.status_code == 401
