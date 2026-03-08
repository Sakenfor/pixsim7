from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_game_principal,
        get_game_world_service,
    )
    from pixsim7.backend.main.api.v1.game_behavior import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _routine_payload(*, routine_id: str = "routine.alpha", name: str = "Routine Alpha") -> dict:
    return {
        "version": 1,
        "id": routine_id,
        "name": name,
        "nodes": [
            {
                "id": "slot_1",
                "nodeType": "time_slot",
                "timeRangeSeconds": {"start": 0.0, "end": 3600.0},
                "preferredActivities": [{"activityId": "activity.idle", "weight": 1.0}],
            }
        ],
        "edges": [],
    }


def _invalid_routine_payload() -> dict:
    return {
        "version": 1,
        "id": "routine.invalid",
        "name": "Invalid",
        "nodes": [
            {
                "id": "slot_1",
                "nodeType": "not_a_valid_node_type",
                "timeRangeSeconds": {"start": 0.0, "end": 3600.0},
            }
        ],
        "edges": [],
    }


def _make_world(*, owner_user_id: int = 1, meta: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        owner_user_id=owner_user_id,
        meta=deepcopy(meta) if meta is not None else {},
    )


def _app(world: SimpleNamespace | None, *, principal_id: int = 1):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/worlds")

    service = SimpleNamespace()
    service.get_world = AsyncMock(return_value=world)

    async def _update_world_meta(world_id: int, meta: dict):
        if world is None:
            return None
        world.meta = deepcopy(meta)
        return world

    service.update_world_meta = AsyncMock(side_effect=_update_world_meta)

    app.dependency_overrides[get_game_world_service] = lambda: service
    app.dependency_overrides[get_current_game_principal] = lambda: SimpleNamespace(
        id=principal_id,
        is_active=True,
    )

    return app, service


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameBehaviorRoutineCrudEndpoints:
    @pytest.mark.asyncio
    async def test_create_routine_success(self):
        world = _make_world(meta={"behavior": {"version": 1, "routines": {}}})
        app, service = _app(world)
        payload = _routine_payload(routine_id="routine.create")

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/1/behavior/routines",
                json={"routine": payload},
            )

        assert response.status_code == 200
        assert response.json()["id"] == "routine.create"
        assert "routine.create" in world.meta["behavior"]["routines"]
        service.update_world_meta.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_routine_duplicate_returns_409(self):
        existing = _routine_payload(routine_id="routine.dup")
        world = _make_world(meta={"behavior": {"version": 1, "routines": {"routine.dup": existing}}})
        app, service = _app(world)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/1/behavior/routines",
                json={"routine": existing},
            )

        assert response.status_code == 409
        assert response.json()["detail"] == "Routine routine.dup already exists"
        service.update_world_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_routine_invalid_schema_returns_400(self):
        world = _make_world(meta={"behavior": {"version": 1, "routines": {}}})
        app, service = _app(world)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/1/behavior/routines",
                json={"routine": _invalid_routine_payload()},
            )

        assert response.status_code == 400
        body = response.json()["detail"]
        assert body["error"] == "invalid_routine"
        assert isinstance(body["details"], list)
        service.update_world_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_update_routine_success(self):
        original = _routine_payload(routine_id="routine.edit", name="Before")
        world = _make_world(meta={"behavior": {"version": 1, "routines": {"routine.edit": original}}})
        app, service = _app(world)
        updated = _routine_payload(routine_id="routine.edit", name="After")

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/worlds/1/behavior/routines/routine.edit",
                json={"routine": updated},
            )

        assert response.status_code == 200
        assert response.json()["name"] == "After"
        assert world.meta["behavior"]["routines"]["routine.edit"]["name"] == "After"
        service.update_world_meta.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_routine_missing_returns_404(self):
        world = _make_world(meta={"behavior": {"version": 1, "routines": {}}})
        app, service = _app(world)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/worlds/1/behavior/routines/routine.missing",
                json={"routine": _routine_payload(routine_id="routine.missing")},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Routine routine.missing not found"
        service.update_world_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_delete_routine_success(self):
        routine = _routine_payload(routine_id="routine.delete")
        world = _make_world(meta={"behavior": {"version": 1, "routines": {"routine.delete": routine}}})
        app, service = _app(world)

        async with _client(app) as c:
            response = await c.delete(
                "/api/v1/game/worlds/1/behavior/routines/routine.delete"
            )

        assert response.status_code == 200
        assert response.json() == {"deleted": "routine.delete"}
        assert "routine.delete" not in world.meta["behavior"]["routines"]
        service.update_world_meta.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_routine_missing_returns_404(self):
        world = _make_world(meta={"behavior": {"version": 1, "routines": {}}})
        app, service = _app(world)

        async with _client(app) as c:
            response = await c.delete(
                "/api/v1/game/worlds/1/behavior/routines/routine.unknown"
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Routine routine.unknown not found"
        service.update_world_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_non_owner_or_missing_world_returns_404(self):
        other_owner_world = _make_world(owner_user_id=999, meta={"behavior": {"version": 1, "routines": {}}})
        app_non_owner, non_owner_service = _app(other_owner_world, principal_id=1)

        async with _client(app_non_owner) as c:
            non_owner_response = await c.post(
                "/api/v1/game/worlds/1/behavior/routines",
                json={"routine": _routine_payload(routine_id="routine.blocked")},
            )

        assert non_owner_response.status_code == 404
        assert non_owner_response.json()["detail"] == "World not found"
        non_owner_service.update_world_meta.assert_not_awaited()

        app_missing, missing_service = _app(None, principal_id=1)
        async with _client(app_missing) as c:
            missing_response = await c.delete(
                "/api/v1/game/worlds/1/behavior/routines/routine.any"
            )

        assert missing_response.status_code == 404
        assert missing_response.json()["detail"] == "World not found"
        missing_service.update_world_meta.assert_not_awaited()
