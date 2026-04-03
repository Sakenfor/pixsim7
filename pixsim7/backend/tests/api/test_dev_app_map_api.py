"""
API tests for App Map Snapshot v2 endpoints.

Tests:
- /dev/app-map/snapshot returns valid AppMapSnapshotV2 schema
- Missing frontend artifact yields a warning (no crash)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import get_current_user_optional, get_database
    from pixsim7.backend.main.api.v1.dev_app_map import router
    from pixsim7.backend.main.api.v1.dev_app_map_contract import (
        AppMapDriftWarning,
        AppMapFrontendRegistries,
        AppMapFrontendSnapshot,
        AppMapFrontendSource,
        AppMapSnapshotV2,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Backend dependencies not installed")


def _app() -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _no_db():
        return MagicMock()

    async def _no_user():
        return None

    app.dependency_overrides[get_database] = _no_db
    app.dependency_overrides[get_current_user_optional] = _no_user
    return app


@pytest.mark.anyio
async def test_snapshot_returns_valid_schema():
    app = _app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/dev/app-map/snapshot")

    assert res.status_code == 200
    data = res.json()

    assert data["version"] == "2.0.0"
    assert "generated_at" in data
    assert "sources" in data
    assert "frontend" in data
    assert "backend" in data
    assert "metrics" in data

    assert data["sources"]["frontend"]["kind"] in ("generated_artifact", "missing")
    assert data["sources"]["backend"]["kind"] == "runtime_introspection"
    assert data["sources"]["external_registries"]["kind"] == "external_registry_manifest"

    frontend = data["frontend"]
    assert isinstance(frontend["entries"], list)
    assert isinstance(frontend["registries"]["actions"], list)
    assert isinstance(frontend["registries"]["panels"], list)
    assert isinstance(frontend["registries"]["modules"], list)
    assert isinstance(frontend["registries"]["stores"], list)
    assert isinstance(frontend["registries"]["hooks"], list)
    assert isinstance(frontend["registries"]["external"], list)

    backend = data["backend"]
    assert isinstance(backend["routes"], list)
    assert isinstance(backend["plugins"], list)
    assert isinstance(backend["services"], list)
    assert isinstance(backend["capability_apis"], list)

    metrics = data["metrics"]
    assert isinstance(metrics["total_frontend_features"], int)
    assert isinstance(metrics["total_actions"], int)
    assert isinstance(metrics["total_backend_routes"], int)
    assert isinstance(metrics["total_panels"], int)
    assert isinstance(metrics["total_modules"], int)
    assert isinstance(metrics["total_stores"], int)
    assert isinstance(metrics["total_hooks"], int)
    assert isinstance(metrics["total_external_registries"], int)
    assert isinstance(metrics["drift_warnings"], list)


@pytest.mark.anyio
async def test_missing_frontend_artifact_returns_warning():
    app = _app()

    with patch(
        "pixsim7.backend.main.api.v1.dev_app_map_service._load_frontend_artifact",
        return_value=(
            AppMapFrontendSnapshot(
                entries=[],
                registries=AppMapFrontendRegistries(),
            ),
            AppMapFrontendSource(
                kind="missing",
                path="docs/app_map.generated.json",
                generated_at=None,
            ),
            [
                AppMapDriftWarning(
                    code="frontend_artifact_missing",
                    message="app_map.generated.json not found. Run: pnpm docs:app-map",
                    severity="warning",
                )
            ],
        ),
    ):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/dev/app-map/snapshot")

    assert res.status_code == 200
    data = res.json()

    assert data["sources"]["frontend"]["kind"] == "missing"
    warnings = data["metrics"]["drift_warnings"]
    assert "frontend_artifact_missing" in [w["code"] for w in warnings]


@pytest.mark.anyio
async def test_snapshot_validates_as_pydantic_model():
    app = _app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/dev/app-map/snapshot")

    assert res.status_code == 200
    model = AppMapSnapshotV2.model_validate(res.json())
    assert model.version == "2.0.0"
