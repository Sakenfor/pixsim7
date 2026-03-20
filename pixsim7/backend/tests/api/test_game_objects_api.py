from __future__ import annotations

from types import SimpleNamespace

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_game_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import game_objects
    from pixsim7.backend.main.domain.game import GameItem

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _ScalarResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)


class _ExecuteResult:
    def __init__(self, *, scalars=None):
        self._scalars = list(scalars or [])

    def scalars(self):
        return _ScalarResult(self._scalars)


class _FakeDB:
    def __init__(self):
        self.execute_results = []
        self.get_values = {}
        self.added = []
        self.commit_count = 0
        self._next_id = 500

    async def execute(self, _stmt):
        if not self.execute_results:
            raise AssertionError("Unexpected db.execute() call")
        return self.execute_results.pop(0)

    async def get(self, model, key):
        return self.get_values.get((model, key))

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, obj):
        current_id = getattr(obj, "id", None)
        if current_id is None:
            self._next_id += 1
            obj.id = self._next_id


def _app(db: _FakeDB):
    app = FastAPI()
    app.include_router(game_objects.router, prefix="/api/v1/game/objects")
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_current_game_principal] = lambda: SimpleNamespace(
        id=1,
        is_active=True,
    )
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameObjectsApi:
    @pytest.mark.asyncio
    async def test_create_object_supports_query_world_id_and_binding(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/objects/?world_id=5",
                json={
                    "name": "Lantern",
                    "description": "Portable light source",
                    "object_kind": "prop",
                    "template_binding": {
                        "template_kind": "itemTemplate",
                        "template_id": "lantern.template",
                    },
                    "meta": {
                        "rarity": "common",
                    },
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["worldId"] == 5
        assert body["name"] == "Lantern"
        assert body["objectKind"] == "prop"
        assert body["templateBinding"]["templateKind"] == "itemTemplate"
        assert body["templateBinding"]["templateId"] == "lantern.template"
        assert body["meta"]["rarity"] == "common"
        assert body["meta"]["_game_object"]["object_kind"] == "prop"
        assert body["meta"]["_game_object"]["template_binding"]["template_kind"] == "itemTemplate"

    @pytest.mark.asyncio
    async def test_list_objects_serializes_object_meta(self):
        db = _FakeDB()
        db.execute_results = [
            _ExecuteResult(
                scalars=[
                    SimpleNamespace(
                        id=11,
                        world_id=5,
                        name="Boat Steering Wheel",
                        description="Controls direction",
                        meta={
                            "_game_object": {
                                "object_kind": "interactable",
                                "template_binding": {
                                    "template_kind": "itemTemplate",
                                    "template_id": "wheel.template",
                                    "link_id": "link-123",
                                },
                            }
                        },
                        stats={},
                        stats_metadata={},
                    )
                ]
            )
        ]
        app = _app(db)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/objects/?world_id=5")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["id"] == 11
        assert body[0]["objectKind"] == "interactable"
        assert body[0]["templateBinding"]["templateKind"] == "itemTemplate"
        assert body[0]["templateBinding"]["templateId"] == "wheel.template"
        assert body[0]["templateBinding"]["linkId"] == "link-123"

    @pytest.mark.asyncio
    async def test_put_object_query_world_id_takes_precedence(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id=7,
            world_id=1,
            name="Old Name",
            description=None,
            meta={},
            stats={},
            stats_metadata={},
        )
        db.get_values[(GameItem, 7)] = existing
        app = _app(db)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/objects/7?world_id=9",
                json={
                    "world_id": 99,
                    "name": "Cargo Crate",
                    "description": "Storage container",
                    "object_kind": "container",
                    "meta": {"capacity": 32},
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["worldId"] == 9
        assert body["name"] == "Cargo Crate"
        assert body["objectKind"] == "container"
        assert body["meta"]["capacity"] == 32
        assert existing.world_id == 9
        assert db.commit_count == 1

    @pytest.mark.asyncio
    async def test_create_object_with_capabilities_components_tags(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/objects/?world_id=3",
                json={
                    "name": "Treasure Chest",
                    "object_kind": "prop",
                    "capabilities": [
                        {"id": "interactable", "enabled": True},
                        {"id": "inventory_container", "config": {"max_slots": 12}},
                    ],
                    "components": [
                        {"type": "loot_table", "data": {"tier": "rare"}},
                    ],
                    "tags": ["interactive", "treasure"],
                    "template_binding": {
                        "template_kind": "propTemplate",
                        "template_id": "chest.gold",
                        "runtime_kind": "prop",
                        "mapping_id": "map-1",
                    },
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Treasure Chest"
        assert body["objectKind"] == "prop"
        assert body["tags"] == ["interactive", "treasure"]
        assert len(body["capabilities"]) == 2
        assert body["capabilities"][0]["id"] == "interactable"
        assert body["capabilities"][1]["config"]["max_slots"] == 12
        assert len(body["components"]) == 1
        assert body["components"][0]["type"] == "loot_table"
        assert body["templateBinding"]["runtimeKind"] == "prop"
        assert body["templateBinding"]["mappingId"] == "map-1"

    @pytest.mark.asyncio
    async def test_patch_object_partial_update(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id=10,
            world_id=3,
            name="Old Chest",
            description="Dusty",
            meta={
                "_game_object": {
                    "object_kind": "prop",
                    "template_binding": {
                        "template_kind": "propTemplate",
                        "template_id": "chest.gold",
                    },
                    "tags": ["old_tag"],
                },
                "custom_field": "keep_me",
            },
            stats={"hp": 100},
            stats_metadata={},
        )
        db.get_values[(GameItem, 10)] = existing
        app = _app(db)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/objects/10",
                json={
                    "name": "Gilded Chest",
                    "tags": ["treasure", "golden"],
                    "capabilities": [{"id": "interactable"}],
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Gilded Chest"
        assert body["description"] == "Dusty"
        assert body["objectKind"] == "prop"
        assert body["tags"] == ["treasure", "golden"]
        assert len(body["capabilities"]) == 1
        assert body["templateBinding"]["templateKind"] == "propTemplate"
        assert body["meta"]["custom_field"] == "keep_me"
        assert existing.stats == {"hp": 100}

    @pytest.mark.asyncio
    async def test_patch_object_binding_merges_fields(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id=20,
            world_id=1,
            name="Door",
            description=None,
            meta={
                "_game_object": {
                    "object_kind": "prop",
                    "template_binding": {
                        "template_kind": "propTemplate",
                        "template_id": "door.wooden",
                        "link_id": "link-old",
                    },
                }
            },
            stats={},
            stats_metadata={},
        )
        db.get_values[(GameItem, 20)] = existing
        app = _app(db)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/objects/20/binding",
                json={
                    "runtime_kind": "prop",
                    "mapping_id": "map-door",
                },
            )

        assert response.status_code == 200
        body = response.json()
        binding = body["templateBinding"]
        assert binding["templateKind"] == "propTemplate"
        assert binding["templateId"] == "door.wooden"
        assert binding["runtimeKind"] == "prop"
        assert binding["linkId"] == "link-old"
        assert binding["mappingId"] == "map-door"

    @pytest.mark.asyncio
    async def test_delete_object_binding_removes_binding(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id=30,
            world_id=1,
            name="Lamp",
            description=None,
            meta={
                "_game_object": {
                    "object_kind": "prop",
                    "template_binding": {
                        "template_kind": "propTemplate",
                        "template_id": "lamp.oil",
                    },
                }
            },
            stats={},
            stats_metadata={},
        )
        db.get_values[(GameItem, 30)] = existing
        app = _app(db)

        async with _client(app) as c:
            response = await c.delete("/api/v1/game/objects/30/binding")

        assert response.status_code == 200
        body = response.json()
        assert body["templateBinding"] is None
        assert body["objectKind"] == "prop"

    @pytest.mark.asyncio
    async def test_list_objects_includes_tags_in_summary(self):
        db = _FakeDB()
        db.execute_results = [
            _ExecuteResult(
                scalars=[
                    SimpleNamespace(
                        id=40,
                        world_id=2,
                        name="Barrel",
                        description=None,
                        meta={
                            "_game_object": {
                                "object_kind": "prop",
                                "tags": ["destructible", "container"],
                            }
                        },
                        stats={},
                        stats_metadata={},
                    )
                ]
            )
        ]
        app = _app(db)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/objects/")

        assert response.status_code == 200
        body = response.json()
        assert body[0]["tags"] == ["destructible", "container"]

    @pytest.mark.asyncio
    async def test_create_custom_kind_with_kind_data(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/objects/?world_id=1",
                json={
                    "name": "Cargo Shuttle",
                    "object_kind": "vehicle",
                    "kind_data": {
                        "speed": 120,
                        "fuel_capacity": 500,
                        "current_fuel": 350,
                    },
                    "capabilities": [
                        {"id": "interactable"},
                    ],
                    "tags": ["transport", "dockable"],
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["objectKind"] == "vehicle"
        assert body["kindData"]["speed"] == 120
        assert body["kindData"]["fuel_capacity"] == 500
        assert body["tags"] == ["transport", "dockable"]

    @pytest.mark.asyncio
    async def test_patch_custom_kind_data(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id=50,
            world_id=1,
            name="Shuttle",
            description=None,
            meta={
                "_game_object": {
                    "object_kind": "vehicle",
                    "kind_data": {"speed": 100, "fuel_capacity": 500},
                    "tags": ["transport"],
                }
            },
            stats={},
            stats_metadata={},
        )
        db.get_values[(GameItem, 50)] = existing
        app = _app(db)

        async with _client(app) as c:
            response = await c.patch(
                "/api/v1/game/objects/50",
                json={
                    "kind_data": {"speed": 150, "fuel_capacity": 500, "boost": True},
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["objectKind"] == "vehicle"
        assert body["kindData"]["speed"] == 150
        assert body["kindData"]["boost"] is True
        assert body["tags"] == ["transport"]

    @pytest.mark.asyncio
    async def test_get_detail_includes_kind_data(self):
        db = _FakeDB()
        existing = SimpleNamespace(
            id=60,
            world_id=2,
            name="Guard Tower",
            description="Watchtower",
            meta={
                "_game_object": {
                    "object_kind": "structure",
                    "kind_data": {"height": 15, "garrison_capacity": 4},
                }
            },
            stats={},
            stats_metadata={},
        )
        db.get_values[(GameItem, 60)] = existing
        app = _app(db)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/objects/60")

        assert response.status_code == 200
        body = response.json()
        assert body["objectKind"] == "structure"
        assert body["kindData"]["height"] == 15
        assert body["kindData"]["garrison_capacity"] == 4
