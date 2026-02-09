"""
API-level tests for embedding endpoints.

Tests HTTP status code semantics with mocked dependencies.
No real database, no real embedding providers.
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.v1.action_blocks import router
    from pixsim7.backend.main.api.dependencies import (
        get_db, get_current_user, get_current_admin_user,
    )
    from pixsim7.backend.main.domain.user import User
    from pixsim7.backend.main.services.embedding.embedding_service import (
        BlockNotFoundError,
        BlockNotEmbeddedError,
        EmbeddingModelError,
    )
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ===== Helpers =====

def _mock_user(*, admin: bool = False) -> MagicMock:
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "testuser"
    user.role = "admin" if admin else "user"
    user.is_active = True
    user.is_admin.return_value = admin
    return user


def _app(*, authenticated: bool = True, admin: bool = False) -> FastAPI:
    """Minimal test app with action_blocks router and dependency overrides."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    app.dependency_overrides[get_db] = lambda: AsyncMock()

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")
        app.dependency_overrides[get_current_user] = _deny
    else:
        user = _mock_user(admin=admin)
        app.dependency_overrides[get_current_user] = lambda: user
        if admin:
            app.dependency_overrides[get_current_admin_user] = lambda: user

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


# ===== GET /action-blocks/{id}/similar =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestFindSimilar:

    @pytest.mark.asyncio
    async def test_404_when_block_missing(self):
        app = _app()
        bid = uuid4()

        with patch("pixsim7.backend.main.services.embedding.EmbeddingService") as Cls:
            Cls.return_value.find_similar = AsyncMock(
                side_effect=BlockNotFoundError("not found")
            )
            async with _client(app) as c:
                r = await c.get(f"/api/v1/action-blocks/{bid}/similar")

        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_422_when_block_not_embedded(self):
        app = _app()
        bid = uuid4()

        with patch("pixsim7.backend.main.services.embedding.EmbeddingService") as Cls:
            Cls.return_value.find_similar = AsyncMock(
                side_effect=BlockNotEmbeddedError("no embedding")
            )
            async with _client(app) as c:
                r = await c.get(f"/api/v1/action-blocks/{bid}/similar")

        assert r.status_code == 422


# ===== POST /action-blocks/{id}/embed =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestEmbedBlock:

    @pytest.mark.asyncio
    async def test_400_for_unknown_model(self):
        app = _app(admin=True)
        bid = uuid4()

        with patch("pixsim7.backend.main.services.embedding.EmbeddingService") as Cls:
            Cls.return_value.embed_block = AsyncMock(
                side_effect=EmbeddingModelError("model not found")
            )
            async with _client(app) as c:
                r = await c.post(f"/api/v1/action-blocks/{bid}/embed")

        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_403_for_non_admin(self):
        """Non-admin user should be rejected by CurrentAdminUser gate."""
        app = _app(authenticated=True, admin=False)
        bid = uuid4()

        async with _client(app) as c:
            r = await c.post(f"/api/v1/action-blocks/{bid}/embed")

        assert r.status_code == 403


# ===== POST /action-blocks/similar/by-text =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestSimilarByText:

    @pytest.mark.asyncio
    async def test_401_when_unauthenticated(self):
        app = _app(authenticated=False)

        async with _client(app) as c:
            r = await c.post(
                "/api/v1/action-blocks/similar/by-text",
                json={"text": "woman walking"},
            )

        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_400_for_unknown_model(self):
        app = _app(authenticated=True)

        with patch("pixsim7.backend.main.services.embedding.EmbeddingService") as Cls:
            Cls.return_value.find_similar_by_text = AsyncMock(
                side_effect=EmbeddingModelError("model not found")
            )
            async with _client(app) as c:
                r = await c.post(
                    "/api/v1/action-blocks/similar/by-text",
                    json={"text": "woman walking"},
                )

        assert r.status_code == 400
