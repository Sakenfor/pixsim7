"""API regression tests for generation chains auth/scoping and filters."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_current_user, get_db
    from pixsim7.backend.main.api.v1 import generation_chains as generation_chains_api
    from pixsim7.backend.main.api.v1.generation_chains import router
    from pixsim7.backend.main.domain.generation.chain import ChainExecution, GenerationChain
    from pixsim7.backend.main.domain.user import User

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


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


def _mock_user(user_id: int = 42, *, is_admin: bool = False):
    user = MagicMock(spec=User)
    user.id = user_id
    user.is_admin = MagicMock(return_value=is_admin)
    return user


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def _app(db, *, user_id: int = 42, is_admin: bool = False):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: _mock_user(user_id, is_admin=is_admin)
    app.dependency_overrides[get_db] = lambda: db
    return app


def _chain(*, owner_id: int, is_public: bool = False) -> GenerationChain:
    now = datetime.now(timezone.utc)
    return GenerationChain(
        id=uuid4(),
        name="Test Chain",
        description="test",
        steps=[{"id": "s1", "template_id": str(uuid4())}],
        tags=["alpha", "beta"],
        chain_metadata={},
        is_public=is_public,
        created_by=str(owner_id),
        execution_count=0,
        created_at=now,
        updated_at=now,
    )


def _execution(*, chain_id, user_id: int) -> ChainExecution:
    now = datetime.now(timezone.utc)
    return ChainExecution(
        id=uuid4(),
        chain_id=chain_id,
        steps_snapshot=[{"id": "s1"}],
        step_states=[{"step_id": "s1", "status": "pending"}],
        status="pending",
        current_step_index=0,
        error_message=None,
        user_id=user_id,
        execution_metadata={},
        created_at=now,
        started_at=None,
        completed_at=None,
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGenerationChainsApiAccess:
    @pytest.mark.asyncio
    async def test_get_chain_forbidden_for_private_non_owner(self):
        chain = _chain(owner_id=999, is_public=False)
        db = SimpleNamespace(get=AsyncMock(return_value=chain))
        app = _app(db, user_id=42)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-chains/{chain.id}")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_get_chain_allows_public_chain_for_non_owner(self):
        chain = _chain(owner_id=999, is_public=True)
        db = SimpleNamespace(get=AsyncMock(return_value=chain))
        app = _app(db, user_id=42)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-chains/{chain.id}")

        assert response.status_code == 200
        assert response.json()["id"] == str(chain.id)

    @pytest.mark.asyncio
    async def test_update_chain_forbidden_for_non_owner(self):
        chain = _chain(owner_id=999, is_public=False)
        db = SimpleNamespace(get=AsyncMock(return_value=chain))
        app = _app(db, user_id=42)

        async with _client(app) as c:
            response = await c.patch(
                f"/api/v1/generation-chains/{chain.id}",
                json={"name": "Changed"},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_get_execution_forbidden_for_different_user(self):
        chain = _chain(owner_id=999, is_public=True)
        execution = _execution(chain_id=chain.id, user_id=999)
        db = SimpleNamespace(get=AsyncMock(return_value=execution))
        app = _app(db, user_id=42)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-chains/executions/{execution.id}")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_execute_chain_forbidden_for_private_non_owner(self):
        chain = _chain(owner_id=999, is_public=False)
        db = SimpleNamespace(get=AsyncMock(return_value=chain))
        app = _app(db, user_id=42)

        async with _client(app) as c:
            response = await c.post(
                f"/api/v1/generation-chains/{chain.id}/execute",
                json={"provider_id": "pixverse"},
            )

        assert response.status_code == 403


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGenerationChainsExecuteDefaults:
    @pytest.mark.asyncio
    async def test_execute_chain_uses_canonical_default_operation(self, monkeypatch):
        chain = _chain(owner_id=42, is_public=False)
        db = SimpleNamespace(
            get=AsyncMock(return_value=chain),
            add=MagicMock(),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )
        app = _app(db, user_id=42)

        captured = {}

        async def _background_stub(chain_id, execution_id, user_id, request):
            captured["chain_id"] = chain_id
            captured["execution_id"] = execution_id
            captured["user_id"] = user_id
            captured["default_operation"] = request.default_operation

        monkeypatch.setattr(generation_chains_api, "_run_chain_background", _background_stub)

        async with _client(app) as c:
            response = await c.post(
                f"/api/v1/generation-chains/{chain.id}/execute",
                json={"provider_id": "pixverse"},
            )

        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["status"] == "pending"
        assert captured["chain_id"] == chain.id
        assert captured["user_id"] == 42
        assert captured["default_operation"] == "text_to_image"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGenerationChainsListQueryShape:
    @pytest.mark.asyncio
    async def test_list_chains_applies_user_scope_and_tag_filter(self):
        captured = {}

        def _execute(stmt):
            captured["stmt"] = stmt
            return _ScalarListResult([])

        db = SimpleNamespace(execute=AsyncMock(side_effect=_execute))
        app = _app(db, user_id=42, is_admin=False)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-chains?tag=alpha&limit=10&offset=0")

        assert response.status_code == 200
        stmt = captured.get("stmt")
        assert stmt is not None
        sql = str(stmt)
        # Non-admin list should be scoped to public OR owned and include tag filtering.
        assert "generation_chains.is_public" in sql
        assert "generation_chains.created_by" in sql
        assert "generation_chains.tags" in sql
