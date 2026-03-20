"""
API tests for game world project bundle import/export endpoints.

Focuses on HTTP behavior with mocked dependencies and service methods.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

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
    service.create_world = AsyncMock(
        return_value=SimpleNamespace(
            id=2,
            owner_user_id=owner_user_id,
            name="Created World",
            meta={},
        )
    )
    service.get_world_by_owner_and_upsert_key = AsyncMock(return_value=None)
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
        follow_redirects=True,
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameWorldProjectBundleEndpoints:

    @pytest.mark.asyncio
    async def test_list_worlds_prefers_keyed_world_for_duplicate_name(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()

        result = MagicMock()
        result.scalars.return_value.all.return_value = [
            SimpleNamespace(id=10, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap"}}),
            SimpleNamespace(id=11, owner_user_id=1, name="Bananza", meta={"project_world_upsert_key": "bananza.bootstrap:world:Bananza"}),
            SimpleNamespace(id=12, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap"}}),
            SimpleNamespace(id=13, owner_user_id=1, name="Another", meta={}),
        ]
        service.db.execute = AsyncMock(return_value=result)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/worlds?offset=0&limit=100")

        assert response.status_code == 200
        body = response.json()
        names_by_id = {int(row["id"]): row["name"] for row in body["worlds"]}
        assert 11 in names_by_id
        assert 10 not in names_by_id
        assert 12 not in names_by_id
        assert names_by_id[11] == "Bananza"
        assert names_by_id[13] == "Another"
        assert body["total"] == 2

    @pytest.mark.asyncio
    async def test_list_worlds_collapses_legacy_seed_duplicates_by_bootstrap_source(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()

        result = MagicMock()
        result.scalars.return_value.all.return_value = [
            SimpleNamespace(id=20, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap"}}),
            SimpleNamespace(id=21, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap"}}),
        ]
        service.db.execute = AsyncMock(return_value=result)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/worlds?offset=0&limit=100")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["worlds"][0]["id"] == 21

    @pytest.mark.asyncio
    async def test_list_worlds_keeps_same_name_worlds_when_bootstrap_sources_differ(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()

        result = MagicMock()
        result.scalars.return_value.all.return_value = [
            SimpleNamespace(id=30, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap.v1"}}),
            SimpleNamespace(id=31, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap.v2"}}),
        ]
        service.db.execute = AsyncMock(return_value=result)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/worlds?offset=0&limit=100")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert [int(row["id"]) for row in body["worlds"]] == [30, 31]

    @pytest.mark.asyncio
    async def test_list_worlds_keeps_same_name_worlds_without_seed_or_upsert_signals(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()

        result = MagicMock()
        result.scalars.return_value.all.return_value = [
            SimpleNamespace(id=40, owner_user_id=1, name="Bananza", meta={}),
            SimpleNamespace(id=41, owner_user_id=1, name="Bananza", meta={"bootstrap": {}}),
        ]
        service.db.execute = AsyncMock(return_value=result)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/worlds?offset=0&limit=100")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert [int(row["id"]) for row in body["worlds"]] == [40, 41]

    @pytest.mark.asyncio
    async def test_list_worlds_dedupe_is_case_insensitive_for_legacy_seed_rows(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()

        result = MagicMock()
        result.scalars.return_value.all.return_value = [
            SimpleNamespace(id=50, owner_user_id=1, name="Bananza", meta={"bootstrap": {"source": "bananza.bootstrap"}}),
            SimpleNamespace(id=51, owner_user_id=1, name="bananza", meta={"bootstrap": {"source": "bananza.bootstrap"}}),
        ]
        service.db.execute = AsyncMock(return_value=result)

        async with _client(app) as c:
            response = await c.get("/api/v1/game/worlds?offset=0&limit=100")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["worlds"][0]["id"] == 51

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

    @pytest.mark.asyncio
    async def test_create_world_returns_existing_when_upsert_key_matches(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()
        service.get_world_by_owner_and_upsert_key = AsyncMock(
            return_value=SimpleNamespace(
                id=77,
                owner_user_id=1,
                name="Bananza",
                meta={"project_world_upsert_key": "bananza.world"},
            )
        )
        service.get_world_state = AsyncMock(return_value=SimpleNamespace(world_time=12.5))

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/",
                json={
                    "name": "Bananza",
                    "meta": {},
                    "upsert_key": "bananza.world",
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 77
        assert body["name"] == "Bananza"
        service.create_world.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_world_persists_upsert_key_on_new_world(self):
        app = _app(authenticated=True)
        service = app.dependency_overrides[get_game_world_service]()
        service.get_world_by_owner_and_upsert_key = AsyncMock(return_value=None)
        service.create_world = AsyncMock(
            return_value=SimpleNamespace(
                id=78,
                owner_user_id=1,
                name="Bananza",
                meta={"project_world_upsert_key": "bananza.world"},
            )
        )

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/",
                json={
                    "name": "Bananza",
                    "meta": {"seed": True},
                    "upsert_key": "bananza.world",
                },
            )

        assert response.status_code == 200
        kwargs = service.create_world.await_args.kwargs
        assert kwargs["meta"]["seed"] is True
        assert kwargs["meta"]["project_world_upsert_key"] == "bananza.world"

    @pytest.mark.asyncio
    async def test_create_world_rejects_meta_upsert_key_mismatch(self):
        app = _app(authenticated=True)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/",
                json={
                    "name": "Bananza",
                    "meta": {"project_world_upsert_key": "one"},
                    "upsert_key": "two",
                },
            )

        assert response.status_code == 400
        assert response.json()["detail"] == "world_upsert_key_mismatch"
        service = app.dependency_overrides[get_game_world_service]()
        service.create_world.assert_not_awaited()


    @pytest.mark.asyncio
    async def test_list_saved_projects_success(self):
        app = _app(authenticated=True)
        saved = SimpleNamespace(
            id=7,
            name="World Snapshot",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.list_projects",
            new=AsyncMock(return_value=[saved]),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/game/worlds/projects/snapshots")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 1
        assert body[0]["id"] == 7
        assert body[0]["name"] == "World Snapshot"

    @pytest.mark.asyncio
    async def test_get_saved_project_success(self):
        app = _app(authenticated=True)
        saved = SimpleNamespace(
            id=7,
            name="World Snapshot",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_project",
            new=AsyncMock(return_value=saved),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/game/worlds/projects/snapshots/7")

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 7
        assert body["bundle"]["schema_version"] == 1

    @pytest.mark.asyncio
    async def test_get_saved_project_not_found(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_project",
            new=AsyncMock(return_value=None),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/game/worlds/projects/snapshots/999")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_save_project_snapshot_success(self):
        app = _app(authenticated=True)
        saved = SimpleNamespace(
            id=11,
            name="My Project",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.save_project",
            new=AsyncMock(return_value=saved),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/game/worlds/projects/snapshots",
                    json={
                        "name": "My Project",
                        "source_world_id": 1,
                        "bundle": _bundle_payload(),
                    },
                )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 11
        assert body["name"] == "My Project"

    @pytest.mark.asyncio
    async def test_save_project_snapshot_auto_overwrites_by_provenance_source_key(self):
        app = _app(authenticated=True)
        existing = SimpleNamespace(id=44)
        saved = SimpleNamespace(
            id=44,
            name="My Project",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_latest_project_by_origin_source_key",
            new=AsyncMock(return_value=existing),
        ) as mock_by_source_key, patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_latest_project_by_name",
            new=AsyncMock(return_value=None),
        ), patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.save_project",
            new=AsyncMock(return_value=saved),
        ) as mock_save:
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/game/worlds/projects/snapshots",
                    json={
                        "name": "My Project",
                        "source_world_id": 1,
                        "bundle": _bundle_payload(),
                        "provenance": {
                            "kind": "seed",
                            "source_key": "bananza.seed.v1",
                        },
                    },
                )

        assert response.status_code == 200
        assert mock_by_source_key.await_args.kwargs["source_key"] == "bananza.seed.v1"
        assert mock_save.await_args.kwargs["overwrite_project_id"] == 44

    @pytest.mark.asyncio
    async def test_save_project_snapshot_can_upsert_by_name(self):
        app = _app(authenticated=True)
        existing = SimpleNamespace(id=19)
        saved = SimpleNamespace(
            id=19,
            name="My Project",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_latest_project_by_origin_source_key",
            new=AsyncMock(return_value=None),
        ), patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_latest_project_by_name",
            new=AsyncMock(return_value=existing),
        ) as mock_by_name, patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.save_project",
            new=AsyncMock(return_value=saved),
        ) as mock_save:
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/game/worlds/projects/snapshots",
                    json={
                        "name": "My Project",
                        "source_world_id": 1,
                        "bundle": _bundle_payload(),
                        "upsert_by_name": True,
                    },
                )

        assert response.status_code == 200
        assert mock_by_name.await_args.kwargs["name"] == "My Project"
        assert mock_save.await_args.kwargs["overwrite_project_id"] == 19


    @pytest.mark.asyncio
    async def test_rename_saved_project_success(self):
        app = _app(authenticated=True)
        renamed = SimpleNamespace(
            id=11,
            name="Renamed Project",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.rename_project",
            new=AsyncMock(return_value=renamed),
        ):
            async with _client(app) as c:
                response = await c.patch(
                    "/api/v1/game/worlds/projects/snapshots/11",
                    json={"name": "Renamed Project"},
                )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 11
        assert body["name"] == "Renamed Project"

    @pytest.mark.asyncio
    async def test_duplicate_saved_project_success(self):
        app = _app(authenticated=True)
        duplicated = SimpleNamespace(
            id=12,
            name="Copied Project",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.duplicate_project",
            new=AsyncMock(return_value=duplicated),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/game/worlds/projects/snapshots/11/duplicate",
                    json={"name": "Copied Project"},
                )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 12
        assert body["name"] == "Copied Project"

    @pytest.mark.asyncio
    async def test_delete_saved_project_success(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.delete_project",
            new=AsyncMock(return_value=True),
        ):
            async with _client(app) as c:
                response = await c.delete("/api/v1/game/worlds/projects/snapshots/11")

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_saved_project_not_found(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.delete_project",
            new=AsyncMock(return_value=False),
        ):
            async with _client(app) as c:
                response = await c.delete("/api/v1/game/worlds/projects/snapshots/999")

        assert response.status_code == 404

    # ── Draft endpoints ──────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_upsert_draft_creates_new(self):
        app = _app(authenticated=True)
        draft = SimpleNamespace(
            id=20,
            draft_source_project_id=None,
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.upsert_draft",
            new=AsyncMock(return_value=draft),
        ):
            async with _client(app) as c:
                response = await c.put(
                    "/api/v1/game/worlds/projects/drafts",
                    json={
                        "bundle": _bundle_payload(),
                        "source_world_id": 1,
                    },
                )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 20

    @pytest.mark.asyncio
    async def test_upsert_draft_overwrites_existing(self):
        app = _app(authenticated=True)
        draft = SimpleNamespace(
            id=20,
            draft_source_project_id=5,
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.upsert_draft",
            new=AsyncMock(return_value=draft),
        ):
            async with _client(app) as c:
                response = await c.put(
                    "/api/v1/game/worlds/projects/drafts",
                    json={
                        "bundle": _bundle_payload(),
                        "source_world_id": 1,
                        "draft_source_project_id": 5,
                    },
                )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 20
        assert body["draft_source_project_id"] == 5

    @pytest.mark.asyncio
    async def test_get_draft_returns_detail(self):
        app = _app(authenticated=True)
        draft = SimpleNamespace(
            id=20,
            name="[draft]",
            draft_source_project_id=5,
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_latest_draft",
            new=AsyncMock(return_value=draft),
        ):
            async with _client(app) as c:
                response = await c.get(
                    "/api/v1/game/worlds/projects/drafts?draft_source_project_id=5"
                )

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == 20
        assert body["bundle"]["schema_version"] == 1

    @pytest.mark.asyncio
    async def test_get_draft_returns_null_when_none(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.get_latest_draft",
            new=AsyncMock(return_value=None),
        ):
            async with _client(app) as c:
                response = await c.get(
                    "/api/v1/game/worlds/projects/drafts?draft_source_project_id=999"
                )

        assert response.status_code == 200
        assert response.json() is None

    @pytest.mark.asyncio
    async def test_delete_draft_success(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.delete_draft",
            new=AsyncMock(return_value=True),
        ):
            async with _client(app) as c:
                response = await c.delete(
                    "/api/v1/game/worlds/projects/drafts?draft_source_project_id=5"
                )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_draft_not_found(self):
        app = _app(authenticated=True)

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.delete_draft",
            new=AsyncMock(return_value=False),
        ):
            async with _client(app) as c:
                response = await c.delete(
                    "/api/v1/game/worlds/projects/drafts?draft_source_project_id=999"
                )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_projects_excludes_drafts(self):
        """list_projects passes through to service which now filters is_draft=False."""
        app = _app(authenticated=True)
        saved = SimpleNamespace(
            id=7,
            name="World Snapshot",
            source_world_id=1,
            schema_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            bundle=_bundle_payload(),
        )

        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.GameProjectStorageService.list_projects",
            new=AsyncMock(return_value=[saved]),
        ) as mock_list:
            async with _client(app) as c:
                response = await c.get("/api/v1/game/worlds/projects/snapshots")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["name"] == "World Snapshot"
