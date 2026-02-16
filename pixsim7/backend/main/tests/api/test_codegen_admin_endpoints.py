"""
API tests for admin codegen endpoints.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import get_current_admin_user
    from pixsim7.backend.main.api.v1.codegen import router
    from pixsim7.backend.main.domain.user import User
    from pixsim7.backend.main.services.codegen.runner import CodegenRunResult, CodegenTask

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _mock_user(*, admin: bool = False) -> MagicMock:
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "testuser"
    user.role = "admin" if admin else "user"
    user.is_active = True
    user.is_admin.return_value = admin
    return user


def _app(*, authenticated: bool = True, admin: bool = False) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_admin_user] = _deny
    elif not admin:
        async def _forbidden():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_user] = _forbidden
    else:
        user = _mock_user(admin=admin)
        app.dependency_overrides[get_current_admin_user] = lambda: user

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAdminCodegenEndpoints:
    @pytest.mark.asyncio
    async def test_list_codegen_tasks(self):
        app = _app(authenticated=True, admin=True)
        mock_tasks = [
            CodegenTask(
                id="app-map",
                description="Generate app map docs",
                script="packages/shared/app-map/src/cli.ts",
                supports_check=True,
                groups=["docs"],
            )
        ]

        with patch("pixsim7.backend.main.api.v1.codegen.load_codegen_tasks", return_value=mock_tasks):
            async with _client(app) as c:
                response = await c.get("/api/v1/admin/codegen/tasks")

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["tasks"][0]["id"] == "app-map"
        assert payload["tasks"][0]["supports_check"] is True

    @pytest.mark.asyncio
    async def test_run_codegen_task(self):
        app = _app(authenticated=True, admin=True)
        result = CodegenRunResult(
            task_id="app-map",
            ok=True,
            exit_code=0,
            duration_ms=120,
            stdout="done",
            stderr="",
        )

        with patch("pixsim7.backend.main.api.v1.codegen.run_codegen_task", return_value=result):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/admin/codegen/run",
                    json={"task_id": "app-map", "check": True},
                )

        assert response.status_code == 200
        payload = response.json()
        assert payload["task_id"] == "app-map"
        assert payload["ok"] is True
        assert payload["exit_code"] == 0

    @pytest.mark.asyncio
    async def test_run_codegen_task_rejects_unknown_task(self):
        app = _app(authenticated=True, admin=True)

        with patch(
            "pixsim7.backend.main.api.v1.codegen.run_codegen_task",
            side_effect=ValueError("Unknown codegen task: missing-task"),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/admin/codegen/run",
                    json={"task_id": "missing-task", "check": False},
                )

        assert response.status_code == 400
        assert "Unknown codegen task" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_run_codegen_task_requires_admin(self):
        app = _app(authenticated=True, admin=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/admin/codegen/run",
                json={"task_id": "app-map", "check": False},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_run_codegen_task_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/admin/codegen/run",
                json={"task_id": "app-map", "check": False},
            )

        assert response.status_code == 401
