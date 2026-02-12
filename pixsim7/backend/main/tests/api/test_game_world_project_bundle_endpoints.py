"""
API tests for game world project bundle import/export endpoints.

Focuses on HTTP behavior with mocked dependencies and service methods.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException

    from pixsim7.backend.main.api.dependencies import get_current_user, get_game_world_service
    from pixsim7.backend.main.api.v1.game_worlds import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _bundle_payload() -> dict:
    return {
        "schema_version": 1,
        "exported_at": "2026-02-12T00:00:00Z",
        "core": {
            "world": {
                "name": "Imported World",
                "meta": {},
                "world_time": 0.0,
            },
            "locations": [],
            "npcs": [],
            "scenes": [],
            "items": [],
        },
        "extensions": {},
    }


def _import_response_payload() -> dict:
    return {
        "schema_version": 1,
        "world_id": 42,
        "world_name": "Imported World",
        "counts": {
            "locations": 0,
            "hotspots": 0,
            "npcs": 0,
            "schedules": 0,
            "expressions": 0,
            "scenes": 0,
            "nodes": 0,
            "edges": 0,
            "items": 0,
        },
        "id_maps": {
            "locations": {},
            "npcs": {},
            "scenes": {},
            "nodes": {},
            "items": {},
        },
        "warnings": [],
    }


def _app(*, authenticated: bool = True, owner_user_id: int = 1):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/worlds")

    service = SimpleNamespace()
    service.db = AsyncMock()
    service.get_world = AsyncMock(
        return_value=SimpleNamespace(
            id=1,
            owner_user_id=owner_user_id,
            name="Owned World",
            meta={},
        )
    )
    service.get_world_state = AsyncMock(return_value=SimpleNamespace(world_time=0.0))
    app.dependency_overrides[get_game_world_service] = lambda: service

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_user] = _deny
    else:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameWorldProjectBundleEndpoints:

    @pytest.mark.asyncio
    async def test_export_world_project_success(self):
        app = _app(authenticated=True, owner_user_id=1)
        expected_bundle = _bundle_payload()

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectBundleService.export_world_bundle",
            new=AsyncMock(return_value=expected_bundle),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/game/worlds/1/project/export")

        assert response.status_code == 200
        body = response.json()
        assert body["schema_version"] == 1
        assert body["core"]["world"]["name"] == "Imported World"

    @pytest.mark.asyncio
    async def test_export_world_project_requires_ownership(self):
        app = _app(authenticated=True, owner_user_id=999)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/worlds/1/project/export")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_import_world_project_success(self):
        app = _app(authenticated=True)
        expected_response = _import_response_payload()

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectBundleService.import_bundle",
            new=AsyncMock(return_value=expected_response),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/game/worlds/projects/import",
                    json={
                        "bundle": _bundle_payload(),
                        "mode": "create_new_world",
                    },
                )

        assert response.status_code == 201
        body = response.json()
        assert body["world_id"] == 42
        assert body["world_name"] == "Imported World"

    @pytest.mark.asyncio
    async def test_import_world_project_unauthenticated(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/projects/import",
                json={
                    "bundle": _bundle_payload(),
                    "mode": "create_new_world",
                },
            )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_import_world_project_validation_error_from_service(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectBundleService.import_bundle",
            new=AsyncMock(side_effect=ValueError("world_name_required")),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/game/worlds/projects/import",
                    json={
                        "bundle": _bundle_payload(),
                        "mode": "create_new_world",
                    },
                )

        assert response.status_code == 400
