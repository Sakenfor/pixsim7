"""Permission tests for content pack adopt endpoint."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException

    from pixsim7.backend.main.api.dependencies import get_db, require_admin
    from pixsim7.backend.main.api.v1.block_templates import router
    from pixsim7.backend.main.services.prompt.block import content_pack_loader

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def _app(*, allow_admin: bool) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    if allow_admin:
        app.dependency_overrides[require_admin] = lambda: SimpleNamespace(
            id=1,
            username="admin",
            is_admin=lambda: True,
        )
    else:
        async def _deny_admin():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = _deny_admin

    app.dependency_overrides[get_db] = lambda: SimpleNamespace()
    return app


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_content_pack_requires_admin():
    app = _app(allow_admin=False)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={"source_pack": "legacy_pack", "target_pack": "core_camera"},
        )
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_content_pack_allows_admin(monkeypatch: pytest.MonkeyPatch):
    async def _fake_adopt(*_args, **_kwargs):
        return {
            "blocks_adopted": 2,
            "templates_adopted": 1,
            "characters_adopted": 0,
            "template_package_renamed": 1,
            "slot_package_renamed": 3,
            "block_source_pack_renamed": 2,
        }

    monkeypatch.setattr(content_pack_loader, "adopt_orphaned_pack", _fake_adopt)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={"source_pack": "legacy_pack", "target_pack": "core_camera"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_pack"] == "legacy_pack"
    assert payload["target_pack"] == "core_camera"
    assert payload["rewrite_packages"] is True
    assert payload["result"]["templates_adopted"] == 1
