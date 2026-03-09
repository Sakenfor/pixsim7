"""Permission tests for content pack reload endpoint."""

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
async def test_reload_content_packs_requires_admin():
    app = _app(allow_admin=False)
    async with _client(app) as client:
        response = await client.post("/api/v1/block-templates/meta/content-packs/reload")
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_reload_content_packs_allows_admin(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(content_pack_loader, "discover_content_packs", lambda: [])

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post("/api/v1/block-templates/meta/content-packs/reload")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"packs_processed": 0, "results": {}}
