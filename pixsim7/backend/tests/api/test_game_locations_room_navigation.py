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
    from pixsim7.backend.main.services.game.location import (
        AuthoringRevisionConflictError,
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


def _location(
    meta: dict | None = None,
    *,
    world_id: int | None = 1,
    x: float = 0.0,
    y: float = 0.0,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        world_id=world_id,
        name="Room One",
        x=x,
        y=y,
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
    service.create_location = AsyncMock(return_value=updated_location or location)
    service.update_location = AsyncMock(return_value=updated_location or location)
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
    async def test_patch_location_meta_rejects_reserved_section_keys(self):
        payload = _valid_room_navigation_payload()
        app, service = _app(location=_location())

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1",
                json={"meta": {"room_navigation": payload, "npcSlots2d": []}},
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "reserved_location_meta_keys"
        assert body["detail"]["keys"] == ["npcSlots2d", "room_navigation"]
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_patch_location_meta_returns_updated_location_detail(self):
        updated = _location(meta={"label": "dock"})
        app, service = _app(location=_location(meta={}), updated_location=updated)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1",
                json={"meta": {"label": "dock"}},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["meta"]["label"] == "dock"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"label": "dock"},
        )

    @pytest.mark.asyncio
    async def test_patch_location_meta_returns_conflict_when_expected_revision_is_stale(self):
        app, service = _app(
            location=_location(meta={"room_navigation": _valid_room_navigation_payload()}),
            update_side_effect=AuthoringRevisionConflictError(
                current_authoring_revision="rev-current"
            ),
        )

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1",
                json={
                    "meta": {"label": "dock"},
                    "expectedAuthoringRevision": "rev-stale",
                },
            )

        assert response.status_code == 409
        body = response.json()
        assert body["detail"]["error"] == "location_authoring_revision_conflict"
        assert body["detail"]["current_authoring_revision"] == "rev-current"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"label": "dock"},
            expected_authoring_revision="rev-stale",
        )

    @pytest.mark.asyncio
    async def test_get_room_navigation_returns_canonical_payload(self):
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
            response = await c.get("/api/v1/game/locations/1/room-navigation")

        assert response.status_code == 200
        body = response.json()
        assert body["locationId"] == 1
        assert body["roomNavigation"]["room_id"] == "room.alpha"
        assert body["migrationNotes"] == [
            "migrated location.meta.roomNavigation to location.meta.room_navigation"
        ]

    @pytest.mark.asyncio
    async def test_put_room_navigation_preserves_other_meta_keys(self):
        payload = _valid_room_navigation_payload()
        updated = _location(meta={"room_navigation": payload, "npcSlots2d": []})
        app, service = _app(
            location=_location(meta={"npcSlots2d": [], "roomNavigation": payload}),
            updated_location=updated,
        )

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/room-navigation",
                json={"roomNavigation": payload},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["roomNavigation"]["room_id"] == "room.alpha"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"npcSlots2d": [], "room_navigation": payload},
        )

    @pytest.mark.asyncio
    async def test_patch_room_navigation_initializes_payload_and_applies_operations(self):
        checkpoint = {
            "id": "cp_a",
            "label": "A",
            "view": {
                "kind": "cylindrical_pano",
                "pano_asset_id": "asset.a",
            },
            "hotspots": [],
        }
        updated = _location(
            meta={
                "npcSlots2d": [],
                "room_navigation": {
                    "version": 1,
                    "room_id": "room.patch",
                    "checkpoints": [checkpoint],
                    "edges": [],
                    "start_checkpoint_id": "cp_a",
                },
            }
        )
        app, service = _app(location=_location(meta={"npcSlots2d": []}), updated_location=updated)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1/room-navigation",
                json={
                    "createIfMissing": True,
                    "initialRoomId": "room.patch",
                    "operations": [
                        {
                            "op": "upsert_checkpoint",
                            "checkpoint": checkpoint,
                        },
                        {
                            "op": "set_start_checkpoint",
                            "startCheckpointId": "cp_a",
                        },
                    ],
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["roomNavigation"]["room_id"] == "room.patch"
        assert body["roomNavigation"]["start_checkpoint_id"] == "cp_a"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={
                "npcSlots2d": [],
                "room_navigation": {
                    "version": 1,
                    "room_id": "room.patch",
                    "checkpoints": [checkpoint],
                    "edges": [],
                    "start_checkpoint_id": "cp_a",
                },
            },
        )

    @pytest.mark.asyncio
    async def test_patch_room_navigation_returns_structured_patch_error(self):
        payload = _valid_room_navigation_payload()
        app, service = _app(location=_location(meta={"room_navigation": payload}))

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1/room-navigation",
                json={
                    "operations": [
                        {
                            "op": "upsert_edge",
                        }
                    ]
                },
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "invalid_room_navigation_patch"
        assert body["detail"]["op_index"] == 1
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_validate_room_navigation_returns_errors_without_mutation(self):
        payload = _valid_room_navigation_payload()
        payload["edges"][0]["to_checkpoint_id"] = "cp_missing"
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/locations/1/room-navigation/validate",
                json={"roomNavigation": payload},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is False
        assert body["errors"][0]["path"] == "room_navigation.edges[0].to_checkpoint_id"
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_get_room_navigation_transition_cache_returns_payload(self):
        transition_cache = {
            "version": 1,
            "entries": {
                "cache-key": {"status": "completed"},
            },
        }
        app, _ = _app(
            location=_location(
                meta={
                    "room_navigation_transition_cache": transition_cache,
                }
            )
        )

        async with _client(app) as c:
            response = await c.get(
                "/api/v1/game/locations/1/room-navigation/transition-cache"
            )

        assert response.status_code == 200
        body = response.json()
        assert body["locationId"] == 1
        assert body["transitionCache"]["version"] == 1
        assert "cache-key" in body["transitionCache"]["entries"]

    @pytest.mark.asyncio
    async def test_put_room_navigation_transition_cache_preserves_room_navigation(self):
        payload = _valid_room_navigation_payload()
        transition_cache = {
            "version": 1,
            "entries": {
                "cache-key": {"status": "pending"},
            },
        }
        updated = _location(
            meta={
                "room_navigation": payload,
                "room_navigation_transition_cache": transition_cache,
                "npcSlots2d": [],
            }
        )
        app, service = _app(
            location=_location(meta={"room_navigation": payload, "npcSlots2d": []}),
            updated_location=updated,
        )

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/room-navigation/transition-cache",
                json={"transitionCache": transition_cache},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["transitionCache"]["entries"]["cache-key"]["status"] == "pending"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={
                "room_navigation": payload,
                "npcSlots2d": [],
                "room_navigation_transition_cache": transition_cache,
            },
        )

    @pytest.mark.asyncio
    async def test_put_room_navigation_transition_cache_rejects_invalid_entries(self):
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/room-navigation/transition-cache",
                json={
                    "transitionCache": {
                        "version": 1,
                        "entries": [],
                    }
                },
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "invalid_room_navigation_transition_cache"
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_get_npc_slots_2d_returns_slots(self):
        slots = [
            {
                "id": "slot_a",
                "x": 0.1,
                "y": 0.2,
                "roles": ["merchant"],
                "fixedNpcId": None,
            }
        ]
        app, _ = _app(
            location=_location(
                meta={
                    "npcSlots2d": slots,
                }
            )
        )

        async with _client(app) as c:
            response = await c.get("/api/v1/game/locations/1/npc-slots-2d")

        assert response.status_code == 200
        body = response.json()
        assert body["locationId"] == 1
        assert body["npcSlots2d"][0]["id"] == "slot_a"

    @pytest.mark.asyncio
    async def test_put_npc_slots_2d_preserves_room_navigation(self):
        payload = _valid_room_navigation_payload()
        slots = [
            {
                "id": "slot_a",
                "x": 0.1,
                "y": 0.2,
                "roles": ["merchant"],
                "fixedNpcId": None,
            }
        ]
        updated = _location(
            meta={
                "room_navigation": payload,
                "npcSlots2d": slots,
            }
        )
        app, service = _app(
            location=_location(meta={"room_navigation": payload}),
            updated_location=updated,
        )

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/npc-slots-2d",
                json={"npcSlots2d": slots},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["npcSlots2d"][0]["id"] == "slot_a"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={
                "room_navigation": payload,
                "npcSlots2d": slots,
            },
        )

    @pytest.mark.asyncio
    async def test_put_npc_slots_2d_accepts_expected_authoring_revision(self):
        slots = [
            {
                "id": "slot_a",
                "x": 0.1,
                "y": 0.2,
                "roles": ["merchant"],
                "fixedNpcId": None,
            }
        ]
        updated = _location(meta={"npcSlots2d": slots})
        app, service = _app(location=_location(meta={"npcSlots2d": []}), updated_location=updated)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/npc-slots-2d",
                json={
                    "npcSlots2d": slots,
                    "expectedAuthoringRevision": "rev-current",
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["npcSlots2d"][0]["id"] == "slot_a"
        assert isinstance(body.get("authoringRevision"), str)
        assert len(body["authoringRevision"]) > 0
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"npcSlots2d": slots},
            expected_authoring_revision="rev-current",
        )

    @pytest.mark.asyncio
    async def test_put_npc_slots_2d_rejects_invalid_slot_payload(self):
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/npc-slots-2d",
                json={
                    "npcSlots2d": [
                        {
                            "id": "slot_a",
                            "x": "left",
                            "y": 0.2,
                        }
                    ]
                },
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "invalid_npc_slots_2d"
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_location_uses_query_world_id(self):
        created = _location(meta={"bootstrap": True}, world_id=7, x=12.5, y=8.0)
        app, service = _app(location=_location(), updated_location=created)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/locations/?world_id=7",
                json={
                    "name": "Dock",
                    "x": 12.5,
                    "y": 8.0,
                    "meta": {"bootstrap": True},
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["worldId"] == 7
        assert body["x"] == 12.5
        assert body["y"] == 8.0
        service.create_location.assert_awaited_once_with(
            world_id=7,
            name="Dock",
            x=12.5,
            y=8.0,
            asset_id=None,
            default_spawn=None,
            meta={"bootstrap": True},
        )

    @pytest.mark.asyncio
    async def test_create_location_rejects_reserved_section_keys(self):
        app, service = _app(location=_location(), updated_location=_location())

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/locations/",
                json={
                    "name": "Dock",
                    "x": 0.0,
                    "y": 0.0,
                    "meta": {"npcSlots2d": []},
                },
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "reserved_location_meta_keys"
        assert body["detail"]["keys"] == ["npcSlots2d"]
        service.create_location.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_put_location_uses_query_world_id(self):
        existing = _location(world_id=7, x=1.0, y=2.0)
        updated = _location(world_id=7, x=4.0, y=9.0, meta={"label": "updated"})
        app, service = _app(location=existing, updated_location=updated)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1?world_id=7",
                json={
                    "name": "Room One",
                    "x": 4.0,
                    "y": 9.0,
                    "meta": {"label": "updated"},
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["worldId"] == 7
        assert body["x"] == 4.0
        assert body["y"] == 9.0
        service.update_location.assert_awaited_once_with(
            location_id=1,
            name="Room One",
            x=4.0,
            y=9.0,
            asset_id=None,
            default_spawn=None,
            meta={"label": "updated"},
            world_id=7,
        )

    @pytest.mark.asyncio
    async def test_put_location_rejects_reserved_section_keys(self):
        existing = _location(world_id=7, x=1.0, y=2.0)
        app, service = _app(location=existing, updated_location=existing)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1?world_id=7",
                json={
                    "name": "Room One",
                    "x": 4.0,
                    "y": 9.0,
                    "meta": {"roomNavigation": _valid_room_navigation_payload()},
                },
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "reserved_location_meta_keys"
        assert body["detail"]["keys"] == ["roomNavigation"]
        service.update_location.assert_not_awaited()
