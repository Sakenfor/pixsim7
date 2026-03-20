from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_asset_service,
        get_current_game_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import game_scenes
    from pixsim7.backend.main.domain.game import GameScene

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _FakeDB:
    def __init__(self):
        self.added = []
        self.commit_count = 0
        self._next_scene_id = 320

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if isinstance(obj, GameScene) and getattr(obj, "id", None) is None:
                self._next_scene_id += 1
                obj.id = self._next_scene_id

    async def commit(self):
        self.commit_count += 1


def _app(db: _FakeDB):
    app = FastAPI()
    app.include_router(game_scenes.router, prefix="/api/v1/game/scenes")
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_asset_service] = lambda: SimpleNamespace()
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
class TestGameScenesAuthoring:
    @pytest.mark.asyncio
    async def test_create_scene_supports_query_world_id(self, monkeypatch: pytest.MonkeyPatch):
        db = _FakeDB()
        scene = GameScene(id=321, world_id=9, title="Dock Intro", description=None, meta={})

        replace_mock = AsyncMock()
        load_mock = AsyncMock(side_effect=[scene, scene])
        sync_mock = AsyncMock()
        build_mock = AsyncMock(
            return_value=game_scenes.SceneResponse(
                id="321",
                title="Dock Intro",
                nodes=[],
                edges=[],
                startNodeId="1",
            )
        )

        monkeypatch.setattr(game_scenes, "_replace_scene_graph", replace_mock)
        monkeypatch.setattr(game_scenes, "_load_scene_or_404", load_mock)
        monkeypatch.setattr(game_scenes, "sync_scene_graph_projection", sync_mock)
        monkeypatch.setattr(game_scenes, "_build_scene_response", build_mock)

        app = _app(db)
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/scenes/?world_id=9",
                json={
                    "title": "Dock Intro",
                    "nodes": [
                        {"id": "start", "asset_id": 101, "label": "Start"}
                    ],
                    "edges": [],
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["id"] == "321"
        replace_mock.assert_awaited_once()
        sync_mock.assert_awaited_once_with(db, 321)

    @pytest.mark.asyncio
    async def test_replace_scene_query_world_id_takes_precedence(self, monkeypatch: pytest.MonkeyPatch):
        db = _FakeDB()
        scene = GameScene(id=12, world_id=1, title="Old", description=None, meta={})

        replace_mock = AsyncMock()
        load_mock = AsyncMock(side_effect=[scene, scene, scene])
        sync_mock = AsyncMock()
        build_mock = AsyncMock(
            return_value=game_scenes.SceneResponse(
                id="12",
                title="New Scene",
                nodes=[],
                edges=[],
                startNodeId="1",
            )
        )

        monkeypatch.setattr(game_scenes, "_replace_scene_graph", replace_mock)
        monkeypatch.setattr(game_scenes, "_load_scene_or_404", load_mock)
        monkeypatch.setattr(game_scenes, "sync_scene_graph_projection", sync_mock)
        monkeypatch.setattr(game_scenes, "_build_scene_response", build_mock)

        app = _app(db)
        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/scenes/12?world_id=4",
                json={
                    "world_id": 99,
                    "title": "New Scene",
                    "nodes": [
                        {"id": "start", "asset_id": 101, "label": "Start"}
                    ],
                    "edges": [],
                },
            )

        assert response.status_code == 200
        assert scene.world_id == 4
        replace_mock.assert_awaited_once()
        sync_mock.assert_awaited_once_with(db, 12)
