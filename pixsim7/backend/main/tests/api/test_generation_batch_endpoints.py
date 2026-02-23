"""
API tests for generation batch manifest endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_database,
        get_generation_gateway,
    )
    from pixsim7.backend.main.api.v1.generations import router
    from pixsim7.backend.main.domain.generation.models import GenerationBatchItemManifest
    from pixsim7.backend.main.domain.user import User

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _ScalarOneResult:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return list(self._rows)


class _ScalarList:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _ScalarListResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarList(self._values)


def _mock_user(user_id: int = 42):
    user = MagicMock(spec=User)
    user.id = user_id
    return user


def _gateway_stub():
    return SimpleNamespace(
        proxy=AsyncMock(return_value=SimpleNamespace(called=False, data=None)),
        local=SimpleNamespace(),
    )


def _app(db, *, user_id: int = 42):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: _mock_user(user_id)
    app.dependency_overrides[get_generation_gateway] = _gateway_stub
    app.dependency_overrides[get_database] = lambda: db
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGenerationBatchEndpoints:
    @pytest.mark.asyncio
    async def test_list_generation_batches(self):
        batch_id = uuid4()
        created_at = datetime(2026, 2, 21, 12, 0, 0, tzinfo=timezone.utc)
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    _ScalarOneResult(1),
                    _RowsResult([(batch_id, created_at, 3, 0, 2)]),
                ]
            )
        )
        app = _app(db)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-batches?limit=20&offset=0")

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["limit"] == 20
        assert payload["offset"] == 0
        assert len(payload["batches"]) == 1
        assert payload["batches"][0]["batch_id"] == str(batch_id)
        assert payload["batches"][0]["item_count"] == 3
        assert payload["batches"][0]["first_item_index"] == 0
        assert payload["batches"][0]["last_item_index"] == 2

    @pytest.mark.asyncio
    async def test_get_generation_batch_details(self):
        batch_id = uuid4()
        created_1 = datetime(2026, 2, 21, 12, 0, 0, tzinfo=timezone.utc)
        created_2 = datetime(2026, 2, 21, 12, 0, 2, tzinfo=timezone.utc)
        m1 = GenerationBatchItemManifest(
            asset_id=10,
            batch_id=batch_id,
            item_index=0,
            generation_id=100,
            selected_block_ids=["blk-1"],
            slot_results=[{"slot_key": "subject", "selected": True}],
            assembled_prompt="first prompt",
            manifest_metadata={
                "mode": "quickgen_each",
                "strategy": "each",
                "input_asset_ids": [1, 2],
            },
            created_at=created_1,
        )
        m2 = GenerationBatchItemManifest(
            asset_id=11,
            batch_id=batch_id,
            item_index=1,
            generation_id=101,
            selected_block_ids=["blk-2"],
            slot_results=[{"slot_key": "style", "selected": True}],
            assembled_prompt="second prompt",
            manifest_metadata={
                "mode": "quickgen_each",
                "strategy": "each",
                "input_asset_ids": [3],
            },
            created_at=created_2,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ScalarListResult([m1, m2]))
        )
        app = _app(db)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-batches/{batch_id}")

        assert response.status_code == 200
        payload = response.json()
        assert payload["batch"]["batch_id"] == str(batch_id)
        assert payload["batch"]["item_count"] == 2
        assert payload["batch"]["first_item_index"] == 0
        assert payload["batch"]["last_item_index"] == 1
        assert len(payload["items"]) == 2
        assert payload["items"][0]["asset_id"] == 10
        assert payload["items"][0]["mode"] == "quickgen_each"
        assert payload["items"][0]["strategy"] == "each"
        assert payload["items"][0]["input_asset_ids"] == [1, 2]
