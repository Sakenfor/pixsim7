"""API tests for review delegation request/approval endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import dev_plans
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _ExecResult:
    def __init__(self, *, row=None, rows=None):
        self._row = row
        self._rows = list(rows or [])

    def scalar_one_or_none(self):
        return self._row

    def scalars(self):
        return SimpleNamespace(all=lambda: self._rows)


def _app(db_obj=None, *, principal=None, authenticated: bool = True) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    if db_obj is None:
        db_obj = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            commit=AsyncMock(),
            refresh=AsyncMock(),
            execute=AsyncMock(return_value=_ExecResult()),
        )

    async def _db():
        return db_obj

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_principal] = _deny
    else:
        app.dependency_overrides[get_current_principal] = lambda: (
            principal
            if principal is not None
            else RequestPrincipal(id=1, role="user", username="user1")
        )

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestPlanReviewDelegationsAPI:
    @pytest.mark.asyncio
    async def test_create_delegation_request_returns_pending(self):
        added_rows = []
        db = SimpleNamespace(
            add=lambda row: added_rows.append(row),
            commit=AsyncMock(),
            refresh=AsyncMock(),
            execute=AsyncMock(return_value=_ExecResult()),
        )
        app = _app(
            db_obj=db,
            principal=RequestPrincipal(id=1, role="user", username="user1"),
        )

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans/reviews/delegations/requests",
                json={
                    "grantor_user_id": 2,
                    "note": "Need access to route review requests.",
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "pending"
        assert body["grantorUserId"] == 2
        assert body["delegateUserId"] == 1
        assert added_rows
        assert getattr(added_rows[0], "status", None) == "pending"

    @pytest.mark.asyncio
    async def test_approve_delegation_requires_grantor(self):
        now = datetime(2026, 3, 24, tzinfo=timezone.utc)
        delegation_id = uuid4()
        row = SimpleNamespace(
            id=delegation_id,
            grantor_user_id=2,
            delegate_user_id=1,
            plan_id=None,
            status="pending",
            allowed_profile_ids=None,
            allowed_bridge_ids=None,
            allowed_agent_ids=None,
            note=None,
            created_by_user_id=1,
            revoked_by_user_id=None,
            expires_at=None,
            revoked_at=None,
            meta=None,
            created_at=now,
            updated_at=now,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ExecResult(row=row)),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )
        app = _app(
            db_obj=db,
            principal=RequestPrincipal(id=1, role="user", username="user1"),
        )

        async with _client(app) as c:
            response = await c.post(
                f"/api/v1/dev/plans/reviews/delegations/{delegation_id}/approve",
                json={},
            )

        assert response.status_code == 403
        assert "Only the grantor may approve" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_approve_delegation_sets_active(self):
        now = datetime(2026, 3, 24, tzinfo=timezone.utc)
        delegation_id = uuid4()
        row = SimpleNamespace(
            id=delegation_id,
            grantor_user_id=2,
            delegate_user_id=1,
            plan_id=None,
            status="pending",
            allowed_profile_ids=None,
            allowed_bridge_ids=None,
            allowed_agent_ids=None,
            note=None,
            created_by_user_id=1,
            revoked_by_user_id=None,
            expires_at=None,
            revoked_at=None,
            meta=None,
            created_at=now,
            updated_at=now,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ExecResult(row=row)),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )
        app = _app(
            db_obj=db,
            principal=RequestPrincipal(id=2, role="user", username="user2"),
        )

        async with _client(app) as c:
            response = await c.post(
                f"/api/v1/dev/plans/reviews/delegations/{delegation_id}/approve",
                json={"note": "Approved for this plan cycle."},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "active"
        assert row.status == "active"

    @pytest.mark.asyncio
    async def test_delegate_can_cancel_pending_request(self):
        now = datetime(2026, 3, 24, tzinfo=timezone.utc)
        delegation_id = uuid4()
        row = SimpleNamespace(
            id=delegation_id,
            grantor_user_id=2,
            delegate_user_id=1,
            plan_id=None,
            status="pending",
            allowed_profile_ids=None,
            allowed_bridge_ids=None,
            allowed_agent_ids=None,
            note=None,
            created_by_user_id=1,
            revoked_by_user_id=None,
            expires_at=None,
            revoked_at=None,
            meta=None,
            created_at=now,
            updated_at=now,
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ExecResult(row=row)),
            commit=AsyncMock(),
            refresh=AsyncMock(),
        )
        app = _app(
            db_obj=db,
            principal=RequestPrincipal(id=1, role="user", username="user1"),
        )

        async with _client(app) as c:
            response = await c.post(
                f"/api/v1/dev/plans/reviews/delegations/{delegation_id}/revoke",
                json={"note": "No longer needed."},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "cancelled"
        assert row.status == "cancelled"
        assert row.revoked_at is None

    @pytest.mark.asyncio
    async def test_list_delegations_groups_grantor_and_delegate_views(self):
        now = datetime(2026, 3, 24, tzinfo=timezone.utc)
        rows = [
            SimpleNamespace(
                id=uuid4(),
                grantor_user_id=1,
                delegate_user_id=2,
                plan_id=None,
                status="active",
                allowed_profile_ids=None,
                allowed_bridge_ids=None,
                allowed_agent_ids=None,
                note=None,
                created_by_user_id=1,
                revoked_by_user_id=None,
                expires_at=None,
                revoked_at=None,
                meta=None,
                created_at=now,
                updated_at=now,
            ),
            SimpleNamespace(
                id=uuid4(),
                grantor_user_id=3,
                delegate_user_id=1,
                plan_id=None,
                status="pending",
                allowed_profile_ids=None,
                allowed_bridge_ids=None,
                allowed_agent_ids=None,
                note=None,
                created_by_user_id=1,
                revoked_by_user_id=None,
                expires_at=None,
                revoked_at=None,
                meta=None,
                created_at=now,
                updated_at=now,
            ),
        ]
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ExecResult(rows=rows)),
        )
        app = _app(
            db_obj=db,
            principal=RequestPrincipal(id=1, role="user", username="user1"),
        )

        async with _client(app) as c:
            response = await c.get("/api/v1/dev/plans/reviews/delegations")

        assert response.status_code == 200
        body = response.json()
        assert len(body["asGrantor"]) == 1
        assert len(body["asDelegate"]) == 1
        assert body["asGrantor"][0]["grantorUserId"] == 1
        assert body["asDelegate"][0]["delegateUserId"] == 1

