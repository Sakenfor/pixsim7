"""API tests for admin world/project scope-option listings (agent-scope-admin-ux cp1).

Covers the admin-gated, read-only listings that resolve grantable worlds and
saved project snapshots ACROSS owners (each labelled with its owner) to populate
the scope pickers in Settings → Admin → Access. A scope grant is owner-agnostic,
so these list every owner's resources; `user_id` is an optional filter, not a
fallback. Mirrors the mock style of test_agent_profiles_admin_scope.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException

    from pixsim7.backend.main.api.dependencies import (
        get_current_admin_principal,
        get_game_world_service,
    )
    import pixsim7.backend.main.api.v1.game_worlds as game_worlds_mod
    from pixsim7.backend.main.api.v1.game_worlds import router

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


def _fake_world(world_id: int, name: str, owner_user_id: int = 1):
    return SimpleNamespace(id=world_id, name=name, meta={}, owner_user_id=owner_user_id)


def _fake_project(project_id: int, name: str, owner_user_id: int = 1):
    return SimpleNamespace(id=project_id, name=name, owner_user_id=owner_user_id, is_draft=False)


async def _fake_labels(db, owner_ids):
    # Deterministic stand-in for the username lookup so endpoint tests don't need
    # a second mocked DB round-trip.
    return {int(i): f"user{i}" for i in owner_ids}


def _app(*, rows=None, admin: bool = True, monkeypatch=None):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/worlds")

    # Both endpoints issue exactly one resource query (labels are stubbed below).
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(rows or [])
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    svc = SimpleNamespace(db=db)

    def _svc():
        return svc

    app.dependency_overrides[get_game_world_service] = _svc

    if admin:
        app.dependency_overrides[get_current_admin_principal] = _admin_principal
    else:
        def _deny():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_principal] = _deny

    if monkeypatch is not None:
        monkeypatch.setattr(game_worlds_mod, "_resolve_owner_labels", _fake_labels)
    return app


async def _get(app, path, **params):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        return await c.get(path, params=params)


@pytest.mark.asyncio
async def test_admin_lists_worlds_across_owners(monkeypatch):
    worlds = [_fake_world(1, "Alpha", owner_user_id=1), _fake_world(5, "Beta", owner_user_id=7)]
    app = _app(rows=worlds, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/all")  # no user_id => all owners
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    by_id = {w["id"]: w for w in body["worlds"]}
    assert by_id[1]["owner_user_id"] == 1 and by_id[1]["owner_label"] == "user1"
    assert by_id[5]["owner_user_id"] == 7 and by_id[5]["owner_label"] == "user7"


@pytest.mark.asyncio
async def test_world_dedupe_is_per_owner_not_global(monkeypatch):
    # Same name across DIFFERENT owners must NOT collapse; same name within one owner does.
    worlds = [
        _fake_world(1, "Dup", owner_user_id=1),
        _fake_world(2, "Dup", owner_user_id=1),  # collapses with id 1 (same owner+name)
        _fake_world(3, "Dup", owner_user_id=7),  # distinct owner -> kept
    ]
    app = _app(rows=worlds, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/all")
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(w["id"] for w in body["worlds"]) == [2, 3]  # newest of owner-1 pair + owner-7's


@pytest.mark.asyncio
async def test_admin_world_list_user_id_is_optional_filter(monkeypatch):
    # user_id is now optional (no 422); passing it just narrows.
    app = _app(rows=[_fake_world(1, "Alpha", owner_user_id=1)], monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/all", user_id=1)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_admin_world_list_denied_for_non_admin(monkeypatch):
    app = _app(rows=[_fake_world(1, "Alpha")], admin=False, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/all")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_lists_projects_across_owners(monkeypatch):
    projects = [
        _fake_project(10, "Snap A", owner_user_id=1),
        _fake_project(11, "Snap B", owner_user_id=7),
    ]
    app = _app(rows=projects, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/projects")
    assert resp.status_code == 200
    body = resp.json()
    by_id = {p["id"]: p for p in body}
    assert by_id[10]["owner_user_id"] == 1 and by_id[10]["owner_label"] == "user1"
    assert by_id[11]["name"] == "Snap B" and by_id[11]["owner_label"] == "user7"


@pytest.mark.asyncio
async def test_admin_project_list_denied_for_non_admin(monkeypatch):
    app = _app(rows=[_fake_project(10, "Snap A")], admin=False, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/projects")
    assert resp.status_code == 403
