"""
API tests for the Architecture Graph v1 endpoints.

Tests:
- /dev/architecture/graph returns valid ArchitectureGraphV1 schema
- /dev/architecture/unified returns identical payload to /graph
- Missing frontend artifact produces a drift warning (not a crash)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import get_current_user_optional, get_database
    from pixsim7.backend.main.api.v1.dev_architecture import router
    from pixsim7.backend.main.api.v1.dev_architecture_contract import ArchitectureGraphV1

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Backend dependencies not installed")


def _app() -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    # Override deps so tests don't need a real DB / auth
    async def _no_db():
        return MagicMock()

    async def _no_user():
        return None

    app.dependency_overrides[get_database] = _no_db
    app.dependency_overrides[get_current_user_optional] = _no_user
    return app


# ---------------------------------------------------------------------------
# Schema tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_graph_returns_valid_schema():
    """GET /graph must return a payload matching ArchitectureGraphV1."""
    app = _app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/dev/architecture/graph")

    assert res.status_code == 200
    data = res.json()

    # Top-level fields
    assert data["version"] == "1.0.0"
    assert "generated_at" in data
    assert "sources" in data
    assert "frontend" in data
    assert "backend" in data
    assert "links" in data
    assert "metrics" in data

    # Sources
    assert data["sources"]["frontend"]["kind"] in ("generated_artifact", "fallback_local")
    assert data["sources"]["backend"]["kind"] == "runtime_introspection"

    # Backend subsections
    backend = data["backend"]
    assert isinstance(backend["routes"], list)
    assert isinstance(backend["plugins"], list)
    assert isinstance(backend["services"], list)
    assert isinstance(backend["capability_apis"], list)

    # Metrics
    metrics = data["metrics"]
    assert isinstance(metrics["total_frontend_features"], int)
    assert isinstance(metrics["total_backend_routes"], int)
    assert isinstance(metrics["drift_warnings"], list)


@pytest.mark.anyio
async def test_unified_is_alias_for_graph():
    """/unified must return the same payload shape as /graph."""
    app = _app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        graph_res = await client.get("/api/v1/dev/architecture/graph")
        unified_res = await client.get("/api/v1/dev/architecture/unified")

    assert graph_res.status_code == 200
    assert unified_res.status_code == 200

    graph = graph_res.json()
    unified = unified_res.json()

    # Both must share the same version and structure
    assert graph["version"] == unified["version"]
    assert set(graph.keys()) == set(unified.keys())
    # Both should have same source kinds
    assert graph["sources"]["frontend"]["kind"] == unified["sources"]["frontend"]["kind"]
    assert graph["sources"]["backend"]["kind"] == unified["sources"]["backend"]["kind"]


@pytest.mark.anyio
async def test_missing_frontend_artifact_returns_warning():
    """When the frontend artifact is missing, the graph still returns with a drift warning."""
    app = _app()

    # Patch where the graph builder reads it (it imports from dev_architecture)
    with patch(
        "pixsim7.backend.main.api.v1.dev_architecture_graph.load_frontend_app_map",
        return_value={
            "version": "1.0.0",
            "generatedAt": None,
            "entries": [],
            "error": "app_map.generated.json not found. Run: pnpm docs:app-map",
        },
    ):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/dev/architecture/graph")

    assert res.status_code == 200
    data = res.json()

    # Should still be valid
    assert data["version"] == "1.0.0"
    assert data["frontend"]["entries"] == []

    # Should have a drift warning about missing artifact
    warnings = data["metrics"]["drift_warnings"]
    codes = [w["code"] for w in warnings]
    assert "frontend_artifact_missing" in codes

    # Source should be fallback_local
    assert data["sources"]["frontend"]["kind"] == "fallback_local"


@pytest.mark.anyio
async def test_graph_validates_as_pydantic_model():
    """The /graph response should be parseable by the Pydantic model."""
    app = _app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/dev/architecture/graph")

    assert res.status_code == 200
    # This will raise ValidationError if the shape is wrong
    model = ArchitectureGraphV1.model_validate(res.json())
    assert model.version == "1.0.0"
