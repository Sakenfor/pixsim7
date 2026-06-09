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


def _placement(
    placement_id: str = "p1",
    *,
    entity_type: str = "hotspot",
    x: float = 0.5,
    y: float = 0.5,
    **extra,
) -> dict:
    """A valid camelCase placement request payload."""
    payload = {
        "id": placement_id,
        "entityType": entity_type,
        "position": {"x": x, "y": y},
    }
    payload.update(extra)
    return payload


def _stored_placement(
    placement_id: str = "p1",
    *,
    entity_type: str = "hotspot",
    x: float = 0.5,
    y: float = 0.5,
    source: str = "manual",
    **extra,
) -> dict:
    """The normalized snake_case shape as persisted under location.meta."""
    stored = {
        "id": placement_id,
        "entity_type": entity_type,
        "position": {"x": x, "y": y},
        "source": source,
    }
    stored.update(extra)
    return stored


def _location(meta: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        world_id=1,
        name="Room One",
        x=0.0,
        y=0.0,
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
    service.get_location = AsyncMock(return_value=location)
    service.get_hotspots = AsyncMock(return_value=[])
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
class TestGameLocationPlacements:
    # ── reads ───────────────────────────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_get_returns_empty_when_absent(self):
        app, _ = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.get("/api/v1/game/locations/1/placements")

        assert response.status_code == 200
        body = response.json()
        assert body["locationId"] == 1
        assert body["placements"] == []
        assert "authoringRevision" in body

    @pytest.mark.asyncio
    async def test_get_serializes_stored_placement_as_camelcase(self):
        app, _ = _app(
            location=_location(
                meta={
                    "placements": [
                        _stored_placement(
                            "p1",
                            entity_type="npc",
                            depth_checkpoint_id="cp_a",
                            confidence=0.9,
                            source="detection",
                        )
                    ]
                }
            )
        )

        async with _client(app) as c:
            response = await c.get("/api/v1/game/locations/1/placements")

        assert response.status_code == 200
        placement = response.json()["placements"][0]
        assert placement["entityType"] == "npc"
        assert placement["depthCheckpointId"] == "cp_a"
        assert placement["source"] == "detection"
        assert placement["confidence"] == 0.9

    @pytest.mark.asyncio
    async def test_get_filters_by_entity_type(self):
        app, _ = _app(
            location=_location(
                meta={
                    "placements": [
                        _stored_placement("a", entity_type="npc"),
                        _stored_placement("b", entity_type="hotspot"),
                    ]
                }
            )
        )

        async with _client(app) as c:
            response = await c.get(
                "/api/v1/game/locations/1/placements",
                params={"entity_type": "npc"},
            )

        assert response.status_code == 200
        placements = response.json()["placements"]
        assert [p["id"] for p in placements] == ["a"]

    # ── replace (PUT) ─────────────────────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_put_normalizes_and_preserves_other_meta(self):
        updated = _location(
            meta={"npcSlots2d": [], "placements": [_stored_placement("p1")]}
        )
        app, service = _app(
            location=_location(meta={"npcSlots2d": []}),
            updated_location=updated,
        )

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/placements",
                json={"placements": [_placement("p1")]},
            )

        assert response.status_code == 200
        assert response.json()["placements"][0]["id"] == "p1"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"npcSlots2d": [], "placements": [_stored_placement("p1")]},
        )

    @pytest.mark.asyncio
    async def test_put_rejects_out_of_range_coordinate(self):
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/placements",
                json={"placements": [_placement("p1", x=2.0)]},
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "invalid_placements"
        assert body["detail"]["item_index"] == 0
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_put_rejects_duplicate_ids(self):
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/placements",
                json={"placements": [_placement("dup"), _placement("dup")]},
            )

        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "invalid_placements"
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_put_returns_conflict_when_expected_revision_is_stale(self):
        app, service = _app(
            location=_location(meta={}),
            update_side_effect=AuthoringRevisionConflictError(
                current_authoring_revision="rev-current"
            ),
        )

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/locations/1/placements",
                json={
                    "placements": [_placement("p1")],
                    "expectedAuthoringRevision": "rev-stale",
                },
            )

        assert response.status_code == 409
        body = response.json()
        assert body["detail"]["error"] == "location_authoring_revision_conflict"
        assert body["detail"]["current_authoring_revision"] == "rev-current"
        service.update_location_meta.assert_awaited_once_with(
            location_id=1,
            meta={"placements": [_stored_placement("p1")]},
            expected_authoring_revision="rev-stale",
        )

    # ── upsert (PATCH) ────────────────────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_patch_replaces_matching_and_preserves_others(self):
        existing = [
            _stored_placement("p1", entity_type="npc"),
            _stored_placement("p2", entity_type="hotspot"),
        ]
        updated = _location(meta={"placements": existing})
        app, service = _app(
            location=_location(meta={"placements": existing}),
            updated_location=updated,
        )

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1/placements/p1",
                json={"placement": _placement("p1", entity_type="object", x=0.2, y=0.3)},
            )

        assert response.status_code == 200
        _, kwargs = service.update_location_meta.await_args
        stored = kwargs["meta"]["placements"]
        # p2 preserved, p1 replaced (single occurrence), order: others then upserted
        assert [p["id"] for p in stored] == ["p2", "p1"]
        p1 = next(p for p in stored if p["id"] == "p1")
        assert p1["entity_type"] == "object"
        assert p1["position"] == {"x": 0.2, "y": 0.3}

    @pytest.mark.asyncio
    async def test_patch_inserts_when_id_absent(self):
        app, service = _app(
            location=_location(meta={"placements": [_stored_placement("p1")]}),
            updated_location=_location(meta={"placements": []}),
        )

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1/placements/p2",
                json={"placement": _placement("p2")},
            )

        assert response.status_code == 200
        _, kwargs = service.update_location_meta.await_args
        assert [p["id"] for p in kwargs["meta"]["placements"]] == ["p1", "p2"]

    @pytest.mark.asyncio
    async def test_patch_rejects_id_mismatch(self):
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1/placements/p1",
                json={"placement": _placement("other")},
            )

        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "invalid_placements"
        service.update_location_meta.assert_not_awaited()

    # ── delete ────────────────────────────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_delete_removes_matching_placement(self):
        existing = [_stored_placement("p1"), _stored_placement("p2")]
        app, service = _app(
            location=_location(meta={"placements": existing}),
            updated_location=_location(meta={"placements": [_stored_placement("p2")]}),
        )

        async with _client(app) as c:
            response = await c.request(
                "DELETE",
                "/api/v1/game/locations/1/placements/p1",
                json={},
            )

        assert response.status_code == 200
        _, kwargs = service.update_location_meta.await_args
        assert [p["id"] for p in kwargs["meta"]["placements"]] == ["p2"]

    @pytest.mark.asyncio
    async def test_delete_returns_404_when_absent(self):
        app, service = _app(
            location=_location(meta={"placements": [_stored_placement("p1")]})
        )

        async with _client(app) as c:
            response = await c.request(
                "DELETE",
                "/api/v1/game/locations/1/placements/missing",
                json={},
            )

        assert response.status_code == 404
        service.update_location_meta.assert_not_awaited()

    # ── reserved-key guard ────────────────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_generic_meta_patch_rejects_reserved_placements_key(self):
        app, service = _app(location=_location(meta={}))

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/locations/1",
                json={"meta": {"placements": []}},
            )

        assert response.status_code == 400
        body = response.json()
        assert body["detail"]["error"] == "reserved_location_meta_keys"
        assert body["detail"]["keys"] == ["placements"]
        service.update_location_meta.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_404_when_location_missing(self):
        app, service = _app(location=_location(meta={}))
        service.get_location = AsyncMock(return_value=None)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/locations/99/placements")

        assert response.status_code == 404
