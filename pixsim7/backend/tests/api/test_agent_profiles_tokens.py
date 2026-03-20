from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.agent_profiles import router as agent_profiles_router
    from pixsim7.backend.main.domain import UserSession
    from pixsim7.backend.main.shared.actor import RequestPrincipal
    from pixsim7.backend.main.shared.auth import decode_access_token

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _principal() -> RequestPrincipal:
    return RequestPrincipal(
        id=1,
        principal_type="user",
        role="admin",
        admin=True,
        username="admin",
        display_name="Admin User",
        email="admin@test.local",
        permissions=[],
    )


class _FakeDb:
    def __init__(self):
        self.added = []
        self.commit = AsyncMock()
        self.profile = SimpleNamespace(
            id="assistant:code-helper",
            user_id=1,
            status="active",
            agent_type="assistant",
            default_scopes=[],
        )

    async def get(self, model, profile_id):
        if profile_id == self.profile.id:
            return self.profile
        return None

    def add(self, obj):
        self.added.append(obj)


def _app():
    app = FastAPI()
    app.include_router(agent_profiles_router, prefix="/api/v1")
    fake_db = _FakeDb()

    async def _db():
        yield fake_db

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = _principal
    app.state.test_db = fake_db
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAgentProfileTokenMinting:
    @pytest.mark.asyncio
    async def test_mint_profile_token_persists_user_session(self):
        app = _app()

        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/dev/agent-profiles/assistant:code-helper/token?hours=24&scope=dev"
            )

        assert resp.status_code == 200
        body = resp.json()
        claims = decode_access_token(body["access_token"])
        token_jti = claims["jti"]

        added_sessions = [obj for obj in app.state.test_db.added if isinstance(obj, UserSession)]
        assert len(added_sessions) == 1
        persisted = added_sessions[0]
        assert persisted.user_id == 1
        assert persisted.token_id == token_jti
        app.state.test_db.commit.assert_awaited_once()
