"""API tests for admin world/project scope-option listings (agent-scope-admin-ux cp1).

Covers the admin-gated, read-only listings that resolve another user's worlds
and saved project snapshots (id + label) to populate the scope pickers in
Settings → Admin → Access. Mirrors the mock style of
test_agent_profiles_admin_scope.
"""
from __future__ import annotations

from datetime import datetime, timezone
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


def _fake_world(world_id: int, name: str):
    return SimpleNamespace(id=world_id, name=name, meta={})


def _fake_project(project_id: int, name: str):
    return SimpleNamespace(
        id=project_id,
        name=name,
        source_world_id=None,
        schema_version=1,
        origin_kind=None,
        origin_source_key=None,
        origin_parent_project_id=None,
        origin_meta=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


def _app(*, worlds=None, projects=None, admin: bool = True, monkeypatch=None):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/game/worlds")

    # World service: only its `.db.execute(...).scalars().all()` chain is used.
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(worlds or [])
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

    # Projects flow constructs GameProjectStorageService(svc.db); stub it.
    if monkeypatch is not None:
        storage = MagicMock()
        storage.list_projects = AsyncMock(return_value=list(projects or []))
        monkeypatch.setattr(
            game_worlds_mod, "GameProjectStorageService", lambda _db: storage
        )
    return app


async def _get(app, path, **params):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        return await c.get(path, params=params)


@pytest.mark.asyncio
async def test_admin_lists_target_user_worlds():
    worlds = [_fake_world(1, "Alpha"), _fake_world(2, "Beta")]
    app = _app(worlds=worlds)
    resp = await _get(app, "/api/v1/game/worlds/admin/all", user_id=7)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert {w["id"] for w in body["worlds"]} == {1, 2}
    assert {w["name"] for w in body["worlds"]} == {"Alpha", "Beta"}


@pytest.mark.asyncio
async def test_admin_world_list_dedupes_legacy_duplicates():
    # Two same-named, unkeyed, non-bootstrapped worlds collapse to the newest id.
    worlds = [_fake_world(1, "Dup"), _fake_world(2, "Dup"), _fake_world(3, "Solo")]
    app = _app(worlds=worlds)
    resp = await _get(app, "/api/v1/game/worlds/admin/all", user_id=7)
    assert resp.status_code == 200
    body = resp.json()
    ids = sorted(w["id"] for w in body["worlds"])
    assert ids == [2, 3]  # newest of the dup pair + the distinct world


@pytest.mark.asyncio
async def test_admin_world_list_requires_user_id():
    app = _app(worlds=[])
    resp = await _get(app, "/api/v1/game/worlds/admin/all")  # missing user_id
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_admin_world_list_denied_for_non_admin():
    app = _app(worlds=[_fake_world(1, "Alpha")], admin=False)
    resp = await _get(app, "/api/v1/game/worlds/admin/all", user_id=7)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_lists_target_user_projects(monkeypatch):
    projects = [_fake_project(10, "Snap A"), _fake_project(11, "Snap B")]
    app = _app(projects=projects, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/projects", user_id=7)
    assert resp.status_code == 200
    body = resp.json()
    assert {p["id"] for p in body} == {10, 11}
    assert {p["name"] for p in body} == {"Snap A", "Snap B"}


@pytest.mark.asyncio
async def test_admin_project_list_denied_for_non_admin(monkeypatch):
    app = _app(projects=[_fake_project(10, "Snap A")], admin=False, monkeypatch=monkeypatch)
    resp = await _get(app, "/api/v1/game/worlds/admin/projects", user_id=7)
    assert resp.status_code == 403
