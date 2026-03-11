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
        get_database,
        get_game_world_service,
    )
    from pixsim7.backend.main.api.v1.game_behavior import router
    from pixsim7.backend.main.domain.game.core.models import GameNPC, GameSession

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _make_world(*, owner_user_id: int = 1, meta: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        owner_user_id=owner_user_id,
        meta=deepcopy(meta) if meta is not None else {},
    )


class _FakeDb:
    def __init__(
        self,
        *,
        sessions: dict[int, SimpleNamespace] | None = None,
        npcs: dict[int, SimpleNamespace] | None = None,
    ) -> None:
        self._sessions = sessions or {}
        self._npcs = npcs or {}

    async def get(self, model, entity_id):
        if model is GameSession:
            return self._sessions.get(entity_id)
        if model is GameNPC:
            return self._npcs.get(entity_id)
        return None


def _app(
    world: SimpleNamespace | None,
    db: _FakeDb,
    *,
    principal_id: int = 1,
):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/worlds")

    service = SimpleNamespace()
    service.get_world = AsyncMock(return_value=world)

    app.dependency_overrides[get_game_world_service] = lambda: service
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_current_game_principal] = lambda: SimpleNamespace(
        id=principal_id,
        is_active=True,
    )

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameBehaviorPreviewActivityEndpoint:
    @pytest.mark.asyncio
    async def test_preview_activity_selection_returns_real_scored_result(self):
        world = _make_world(
            meta={
                "behavior": {
                    "version": 1,
                    "activities": {
                        "activity:work_office": {
                            "id": "activity:work_office",
                            "category": "work",
                            "requirements": {},
                        }
                    },
                }
            }
        )

        session = SimpleNamespace(
            id=11,
            world_id=1,
            world_time=120.0,
            flags={
                "npcs": {
                    "npc:7": {
                        "state": {"energy": 55, "moodState": {"valence": 0, "arousal": 0, "tags": ["neutral"]}},
                        "preferences": {},
                    }
                }
            },
            relationships={},
        )
        npc = SimpleNamespace(id=7, world_id=1, personality={})

        app = _app(world, _FakeDb(sessions={11: session}, npcs={7: npc}))

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/1/behavior/preview-activity",
                json={
                    "npc_id": 7,
                    "session_id": 11,
                    "candidate_activity_ids": ["activity:work_office"],
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["selected_activity_id"] == "activity:work_office"
        assert "activity:work_office" in body["scores"]
        assert body["scores"]["activity:work_office"] > 0
        assert body["npc_state"]["world_time"] == 120.0

    @pytest.mark.asyncio
    async def test_preview_activity_selection_rejects_unknown_candidate_ids(self):
        world = _make_world(
            meta={
                "behavior": {
                    "version": 1,
                    "activities": {
                        "activity:work_office": {
                            "id": "activity:work_office",
                            "category": "work",
                            "requirements": {},
                        }
                    },
                }
            }
        )
        session = SimpleNamespace(id=11, world_id=1, world_time=0.0, flags={"npcs": {"npc:7": {"state": {}}}})
        npc = SimpleNamespace(id=7, world_id=1, personality={})

        app = _app(world, _FakeDb(sessions={11: session}, npcs={7: npc}))

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/1/behavior/preview-activity",
                json={
                    "npc_id": 7,
                    "session_id": 11,
                    "candidate_activity_ids": ["activity:missing"],
                },
            )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["error"] == "unknown_candidate_activities"
        assert detail["missing_activity_ids"] == ["activity:missing"]

    @pytest.mark.asyncio
    async def test_preview_activity_selection_rejects_cross_world_session(self):
        world = _make_world(meta={"behavior": {"version": 1, "activities": {}}})
        session = SimpleNamespace(id=11, world_id=2, world_time=0.0, flags={})
        npc = SimpleNamespace(id=7, world_id=1, personality={})

        app = _app(world, _FakeDb(sessions={11: session}, npcs={7: npc}))

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/worlds/1/behavior/preview-activity",
                json={"npc_id": 7, "session_id": 11},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Session 11 does not belong to world 1"
