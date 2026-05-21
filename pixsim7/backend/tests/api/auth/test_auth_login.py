"""
API tests for auth login endpoint.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api import dependencies
    from pixsim7.backend.main.api.v1 import auth as auth_api
    from pixsim7.backend.main.api.v1.auth import router
    from pixsim7.backend.main.domain.user import User
    from pixsim7.backend.main.shared.errors import AuthenticationError

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _make_user(
    *,
    user_id: int = 1,
    email: str = "user@example.com",
    username: str = "testuser",
    role: str = "user",
) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=user_id,
        email=email,
        username=username,
        password_hash="hash",
        role=role,
        permissions=[],
        is_active=True,
        created_at=now,
        updated_at=now,
        last_login_at=now,
    )


def _app(*, auth_service) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[dependencies.get_auth_service] = lambda: auth_service
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAuthLoginEndpoint:
    @pytest.fixture(autouse=True)
    def _patch_rate_limit(self, monkeypatch):
        limiter = SimpleNamespace(check=AsyncMock(return_value=None))
        monkeypatch.setattr(auth_api, "login_limiter", limiter)
        monkeypatch.setattr(
            auth_api,
            "get_client_identifier",
            AsyncMock(return_value="ip:127.0.0.1"),
        )
        return limiter

    @pytest.mark.asyncio
    async def test_login_success_with_email_forwards_client_metadata(self):
        logged_in_user = _make_user(email="new@example.com", username="newuser")
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock(return_value=(logged_in_user, "jwt-token"))},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": "new@example.com",
                    "password": "supersecret123",
                    "client_id": "client-123",
                    "client_type": "web_app",
                    "client_name": "PixSim Web",
                },
                headers={"user-agent": "pytest-agent/1.0"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["access_token"] == "jwt-token"
        assert payload["token_type"] == "bearer"
        assert payload["user"]["email"] == "new@example.com"
        assert payload["user"]["username"] == "newuser"

        auth_service.login.assert_awaited_once()
        kwargs = auth_service.login.await_args.kwargs
        assert kwargs["email_or_username"] == "new@example.com"
        assert kwargs["password"] == "supersecret123"
        assert kwargs["user_agent"] == "pytest-agent/1.0"
        assert kwargs["client_id"] == "client-123"
        assert kwargs["client_type"] == "web_app"
        assert kwargs["client_name"] == "PixSim Web"
        assert "ip_address" in kwargs

    @pytest.mark.asyncio
    async def test_login_success_with_username(self):
        logged_in_user = _make_user(email="user@example.com", username="newuser")
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock(return_value=(logged_in_user, "jwt-token"))},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "username": "newuser",
                    "password": "supersecret123",
                },
            )

        assert response.status_code == 200
        kwargs = auth_service.login.await_args.kwargs
        assert kwargs["email_or_username"] == "newuser"
        assert kwargs["password"] == "supersecret123"

    @pytest.mark.asyncio
    async def test_login_rejects_missing_email_and_username(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock()},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"password": "supersecret123"},
            )

        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "missing_field"
        auth_service.login.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_login_maps_authentication_error_to_401(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock(side_effect=AuthenticationError("Invalid credentials"))},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": "new@example.com",
                    "password": "wrong-password",
                },
            )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    @pytest.mark.asyncio
    async def test_login_preserves_rate_limit_http_exception(self, monkeypatch):
        limiter = SimpleNamespace(
            check=AsyncMock(
                side_effect=HTTPException(status_code=429, detail="Rate limit exceeded")
            )
        )
        monkeypatch.setattr(auth_api, "login_limiter", limiter)
        monkeypatch.setattr(
            auth_api,
            "get_client_identifier",
            AsyncMock(return_value="ip:127.0.0.1"),
        )

        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock()},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": "new@example.com",
                    "password": "supersecret123",
                },
            )

        assert response.status_code == 429
        assert response.json()["detail"] == "Rate limit exceeded"
        auth_service.login.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_login_returns_500_for_unexpected_errors(self):
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock(side_effect=RuntimeError("database offline"))},
        )()
        app = _app(auth_service=auth_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": "new@example.com",
                    "password": "supersecret123",
                },
            )

        assert response.status_code == 500
        assert response.json()["detail"] == "Login failed: database offline"
