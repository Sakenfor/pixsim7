"""API tests for GET /dev/plans/{plan_id}/checkpoints/{checkpoint_id}.

Why this endpoint exists: ``plans.detail`` returns the entire plan
(markdown body + every checkpoint with description + steps + evidence) and
routinely exceeds the ~30k char MCP tool-output truncation limit on plans
with many fat checkpoints. The tail of ``checkpoints[]`` gets chopped,
making target checkpoints unreachable for agents.

This per-checkpoint endpoint is the surgical fetch path: callers discover
the ``checkpoint_id`` via ``open_summary.open_checkpoints`` (which
survives truncation because it sits near the top of the payload) and pull
just the one entry.

These tests pin:
- Happy path returns the checkpoint with all declared fields.
- Unknown ``checkpoint_id`` → 404 (with both plan_id and checkpoint_id in
  the detail message so debugging is one line, not two).
- Unknown ``plan_id`` → 404 (same plan-not-found path as ``plans.detail``).
- Extra/forward-compat fields on the stored checkpoint dict survive
  serialization (``Checkpoint.model_config = ConfigDict(extra="allow")``).
- The route is registered BEFORE the ``/{plan_id}`` catch-all so it
  isn't shadowed.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-checkpoint-detail",
    "label": "Dev Plans — per-checkpoint detail endpoint",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_plans.py",
        "pixsim7/backend/main/api/v1/plans/schemas.py",
        "pixsim7/backend/main/services/meta/contract_registry.py",
    ],
    "order": 48,
}

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.shared.actor import RequestPrincipal

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _bundle(*, plan_id: str = "p1", checkpoints: list[dict] | None = None):
    now = datetime(2026, 5, 19, tzinfo=timezone.utc)
    doc = SimpleNamespace(
        id=f"plan:{plan_id}",
        title=f"Plan {plan_id}",
        status="active",
        owner="stefan",
        summary="",
        markdown="# body",
        visibility="public",
        namespace="dev/plans",
        tags=[],
        revision=1,
        updated_at=now,
    )
    plan = SimpleNamespace(
        id=plan_id,
        parent_id=None,
        stage="implementation",
        priority="normal",
        scope="plan",
        plan_type="feature",
        target=None,
        checkpoints=checkpoints or [],
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        phases=[],
        manifest_hash="h",
        last_synced_at=now,
        created_at=now,
        updated_at=now,
        plan_path="",
    )
    return SimpleNamespace(id=plan_id, doc=doc, plan=plan)


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    db = SimpleNamespace()

    async def _db():
        yield db

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
        id=1, role="user", username="t",
    )
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestPlanCheckpointDetail:
    @pytest.mark.asyncio
    async def test_returns_checkpoint_by_id(self):
        """Happy path: known plan + known checkpoint → 200 with the checkpoint."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "First", "status": "done",
             "points_done": 3, "points_total": 3},
            {"id": "cp-target", "label": "Target checkpoint", "status": "pending",
             "description": "What this checkpoint does",
             "points_done": 2, "points_total": 5,
             "steps": [{"label": "step one", "done": True},
                       {"label": "step two", "done": False}]},
        ])
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1/checkpoints/cp-target")

        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "cp-target"
        assert body["label"] == "Target checkpoint"
        assert body["status"] == "pending"
        assert body["description"] == "What this checkpoint does"
        assert body["pointsDone"] == 2
        assert body["pointsTotal"] == 5
        assert len(body["steps"]) == 2
        assert body["steps"][0]["done"] is True

    @pytest.mark.asyncio
    async def test_unknown_checkpoint_returns_404(self):
        """Unknown checkpoint_id → 404 with both plan_id and checkpoint_id in detail."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "Only one", "points_done": 0, "points_total": 1},
        ])
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1/checkpoints/does-not-exist")

        assert resp.status_code == 404
        detail = resp.json()["detail"]
        assert "does-not-exist" in detail
        assert "p1" in detail

    @pytest.mark.asyncio
    async def test_unknown_plan_returns_404(self):
        """Unknown plan_id → 404 (mirrors plans.detail behavior)."""
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=None),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/missing-plan/checkpoints/any")

        assert resp.status_code == 404
        assert "missing-plan" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_extra_fields_preserved(self):
        """Checkpoint.model_config = ConfigDict(extra="allow") — forward-
        compatible fields on the stored dict survive serialization."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "status": "pending",
             "future_field": "preserved", "tags": ["roadmap", "wip"]},
        ])
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1/checkpoints/cp1")

        body = resp.json()
        # Extras pass through with their original keys — only fields explicitly
        # declared on the model get the camelCase alias from ApiModel.
        assert body.get("future_field") == "preserved"
        assert body.get("tags") == ["roadmap", "wip"]

    @pytest.mark.asyncio
    async def test_route_not_shadowed_by_catchall(self):
        """The per-checkpoint route is registered BEFORE GET /{plan_id} —
        verify a multi-segment path resolves to this handler, not the
        catch-all (which would return PlanDetailResponse, not Checkpoint)."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "status": "pending"},
        ])
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1/checkpoints/cp1")

        assert resp.status_code == 200
        body = resp.json()
        # PlanDetailResponse would have a "markdown" field; Checkpoint does not.
        assert "markdown" not in body
        assert "checkpoints" not in body
        assert body["id"] == "cp1"
