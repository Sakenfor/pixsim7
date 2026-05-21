"""
API tests for auth session/introspection endpoints.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api import dependencies
    from pixsim7.backend.main.api.dependencies import get_auth_service
    from pixsim7.backend.main.api.v1.auth import router
    from pixsim7.backend.main.shared.errors import (
        AuthenticationError,
        ResourceNotFoundError,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _principal(user_id: int = 1):
    return SimpleNamespace(id=user_id)


def _session(
    *,
    session_id: int = 1,
    user_id: int = 1,
):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=session_id,
        user_id=user_id,
        token_jti=f"jti-{session_id}",
        ip_address="127.0.0.1",
        user_agent="pytest-agent/1.0",
        client_id="client-1",
        client_type="web_app",
        client_name="PixSim Web",
        last_active_at=now,
        expires_at=now + timedelta(hours=8),
        is_revoked=False,
        created_at=now - timedelta(hours=1),
    )


def _app(*, auth_service, principal=None) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_auth_service] = lambda: auth_service
    if principal is not None:
        app.dependency_overrides[dependencies.get_current_principal] = lambda: principal
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAuthIntrospectEndpoint:
    @pytest.mark.asyncio
    async def test_introspect_success_with_body_token(self):
        exp = int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "verify_token_claims": AsyncMock(
                    return_value={
                        "sub": "1",
                        "jti": "abc123",
                        "email": "user@example.com",
                        "username": "user",
                        "role": "user",
                        "is_admin": False,
                        "permissions": ["read"],
                        "is_active": True,
                        "exp": exp,
                    }
                )
            },
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/introspect",
                json={"token": "jwt-token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["active"] is True
        assert body["claims"]["sub"] == "1"
        assert body["claims"]["jti"] == "abc123"
        auth_service.verify_token_claims.assert_awaited_once_with(
            "jwt-token",
            update_last_used=False,
            use_cache=True,
        )

    @pytest.mark.asyncio
    async def test_introspect_uses_authorization_header_when_body_empty(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "verify_token_claims": AsyncMock(
                    return_value={
                        "sub": "2",
                        "jti": "jti-2",
                        "is_admin": False,
                        "permissions": [],
                        "is_active": True,
                    }
                )
            },
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/introspect",
                json={},
                headers={"Authorization": "Bearer header-token"},
            )

        assert response.status_code == 200
        assert response.json()["active"] is True
        auth_service.verify_token_claims.assert_awaited_once_with(
            "header-token",
            update_last_used=False,
            use_cache=True,
        )

    @pytest.mark.asyncio
    async def test_introspect_requires_token(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"verify_token_claims": AsyncMock()},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post("/api/v1/auth/introspect", json={})

        assert response.status_code == 400
        assert "token is required" in response.json()["detail"]
        auth_service.verify_token_claims.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_introspect_maps_authentication_error_to_inactive_response(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "verify_token_claims": AsyncMock(
                    side_effect=AuthenticationError("Invalid or expired token")
                )
            },
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/introspect",
                json={"token": "bad-token"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["active"] is False
        assert body["error"] == "Invalid or expired token"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAuthLogoutEndpoints:
    @pytest.mark.asyncio
    async def test_logout_with_bearer_token_calls_service(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"logout": AsyncMock()},
        )()
        app = _app(auth_service=auth_service, principal=_principal())

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/logout",
                headers={"Authorization": "Bearer jwt-token"},
            )

        assert response.status_code == 204
        auth_service.logout.assert_awaited_once_with("jwt-token")

    @pytest.mark.asyncio
    async def test_logout_without_authorization_header_skips_revoke(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"logout": AsyncMock()},
        )()
        app = _app(auth_service=auth_service, principal=_principal())

        async with _client(app) as client:
            response = await client.post("/api/v1/auth/logout")

        assert response.status_code == 204
        auth_service.logout.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_logout_ignores_missing_session(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "logout": AsyncMock(
                    side_effect=ResourceNotFoundError("Session", "token-jti")
                )
            },
        )()
        app = _app(auth_service=auth_service, principal=_principal())

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/logout",
                headers={"Authorization": "Bearer stale-token"},
            )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_logout_all_success(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"logout_all": AsyncMock(return_value=3)},
        )()
        app = _app(auth_service=auth_service, principal=_principal(user_id=42))

        async with _client(app) as client:
            response = await client.post("/api/v1/auth/logout-all")

        assert response.status_code == 200
        assert response.json() == {"message": "Logged out from 3 sessions"}
        auth_service.logout_all.assert_awaited_once_with(42)


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAuthSessionsEndpoints:
    @pytest.mark.asyncio
    async def test_get_sessions_returns_serialized_sessions(self):
        sessions = [_session(session_id=1), _session(session_id=2)]
        auth_service = type(
            "AuthServiceStub",
            (),
            {"get_user_sessions": AsyncMock(return_value=sessions)},
        )()
        app = _app(auth_service=auth_service, principal=_principal(user_id=9))

        async with _client(app) as client:
            response = await client.get("/api/v1/auth/sessions", params={"active_only": "false"})

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["id"] == 1
        assert body[1]["id"] == 2
        auth_service.get_user_sessions.assert_awaited_once_with(
            user_id=9,
            active_only=False,
        )

    @pytest.mark.asyncio
    async def test_revoke_session_success(self):
        target = _session(session_id=10, user_id=7)
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "get_user_sessions": AsyncMock(return_value=[target]),
                "revoke_session": AsyncMock(),
            },
        )()
        app = _app(auth_service=auth_service, principal=_principal(user_id=7))

        async with _client(app) as client:
            response = await client.delete("/api/v1/auth/sessions/10")

        assert response.status_code == 204
        auth_service.get_user_sessions.assert_awaited_once_with(7, active_only=False)
        auth_service.revoke_session.assert_awaited_once_with(10, reason="user_revocation")

    @pytest.mark.asyncio
    async def test_revoke_session_returns_404_when_not_found(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "get_user_sessions": AsyncMock(return_value=[]),
                "revoke_session": AsyncMock(),
            },
        )()
        app = _app(auth_service=auth_service, principal=_principal(user_id=7))

        async with _client(app) as client:
            response = await client.delete("/api/v1/auth/sessions/999")

        assert response.status_code == 404
        assert response.json()["detail"] == "Session not found"
        auth_service.revoke_session.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_revoke_session_returns_403_for_other_user_session(self):
        target = _session(session_id=10, user_id=99)
        auth_service = type(
            "AuthServiceStub",
            (),
            {
                "get_user_sessions": AsyncMock(return_value=[target]),
                "revoke_session": AsyncMock(),
            },
        )()
        app = _app(auth_service=auth_service, principal=_principal(user_id=7))

        async with _client(app) as client:
            response = await client.delete("/api/v1/auth/sessions/10")

        assert response.status_code == 403
        assert response.json()["detail"] == "Cannot revoke other user's session"
        auth_service.revoke_session.assert_not_awaited()
