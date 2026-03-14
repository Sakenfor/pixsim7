"""API-level lifecycle tests for content pack inventory, adopt, and purge endpoints."""

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


# ── Inventory endpoint ───────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_inventory_requires_admin():
    app = _app(allow_admin=False)
    async with _client(app) as client:
        response = await client.get("/api/v1/block-templates/meta/content-packs/inventory")
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_inventory_returns_status_classification(monkeypatch):
    async def _fake_inventory(_db):
        return {
            "disk_packs": ["active_pack", "disk_only_pack"],
            "packs": {
                "active_pack": {"status": "active", "blocks": 5, "templates": 2, "characters": 0},
                "orphan_pack": {"status": "orphaned", "blocks": 3, "templates": 0, "characters": 1},
                "disk_only_pack": {"status": "disk_only", "blocks": 0, "templates": 0, "characters": 0},
            },
            "summary": {
                "total_packs": 3,
                "active_packs": 1,
                "orphaned_packs": 1,
                "disk_only_packs": 1,
                "total_orphaned_entities": 4,
            },
        }

    monkeypatch.setattr(content_pack_loader, "get_content_pack_inventory", _fake_inventory)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.get("/api/v1/block-templates/meta/content-packs/inventory")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["orphaned_packs"] == 1
    assert payload["packs"]["active_pack"]["status"] == "active"
    assert payload["packs"]["orphan_pack"]["status"] == "orphaned"
    assert payload["packs"]["disk_only_pack"]["status"] == "disk_only"


# ── Purge endpoint ───────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_purge_requires_admin():
    app = _app(allow_admin=False)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/purge",
            params={"pack": "legacy_orphan"},
        )
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_purge_rejects_on_disk_pack(monkeypatch):
    async def _fail_purge(_db, pack_name):
        raise ValueError(f"Pack '{pack_name}' still exists on disk.")

    monkeypatch.setattr(content_pack_loader, "purge_orphaned_pack", _fail_purge)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/purge",
            params={"pack": "core_camera"},
        )

    assert response.status_code == 400
    assert "still exists on disk" in response.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_purge_succeeds_for_orphaned_pack(monkeypatch):
    async def _fake_purge(_db, pack_name):
        return {"blocks_purged": 3, "templates_purged": 1, "characters_purged": 0}

    monkeypatch.setattr(content_pack_loader, "purge_orphaned_pack", _fake_purge)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/purge",
            params={"pack": "legacy_orphan"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["packs_purged"] == 1
    assert payload["results"]["legacy_orphan"]["blocks_purged"] == 3


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_purge_all_orphaned_packs(monkeypatch):
    """Purge without a specific pack name should purge all orphaned packs."""
    async def _fake_inventory(_db):
        return {
            "disk_packs": ["active_pack"],
            "packs": {
                "active_pack": {"status": "active", "blocks": 5, "templates": 0, "characters": 0},
                "orphan_a": {"status": "orphaned", "blocks": 2, "templates": 0, "characters": 0},
                "orphan_b": {"status": "orphaned", "blocks": 1, "templates": 1, "characters": 0},
            },
            "summary": {"orphaned_packs": 2},
        }

    async def _fake_purge(_db, pack_name):
        return {"blocks_purged": 1, "templates_purged": 0, "characters_purged": 0}

    monkeypatch.setattr(content_pack_loader, "get_content_pack_inventory", _fake_inventory)
    monkeypatch.setattr(content_pack_loader, "purge_orphaned_pack", _fake_purge)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post("/api/v1/block-templates/meta/content-packs/purge")

    assert response.status_code == 200
    payload = response.json()
    assert payload["packs_purged"] == 2
    assert "orphan_a" in payload["results"]
    assert "orphan_b" in payload["results"]


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_purge_all_noop_when_no_orphans(monkeypatch):
    async def _fake_inventory(_db):
        return {
            "disk_packs": ["active_pack"],
            "packs": {
                "active_pack": {"status": "active", "blocks": 5, "templates": 0, "characters": 0},
            },
            "summary": {"orphaned_packs": 0},
        }

    monkeypatch.setattr(content_pack_loader, "get_content_pack_inventory", _fake_inventory)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post("/api/v1/block-templates/meta/content-packs/purge")

    assert response.status_code == 200
    assert response.json()["packs_purged"] == 0


# ── Adopt endpoint ───────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_source_not_orphaned_returns_400(monkeypatch):
    async def _fail_adopt(*_args, **_kwargs):
        raise ValueError("Source pack 'active_pack' is not orphaned (status=active).")

    monkeypatch.setattr(content_pack_loader, "adopt_orphaned_pack", _fail_adopt)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={"source_pack": "active_pack", "target_pack": "core_camera"},
        )

    assert response.status_code == 400
    assert "not orphaned" in response.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_target_not_on_disk_returns_400(monkeypatch):
    async def _fail_adopt(*_args, **_kwargs):
        raise ValueError("Target pack 'nonexistent' does not exist on disk.")

    monkeypatch.setattr(content_pack_loader, "adopt_orphaned_pack", _fail_adopt)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={"source_pack": "orphan_pack", "target_pack": "nonexistent"},
        )

    assert response.status_code == 400
    assert "does not exist on disk" in response.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_source_equals_target_returns_400(monkeypatch):
    async def _fail_adopt(*_args, **_kwargs):
        raise ValueError("source and target pack names must differ")

    monkeypatch.setattr(content_pack_loader, "adopt_orphaned_pack", _fail_adopt)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={"source_pack": "same_pack", "target_pack": "same_pack"},
        )

    assert response.status_code == 400
    assert "must differ" in response.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_success_returns_rewrite_counts(monkeypatch):
    async def _fake_adopt(*_args, **_kwargs):
        return {
            "blocks_adopted": 3,
            "templates_adopted": 1,
            "characters_adopted": 1,
            "template_package_renamed": 1,
            "slot_package_renamed": 2,
            "block_source_pack_renamed": 3,
        }

    monkeypatch.setattr(content_pack_loader, "adopt_orphaned_pack", _fake_adopt)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={"source_pack": "legacy_orphan", "target_pack": "core_camera"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_pack"] == "legacy_orphan"
    assert payload["target_pack"] == "core_camera"
    assert payload["rewrite_packages"] is True
    assert payload["result"]["blocks_adopted"] == 3
    assert payload["result"]["templates_adopted"] == 1
    assert payload["result"]["characters_adopted"] == 1
    assert payload["result"]["slot_package_renamed"] == 2


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_adopt_rewrite_packages_false_passed_through(monkeypatch):
    received_kwargs = {}

    async def _fake_adopt(_db, *, source_pack_name, target_pack_name, rewrite_package_names):
        received_kwargs.update(
            source_pack_name=source_pack_name,
            target_pack_name=target_pack_name,
            rewrite_package_names=rewrite_package_names,
        )
        return {
            "blocks_adopted": 0, "templates_adopted": 0, "characters_adopted": 0,
            "template_package_renamed": 0, "slot_package_renamed": 0, "block_source_pack_renamed": 0,
        }

    monkeypatch.setattr(content_pack_loader, "adopt_orphaned_pack", _fake_adopt)

    app = _app(allow_admin=True)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/block-templates/meta/content-packs/adopt",
            params={
                "source_pack": "legacy_orphan",
                "target_pack": "core_camera",
                "rewrite_packages": "false",
            },
        )

    assert response.status_code == 200
    assert response.json()["rewrite_packages"] is False
    assert received_kwargs["rewrite_package_names"] is False
