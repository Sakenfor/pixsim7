"""
API tests for admin user-permission management endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import get_current_admin_user, get_user_service
    from pixsim7.backend.main.api.v1.users import router
    from pixsim7.backend.main.domain.user import User

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _mock_admin() -> MagicMock:
    user = MagicMock(spec=User)
    user.id = 999
    user.role = "admin"
    user.is_active = True
    user.is_admin.return_value = True
    return user


def _make_user(
    *,
    user_id: int,
    email: str,
    username: str,
    role: str = "user",
    permissions: list[str] | None = None,
) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=user_id,
        email=email,
        username=username,
        password_hash="hash",
        role=role,
        permissions=permissions or [],
        is_active=True,
        created_at=now,
        updated_at=now,
        last_login_at=now,
    )


def _service_stub(
    *,
    users: list[User] | None = None,
    total: int = 0,
    updated_user: User | None = None,
):
    return SimpleNamespace(
        list_users=AsyncMock(return_value=users or []),
        count_users=AsyncMock(return_value=total),
        update_user=AsyncMock(return_value=updated_user),
    )


def _app(*, authenticated: bool = True, admin: bool = True, service=None) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_admin_user] = _deny
    elif not admin:
        async def _forbidden():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_user] = _forbidden
    else:
        app.dependency_overrides[get_current_admin_user] = _mock_admin

    if service is not None:
        app.dependency_overrides[get_user_service] = lambda: service

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAdminUserPermissionsEndpoints:
    @pytest.mark.asyncio
    async def test_list_users_for_admin(self):
        user = _make_user(
            user_id=1,
            email="alice@example.com",
            username="alice",
            permissions=["devtools.codegen"],
        )
        service = _service_stub(users=[user], total=1)
        app = _app(service=service)

        async with _client(app) as c:
            response = await c.get("/api/v1/admin/users?search=alice&limit=25&offset=5")

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["users"][0]["email"] == "alice@example.com"
        assert payload["users"][0]["permissions"] == ["devtools.codegen"]

        service.list_users.assert_awaited_once_with(limit=25, offset=5, search="alice")
        service.count_users.assert_awaited_once_with(search="alice")

    @pytest.mark.asyncio
    async def test_update_user_permissions_for_admin(self):
        updated_user = _make_user(
            user_id=2,
            email="bob@example.com",
            username="bob",
            permissions=["devtools.codegen", "feature.x"],
        )
        service = _service_stub(updated_user=updated_user)
        app = _app(service=service)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/admin/users/2/permissions",
                json={"permissions": ["Devtools.Codegen", "devtools.codegen", " ", "feature.x"]},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["id"] == 2
        assert payload["permissions"] == ["devtools.codegen", "feature.x"]

        service.update_user.assert_awaited_once_with(
            2,
            permissions=["devtools.codegen", "feature.x"],
        )

    @pytest.mark.asyncio
    async def test_list_users_requires_admin(self):
        service = _service_stub(users=[], total=0)
        app = _app(authenticated=True, admin=False, service=service)

        async with _client(app) as c:
            response = await c.get("/api/v1/admin/users")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_permissions_requires_authentication(self):
        service = _service_stub(updated_user=None)
        app = _app(authenticated=False, service=service)

        async with _client(app) as c:
            response = await c.put(
                "/api/v1/admin/users/3/permissions",
                json={"permissions": ["devtools.codegen"]},
            )

        assert response.status_code == 401
