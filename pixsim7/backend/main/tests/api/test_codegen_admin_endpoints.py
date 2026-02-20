"""
API tests for devtools codegen endpoints.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import CODEGEN_PERMISSION, get_current_codegen_user
    from pixsim7.backend.main.api.v1.codegen import router
    from pixsim7.backend.main.domain.user import User
    from pixsim7.backend.main.services.codegen.runner import CodegenRunResult, CodegenTask

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _mock_user(*, permissions: list[str] | None = None) -> MagicMock:
    granted = set(permissions or [])
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "testuser"
    user.role = "user"
    user.permissions = list(granted)
    user.is_active = True
    user.has_permission.side_effect = lambda permission: permission in granted
    return user


def _app(*, authenticated: bool = True, can_codegen: bool = False) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_codegen_user] = _deny
    elif not can_codegen:
        async def _forbidden():
            raise HTTPException(
                status_code=403,
                detail=f"Missing required permission: {CODEGEN_PERMISSION}",
            )

        app.dependency_overrides[get_current_codegen_user] = _forbidden
    else:
        user = _mock_user(permissions=[CODEGEN_PERMISSION])
        app.dependency_overrides[get_current_codegen_user] = lambda: user

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevtoolsCodegenEndpoints:
    @pytest.mark.asyncio
    async def test_list_codegen_tasks(self):
        app = _app(authenticated=True, can_codegen=True)
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
                response = await c.get("/api/v1/devtools/codegen/tasks")

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["tasks"][0]["id"] == "app-map"
        assert payload["tasks"][0]["supports_check"] is True

    @pytest.mark.asyncio
    async def test_run_codegen_task(self):
        app = _app(authenticated=True, can_codegen=True)
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
                    "/api/v1/devtools/codegen/run",
                    json={"task_id": "app-map", "check": True},
                )

        assert response.status_code == 200
        payload = response.json()
        assert payload["task_id"] == "app-map"
        assert payload["ok"] is True
        assert payload["exit_code"] == 0

    @pytest.mark.asyncio
    async def test_run_codegen_task_rejects_unknown_task(self):
        app = _app(authenticated=True, can_codegen=True)

        with patch(
            "pixsim7.backend.main.api.v1.codegen.run_codegen_task",
            side_effect=ValueError("Unknown codegen task: missing-task"),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/devtools/codegen/run",
                    json={"task_id": "missing-task", "check": False},
                )

        assert response.status_code == 400
        assert "Unknown codegen task" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_run_codegen_task_requires_permission(self):
        app = _app(authenticated=True, can_codegen=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/devtools/codegen/run",
                json={"task_id": "app-map", "check": False},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_run_codegen_task_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/devtools/codegen/run",
                json={"task_id": "app-map", "check": False},
            )

        assert response.status_code == 401
