"""API tests for admin agent-profile scope management (cp5).

Covers the admin-gated grant/revoke endpoint that lets an admin set a
collaborator profile's scope fields (assigned_plans / default_scopes /
allowed_contracts) and pause it — across owners. Mirrors the mock style of
test_user_permissions_admin_endpoints.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import (
        get_current_admin_principal,
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.agent_profiles import router
    import pixsim7.backend.main.services.audit as audit_mod

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend imports unavailable")


def _admin_principal():
    p = MagicMock()
    p.id = 999
    p.is_admin.return_value = True
    p.is_active = True
    return p


def _fake_profile(**over):
    base = dict(
        id="collab-claude",
        user_id=7,
        label="Collaborator",
        description=None,
        icon=None,
        agent_type="claude",
        system_prompt=None,
        model_id=None,
        reasoning_effort=None,
        method=None,
        audience="user",
        allowed_contracts=None,
        config=None,
        default_scopes=None,
        assigned_plans=None,
        status="active",
        is_default=False,
        is_global=False,
        created_at=None,
        updated_at=None,
    )
    base.update(over)
    return SimpleNamespace(**base)


def _app(profile, *, admin: bool = True, monkeypatch=None) -> tuple[FastAPI, object]:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    db = MagicMock()
    db.get = AsyncMock(return_value=profile)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    async def _db():
        return db

    app.dependency_overrides[get_database] = _db
    if admin:
        app.dependency_overrides[get_current_admin_principal] = _admin_principal
    else:
        # Simulate the admin gate rejecting a non-admin.
        from fastapi import HTTPException

        def _deny():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_principal] = _deny

    # Audit is a side effect; stub it so the mocked db isn't exercised by it.
    if monkeypatch is not None:
        stub = MagicMock()
        stub.record_diff = AsyncMock()
        monkeypatch.setattr(audit_mod, "AuditService", lambda _db: stub)
    return app, db


async def _patch(app, profile_id, body):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        return await c.patch(f"/api/v1/dev/agent-profiles/admin/{profile_id}", json=body)


@pytest.mark.asyncio
async def test_admin_grants_scope_fields(monkeypatch):
    profile = _fake_profile()
    app, _ = _app(profile, monkeypatch=monkeypatch)
    resp = await _patch(app, "collab-claude", {
        "assigned_plans": ["plan-a"],
        "default_scopes": ["world:42"],
        "allowed_contracts": ["plans.management"],
    })
    assert resp.status_code == 200
    # Fields applied to the (mocked) profile object before commit.
    assert profile.assigned_plans == ["plan-a"]
    assert profile.default_scopes == ["world:42"]
    assert profile.allowed_contracts == ["plans.management"]


@pytest.mark.asyncio
async def test_omitted_field_unchanged_null_clears(monkeypatch):
    profile = _fake_profile(assigned_plans=["old"], default_scopes=["world:1"])
    app, _ = _app(profile, monkeypatch=monkeypatch)
    # Send default_scopes=null (clear → unrestricted); omit assigned_plans (keep).
    resp = await _patch(app, "collab-claude", {"default_scopes": None})
    assert resp.status_code == 200
    assert profile.assigned_plans == ["old"]   # omitted → untouched
    assert profile.default_scopes is None        # explicit null → cleared


@pytest.mark.asyncio
async def test_pause_via_status(monkeypatch):
    profile = _fake_profile()
    app, _ = _app(profile, monkeypatch=monkeypatch)
    resp = await _patch(app, "collab-claude", {"status": "paused"})
    assert resp.status_code == 200
    assert profile.status == "paused"


@pytest.mark.asyncio
async def test_invalid_status_rejected(monkeypatch):
    profile = _fake_profile()
    app, _ = _app(profile, monkeypatch=monkeypatch)
    resp = await _patch(app, "collab-claude", {"status": "bogus"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_empty_body_rejected(monkeypatch):
    profile = _fake_profile()
    app, _ = _app(profile, monkeypatch=monkeypatch)
    resp = await _patch(app, "collab-claude", {})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_missing_profile_404(monkeypatch):
    app, _ = _app(None, monkeypatch=monkeypatch)  # db.get returns None
    resp = await _patch(app, "nope", {"status": "paused"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_denied(monkeypatch):
    profile = _fake_profile()
    app, _ = _app(profile, admin=False, monkeypatch=monkeypatch)
    resp = await _patch(app, "collab-claude", {"status": "paused"})
    assert resp.status_code == 403
