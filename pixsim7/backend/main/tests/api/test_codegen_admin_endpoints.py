"""
API tests for devtools codegen and migration endpoints.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import CODEGEN_PERMISSION, get_current_codegen_user
    from pixsim7.backend.main.api.v1.codegen import (
        router,
        MigrationHeadResponse,
        MigrationRunResponse,
        MigrationScopeDetail,
        MigrationStatusResponse,
    )
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


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevtoolsMigrationEndpoints:
    @pytest.mark.asyncio
    async def test_migration_status_with_scope_details(self):
        app = _app(authenticated=True, can_codegen=True)
        from pathlib import Path

        fake_root = Path("/fake/repo")
        mock_details = [
            MigrationScopeDetail(
                scope="main",
                config_file="alembic.ini",
                script_location="pixsim7/backend/main/infrastructure/database/migrations",
                database_url="postgresql://pixsim:****@localhost:5434/pixsim7",
                version_table="alembic_version",
                migration_count=12,
            ),
        ]

        with (
            patch("pixsim7.backend.main.api.v1.codegen._resolve_repo_root", return_value=fake_root),
            patch(
                "pixsim7.backend.main.api.v1.codegen._parse_scope_config",
                side_effect=lambda scope, root: mock_details[0] if scope == "main" else None,
            ),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/devtools/codegen/migrations/status")

        assert response.status_code == 200
        payload = response.json()
        assert payload["available"] is True
        assert "main" in payload["scopes"]
        # Only "main" returns a detail since others return None from our mock
        details = payload["scope_details"]
        assert len(details) == 1
        assert details[0]["scope"] == "main"
        assert details[0]["config_file"] == "alembic.ini"
        assert details[0]["migration_count"] == 12
        assert "****" in details[0]["database_url"]

    @pytest.mark.asyncio
    async def test_migration_head_success(self):
        app = _app(authenticated=True, can_codegen=True)
        from pathlib import Path

        mock_head = MigrationHeadResponse(
            scope="main",
            current_head="20260303_0003",
            is_head=True,
            error=None,
        )

        with (
            patch("pixsim7.backend.main.api.v1.codegen._resolve_repo_root", return_value=Path("/fake")),
            patch("pixsim7.backend.main.api.v1.codegen._get_current_head", return_value=mock_head),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/devtools/codegen/migrations/main/head")

        assert response.status_code == 200
        payload = response.json()
        assert payload["scope"] == "main"
        assert payload["current_head"] == "20260303_0003"
        assert payload["is_head"] is True

    @pytest.mark.asyncio
    async def test_migration_head_invalid_scope(self):
        app = _app(authenticated=True, can_codegen=True)

        async with _client(app) as c:
            response = await c.get("/api/v1/devtools/codegen/migrations/invalid/head")

        assert response.status_code == 400
        assert "Invalid scope" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_migration_run_success(self):
        app = _app(authenticated=True, can_codegen=True)
        mock_result = MigrationRunResponse(
            ok=True,
            scope="main",
            exit_code=0,
            duration_ms=250,
            stdout="All requested migration chains are up to date.",
            stderr="",
        )

        with patch(
            "pixsim7.backend.main.api.v1.codegen._run_migration",
            return_value=mock_result,
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/devtools/codegen/migrations/run",
                    json={"scope": "main"},
                )

        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["scope"] == "main"
        assert payload["exit_code"] == 0

    @pytest.mark.asyncio
    async def test_migration_run_invalid_scope(self):
        app = _app(authenticated=True, can_codegen=True)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/devtools/codegen/migrations/run",
                json={"scope": "invalid"},
            )

        assert response.status_code == 400
        assert "Invalid scope" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_migration_requires_permission(self):
        app = _app(authenticated=True, can_codegen=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/devtools/codegen/migrations/run",
                json={"scope": "main"},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_migration_requires_authentication(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.get("/api/v1/devtools/codegen/migrations/status")

        assert response.status_code == 401
