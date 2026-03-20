from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_game_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import game_npcs
    from pixsim7.backend.main.domain.game import GameNPC

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _ScalarResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)


class _ExecuteResult:
    def __init__(self, *, rows=None, scalars=None):
        self._rows = list(rows or [])
        self._scalars = list(scalars or [])

    def all(self):
        return list(self._rows)

    def scalars(self):
        return _ScalarResult(self._scalars)


class _FakeDB:
    def __init__(self):
        self.execute_results = []
        self.get_values = {}
        self.added = []
        self.commit_count = 0
        self._next_id = 100

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
    app.include_router(game_npcs.router, prefix="/api/v1/game/npcs")
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
class TestGameNpcsApi:
    @pytest.mark.asyncio
    async def test_create_npc_supports_query_world_id(self):
        db = _FakeDB()
        db.execute_results = [
            _ExecuteResult(rows=[(11, 5)]),  # location validation
        ]
        app = _app(db)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/npcs/?world_id=5",
                json={
                    "name": "Captain Bananza",
                    "home_location_id": 11,
                    "personality": {"npc_key": "captain"},
                },
            )

        assert response.status_code == 201
        body = response.json()
        assert body["worldId"] == 5
        assert body["name"] == "Captain Bananza"
        assert body["homeLocationId"] == 11
        assert body["personality"]["npc_key"] == "captain"

    @pytest.mark.asyncio
    async def test_replace_schedules_replaces_rows_and_syncs_projection(self, monkeypatch: pytest.MonkeyPatch):
        db = _FakeDB()
        db.get_values[(GameNPC, 7)] = SimpleNamespace(
            id=7,
            world_id=5,
            name="Captain Bananza",
            home_location_id=11,
            personality={},
        )
        db.execute_results = [
            _ExecuteResult(rows=[(11, 5)]),  # location validation
            _ExecuteResult(rows=[]),  # delete schedules
        ]

        sync_mock = AsyncMock()
        monkeypatch.setattr(game_npcs, "sync_npc_schedule_projection", sync_mock)
        app = _app(db)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/game/npcs/7/schedules?world_id=5",
                json={
                    "items": [
                        {
                            "day_of_week": 1,
                            "start_time": 3600,
                            "end_time": 7200,
                            "location_id": 11,
                            "rule": {"label": "Morning shift"},
                        }
                    ]
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["dayOfWeek"] == 1
        assert body["items"][0]["locationId"] == 11
        assert body["items"][0]["rule"]["label"] == "Morning shift"
        sync_mock.assert_awaited_once_with(db, 7)
