from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_game_principal,
        get_game_location_service,
    )
    from pixsim7.backend.main.api.v1.game_locations import router
    from pixsim7.backend.main.domain.game.schemas.room_navigation import (
        RoomNavigationValidationError,
        RoomNavigationValidationIssue,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _valid_room_navigation_payload() -> dict:
    return {
        "version": 1,
        "room_id": "room.alpha",
        "checkpoints": [
            {
                "id": "cp_a",
                "label": "Checkpoint A",
                "view": {
                    "kind": "cylindrical_pano",
                    "pano_asset_id": "asset.a",
                },
                "hotspots": [],
            },
            {
                "id": "cp_b",
                "label": "Checkpoint B",
                "view": {
                    "kind": "cylindrical_pano",
                    "pano_asset_id": "asset.b",
                },
                "hotspots": [],
            },
        ],
        "edges": [
            {
                "id": "edge_ab",
                "from_checkpoint_id": "cp_a",
                "to_checkpoint_id": "cp_b",
                "move_kind": "forward",
            }
        ],
        "start_checkpoint_id": "cp_a",
    }


def _location(meta: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        name="Room One",
        asset_id=None,
        default_spawn=None,
        meta=meta or {},
    )


def _app(
    *,
    location: SimpleNamespace,
    updated_location: SimpleNamespace | None = None,
    update_side_effect=None,
):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/locations")

    service = SimpleNamespace()
    service.list_locations = AsyncMock(return_value=[location])
    service.get_location = AsyncMock(return_value=location)
    service.get_hotspots = AsyncMock(return_value=[])
    service.replace_hotspots = AsyncMock(return_value=[])
    service.update_location_meta = AsyncMock(
        side_effect=update_side_effect,
        return_value=updated_location or location,
    )

    app.dependency_overrides[get_game_location_service] = lambda: service
    app.dependency_overrides[get_current_game_principal] = lambda: SimpleNamespace(
        id=1,
        is_active=True,
    )

    return app, service


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameLocationsRoomNavigation:
    @pytest.mark.asyncio
    async def test_get_location_canonicalizes_legacy_room_navigation_key(self):
        payload = _valid_room_navigation_payload()
        app, _ = _app(
            location=_location(
                meta={
                    "roomNavigation": payload,
                    "npcSlots2d": [],
                }
            )
        )

        async with _client(app) as c:
            response = await c.get("/api/v1/game/locations/1")

        assert response.status_code == 200
        body = response.json()
        assert "room_navigation" in body["meta"]
        assert "roomNavigation" not in body["meta"]
        assert body["meta"]["npcSlots2d"] == []

    @pytest.mark.asyncio
    async def test_patch_location_meta_returns_structured_room_navigation_validation_errors(self):
        payload = _valid_room_navigation_payload()
        issues = [
            RoomNavigationValidationIssue(
                path="room_navigation.edges[0].to_checkpoint_id",
                message='edge to_checkpoint_id "cp_missing" does not exist in checkpoints',
            )
        ]
        app, service = _app(
            location=_location(),
            update_side_effect=RoomNavigationValidationError(issues),
        )

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1",
                json={"meta": {"room_navigation": payload}},
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "invalid_room_navigation"
        assert body["detail"]["details"][0]["path"] == "room_navigation.edges[0].to_checkpoint_id"
        service.update_location_meta.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_patch_location_meta_returns_updated_location_detail(self):
        payload = _valid_room_navigation_payload()
        updated = _location(meta={"room_navigation": payload, "npcSlots2d": []})
        app, service = _app(location=_location(meta={}), updated_location=updated)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1",
                json={"meta": {"room_navigation": payload, "npcSlots2d": []}},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["meta"]["room_navigation"]["room_id"] == "room.alpha"
        assert body["meta"]["npcSlots2d"] == []
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"room_navigation": payload, "npcSlots2d": []},
        )
