"""
Verification tests for the GameObject authoring API.

Checkpoint: verification (gameobject-runtime-refactor-v1)
Step covered: e2e_slice — round-trip authoring flows through object + template paths.
"""
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
class TestGameObjectAuthoringVerification:
    """End-to-end round-trip tests for the full authoring flow."""

    @pytest.mark.asyncio
    async def test_full_authoring_round_trip_create_get_patch(self):
        """Create → GET → PATCH → verify full round-trip preserves all fields."""
        db = _FakeDB()
        app = _app(db)

        # Step 1: Create with full authoring payload
        async with _client(app) as c:
            create_resp = await c.post(
                "/api/v1/game/objects/?world_id=1",
                json={
                    "name": "Enchanted Door",
                    "description": "A mysterious door",
                    "object_kind": "prop",
                    "capabilities": [
                        {"id": "interactable", "enabled": True},
                        {"id": "navigation_blocker", "enabled": True, "config": {"strength": 10}},
                    ],
                    "components": [
                        {"type": "lock_mechanism", "data": {"key_id": "skeleton_key"}},
                    ],
                    "tags": ["interactive", "magical", "locked"],
                    "template_binding": {
                        "template_kind": "propTemplate",
                        "template_id": "door.enchanted",
                        "runtime_kind": "prop",
                        "link_id": "link-door-1",
                        "mapping_id": "map-door-enchanted",
                    },
                },
            )

        assert create_resp.status_code == 201
        created = create_resp.json()
        object_id = created["id"]

        # Verify create response has all fields
        assert created["name"] == "Enchanted Door"
        assert created["objectKind"] == "prop"
        assert len(created["capabilities"]) == 2
        assert len(created["components"]) == 1
        assert created["tags"] == ["interactive", "magical", "locked"]
        binding = created["templateBinding"]
        assert binding["templateKind"] == "propTemplate"
        assert binding["templateId"] == "door.enchanted"
        assert binding["runtimeKind"] == "prop"
        assert binding["linkId"] == "link-door-1"
        assert binding["mappingId"] == "map-door-enchanted"

        # Step 2: GET the object back — simulate by seeding FakeDB
        created_obj = db.added[-1]
        db.get_values[(GameItem, object_id)] = created_obj

        async with _client(app) as c:
            get_resp = await c.get(f"/api/v1/game/objects/{object_id}")

        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["capabilities"] == created["capabilities"]
        assert fetched["components"] == created["components"]
        assert fetched["tags"] == created["tags"]
        assert fetched["templateBinding"] == created["templateBinding"]

        # Step 3: PATCH — add a capability, change tags
        async with _client(app) as c:
            patch_resp = await c.patch(
                f"/api/v1/game/objects/{object_id}",
                json={
                    "capabilities": [
                        {"id": "interactable", "enabled": True},
                        {"id": "navigation_blocker", "enabled": False},
                        {"id": "quest_target", "enabled": True},
                    ],
                    "tags": ["interactive", "magical", "unlocked"],
                },
            )

        assert patch_resp.status_code == 200
        patched = patch_resp.json()
        assert len(patched["capabilities"]) == 3
        assert patched["capabilities"][2]["id"] == "quest_target"
        assert patched["tags"] == ["interactive", "magical", "unlocked"]
        # Binding should be preserved (not touched by patch)
        assert patched["templateBinding"]["runtimeKind"] == "prop"
        assert patched["description"] == "A mysterious door"

    @pytest.mark.asyncio
    async def test_binding_lifecycle_create_patch_delete(self):
        """Create without binding → patch to add → delete to remove."""
        db = _FakeDB()
        app = _app(db)

        # Create without binding
        async with _client(app) as c:
            create_resp = await c.post(
                "/api/v1/game/objects/?world_id=2",
                json={
                    "name": "Generic Prop",
                    "object_kind": "prop",
                },
            )

        assert create_resp.status_code == 201
        created = create_resp.json()
        object_id = created["id"]
        assert created["templateBinding"] is None

        # Seed the object into FakeDB for subsequent requests
        created_obj = db.added[-1]
        db.get_values[(GameItem, object_id)] = created_obj

        # Patch to add binding
        async with _client(app) as c:
            patch_resp = await c.patch(
                f"/api/v1/game/objects/{object_id}/binding",
                json={
                    "template_kind": "propTemplate",
                    "template_id": "crate.wooden",
                    "runtime_kind": "prop",
                },
            )

        assert patch_resp.status_code == 200
        patched = patch_resp.json()
        assert patched["templateBinding"]["templateKind"] == "propTemplate"
        assert patched["templateBinding"]["runtimeKind"] == "prop"

        # Delete binding
        async with _client(app) as c:
            del_resp = await c.delete(f"/api/v1/game/objects/{object_id}/binding")

        assert del_resp.status_code == 200
        deleted = del_resp.json()
        assert deleted["templateBinding"] is None
        assert deleted["objectKind"] == "prop"

    @pytest.mark.asyncio
    async def test_meta_envelope_isolation(self):
        """User meta keys are preserved alongside _game_object envelope."""
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/game/objects/?world_id=1",
                json={
                    "name": "Annotated Object",
                    "object_kind": "npc",
                    "tags": ["test"],
                    "capabilities": [{"id": "dialogue_target"}],
                    "meta": {
                        "author_notes": "Created for verification",
                        "priority": 5,
                    },
                },
            )

        assert resp.status_code == 201
        body = resp.json()
        # User meta preserved
        assert body["meta"]["author_notes"] == "Created for verification"
        assert body["meta"]["priority"] == 5
        # Envelope written correctly
        envelope = body["meta"]["_game_object"]
        assert envelope["object_kind"] == "npc"
        assert envelope["tags"] == ["test"]
        assert len(envelope["capabilities"]) == 1
        assert envelope["capabilities"][0]["id"] == "dialogue_target"

    @pytest.mark.asyncio
    async def test_patch_preserves_unset_capabilities_and_components(self):
        """PATCH with only name change doesn't wipe capabilities/components."""
        db = _FakeDB()
        existing = SimpleNamespace(
            id=100,
            world_id=1,
            name="Guard Tower",
            description="Watchtower",
            meta={
                "_game_object": {
                    "object_kind": "prop",
                    "capabilities": [
                        {"id": "navigation_blocker", "enabled": True},
                    ],
                    "components": [
                        {"type": "visibility", "enabled": True, "data": {"range": 50}},
                    ],
                    "tags": ["structure"],
                }
            },
            stats={},
            stats_metadata={},
        )
        db.get_values[(GameItem, 100)] = existing
        app = _app(db)

        async with _client(app) as c:
            resp = await c.patch(
                "/api/v1/game/objects/100",
                json={"name": "Tall Guard Tower"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Tall Guard Tower"
        # Capabilities and components preserved (not in patch payload)
        assert len(body["capabilities"]) == 1
        assert body["capabilities"][0]["id"] == "navigation_blocker"
        assert len(body["components"]) == 1
        assert body["components"][0]["type"] == "visibility"
        assert body["tags"] == ["structure"]

    @pytest.mark.asyncio
    async def test_list_returns_consistent_summary_for_authored_objects(self):
        """List endpoint returns tags and binding for fully authored objects."""
        db = _FakeDB()
        db.execute_results = [
            _ExecuteResult(
                scalars=[
                    SimpleNamespace(
                        id=200,
                        world_id=1,
                        name="Shopkeeper",
                        description="Sells goods",
                        meta={
                            "_game_object": {
                                "object_kind": "npc",
                                "template_binding": {
                                    "template_kind": "characterInstance",
                                    "template_id": "npc.shopkeeper",
                                    "runtime_kind": "npc",
                                    "link_id": "link-shop",
                                    "mapping_id": "map-shop",
                                },
                                "tags": ["friendly", "merchant"],
                                "capabilities": [
                                    {"id": "dialogue_target", "enabled": True},
                                    {"id": "interactable", "enabled": True},
                                ],
                            }
                        },
                        stats={},
                        stats_metadata={},
                    ),
                    SimpleNamespace(
                        id=201,
                        world_id=1,
                        name="Barrel",
                        description=None,
                        meta={
                            "_game_object": {
                                "object_kind": "prop",
                                "tags": ["destructible"],
                            }
                        },
                        stats={},
                        stats_metadata={},
                    ),
                ]
            )
        ]
        app = _app(db)

        async with _client(app) as c:
            resp = await c.get("/api/v1/game/objects/?world_id=1")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2

        shopkeeper = body[0]
        assert shopkeeper["objectKind"] == "npc"
        assert shopkeeper["tags"] == ["friendly", "merchant"]
        assert shopkeeper["templateBinding"]["runtimeKind"] == "npc"
        assert shopkeeper["templateBinding"]["mappingId"] == "map-shop"

        barrel = body[1]
        assert barrel["objectKind"] == "prop"
        assert barrel["tags"] == ["destructible"]
        assert barrel["templateBinding"] is None
