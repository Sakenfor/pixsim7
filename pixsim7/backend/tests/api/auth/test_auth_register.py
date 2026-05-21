"""
API tests for auth registration endpoint.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import get_auth_service, get_user_service
    from pixsim7.backend.main.api.v1.auth import router
    from pixsim7.backend.main.domain.user import User
    from pixsim7.backend.main.shared.errors import ValidationError as DomainValidationError

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _make_user(
    *,
    user_id: int = 1,
    email: str = "new@example.com",
    username: str = "newuser",
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


def _app(*, auth_service, user_service) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_auth_service] = lambda: auth_service
    app.dependency_overrides[get_user_service] = lambda: user_service
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAuthRegisterEndpoint:
    @pytest.mark.asyncio
    async def test_register_success_creates_user_and_returns_login_payload(self):
        created_user = _make_user()
        logged_in_user = _make_user()

        user_service = type(
            "UserServiceStub",
            (),
            {"create_user": AsyncMock(return_value=created_user)},
        )()
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock(return_value=(logged_in_user, "jwt-token"))},
        )()

        app = _app(auth_service=auth_service, user_service=user_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "new@example.com",
                    "username": "newuser",
                    "password": "supersecret123",
                },
                headers={"user-agent": "pytest-agent/1.0"},
            )

        assert response.status_code == 201
        payload = response.json()
        assert payload["access_token"] == "jwt-token"
        assert payload["token_type"] == "bearer"
        assert payload["user"]["email"] == "new@example.com"
        assert payload["user"]["username"] == "newuser"

        user_service.create_user.assert_awaited_once_with(
            email="new@example.com",
            username="newuser",
            password="supersecret123",
            role="user",
        )

        auth_service.login.assert_awaited_once()
        kwargs = auth_service.login.await_args.kwargs
        assert kwargs["email_or_username"] == "new@example.com"
        assert kwargs["password"] == "supersecret123"
        assert kwargs["user_agent"] == "pytest-agent/1.0"
        assert "ip_address" in kwargs

    @pytest.mark.asyncio
    async def test_register_rejects_invalid_payload(self):
        user_service = type(
            "UserServiceStub",
            (),
            {"create_user": AsyncMock()},
        )()
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock()},
        )()

        app = _app(auth_service=auth_service, user_service=user_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "invalid-email",
                    "username": "ab",
                    "password": "short",
                },
            )

        assert response.status_code == 422
        user_service.create_user.assert_not_awaited()
        auth_service.login.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_register_maps_domain_validation_error_to_400(self):
        user_service = type(
            "UserServiceStub",
            (),
            {
                "create_user": AsyncMock(
                    side_effect=DomainValidationError("email", "already exists")
                )
            },
        )()
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock()},
        )()

        app = _app(auth_service=auth_service, user_service=user_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "new@example.com",
                    "username": "newuser",
                    "password": "supersecret123",
                },
            )

        assert response.status_code == 400
        assert response.json()["detail"] == "Validation error on 'email': already exists"
        auth_service.login.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_register_returns_500_for_unexpected_errors(self):
        user_service = type(
            "UserServiceStub",
            (),
            {"create_user": AsyncMock(side_effect=RuntimeError("database offline"))},
        )()
        auth_service = type(
            "AuthServiceStub",
            (),
            {"login": AsyncMock()},
        )()

        app = _app(auth_service=auth_service, user_service=user_service)

        async with _client(app) as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "new@example.com",
                    "username": "newuser",
                    "password": "supersecret123",
                },
            )

        assert response.status_code == 500
        assert response.json()["detail"] == "Registration failed: database offline"
        auth_service.login.assert_not_awaited()
