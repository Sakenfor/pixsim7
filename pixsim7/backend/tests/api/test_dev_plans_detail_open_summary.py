"""API tests for the ``open_summary`` block on GET /dev/plans/{plan_id}.

Why this matters: ``plans.detail`` responses are large (full checkpoint list,
notes, markdown) and routinely get truncated downstream by tool-output limits
and UI viewports. The ``open_summary`` field lives near the top of
``PlanSummary`` so the open-work signal survives truncation — a consumer
can answer "what's actually open on this plan?" from the first few hundred
bytes of the payload without reading to the end.

These tests pin:
- The field exists on the detail response with the expected shape.
- Open is computed from ``points_done < points_total``, NOT from ``status``
  (so checkpoints marked ``status: "done"`` but still underwater on points
  are correctly counted as open — the trap that hid Phase 1c open work
  in plan ``automation-package-extraction``).
- Plans with no checkpoints emit ``open_summary: None``, not an empty stub.
- All-done plans emit an OpenSummary with zero counts (distinguishes from
  the "no checkpoints" case).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-detail-open-summary",
    "label": "Dev Plans Detail — open_summary contract",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_plans.py",
        "pixsim7/backend/main/api/v1/plans/helpers.py",
        "pixsim7/backend/main/api/v1/plans/schemas.py",
    ],
    "order": 47,
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
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)
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
class TestPlanDetailOpenSummary:
    @pytest.mark.asyncio
    async def test_open_summary_counts_underwater_checkpoints(self):
        """The canonical case: a checkpoint with points_done < points_total
        is counted as open with (total - done) points."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "Done one", "status": "done",
             "points_done": 3, "points_total": 3},
            {"id": "cp2", "label": "Open one", "status": "pending",
             "points_done": 2, "points_total": 5},
        ])
        app = _app()
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.services.docs.plan_write.load_children",
                  new=AsyncMock(return_value=[])),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        assert resp.status_code == 200
        body = resp.json()
        assert "openSummary" in body  # camelCase via ApiModel alias
        s = body["openSummary"]
        assert s["openPoints"] == 3  # 5 - 2
        assert s["totalPoints"] == 8  # 3 + 5
        assert s["openCheckpointCount"] == 1
        assert len(s["openCheckpoints"]) == 1
        assert s["openCheckpoints"][0]["id"] == "cp2"
        assert s["openCheckpoints"][0]["pointsDone"] == 2
        assert s["openCheckpoints"][0]["pointsTotal"] == 5

    @pytest.mark.asyncio
    async def test_status_done_with_underwater_points_still_counts_as_open(self):
        """Regression test for the Phase 1c trap: a checkpoint can have
        status='done' but points_done < points_total. The points are the
        source of truth, not the status field."""
        bundle = _bundle(checkpoints=[
            {"id": "phase-1c", "label": "Phase 1c — lies about being done",
             "status": "done",  # <-- says done
             "points_done": 6, "points_total": 8},  # <-- but isn't
        ])
        app = _app()
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.services.docs.plan_write.load_children",
                  new=AsyncMock(return_value=[])),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        body = resp.json()
        s = body["openSummary"]
        assert s["openPoints"] == 2
        assert s["openCheckpointCount"] == 1
        # Status preserved on the open entry so callers can see the divergence.
        assert s["openCheckpoints"][0]["status"] == "done"

    @pytest.mark.asyncio
    async def test_open_summary_field_position_survives_truncation(self):
        """open_summary must appear in JSON BEFORE the bulky checkpoints /
        markdown fields so it survives downstream truncation. Verifies field
        declaration order on PlanSummary hasn't regressed."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "x", "points_done": 0, "points_total": 1},
        ])
        app = _app()
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.services.docs.plan_write.load_children",
                  new=AsyncMock(return_value=[])),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        # Inspect raw text so we can check serialization order.
        raw = resp.text
        idx_open = raw.find('"openSummary"')
        idx_checkpoints = raw.find('"checkpoints"')
        idx_markdown = raw.find('"markdown"')
        assert idx_open != -1, "openSummary must be present"
        assert idx_open < idx_checkpoints, "openSummary must precede checkpoints"
        assert idx_open < idx_markdown, "openSummary must precede markdown"

    @pytest.mark.asyncio
    async def test_no_checkpoints_returns_none(self):
        """A plan with zero checkpoints emits open_summary: None — lets
        callers distinguish 'no checkpoints declared' from 'all complete'."""
        bundle = _bundle(checkpoints=[])
        app = _app()
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.services.docs.plan_write.load_children",
                  new=AsyncMock(return_value=[])),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        body = resp.json()
        assert body["openSummary"] is None

    @pytest.mark.asyncio
    async def test_all_done_returns_zero_counts_not_none(self):
        """An all-done plan emits OpenSummary{0,N,0,[]} — distinct from
        the no-checkpoints case. Lets consumers tell 'cleanly finished' from
        'never had work to track'."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "points_done": 3, "points_total": 3},
            {"id": "cp2", "points_done": 5, "points_total": 5},
        ])
        app = _app()
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.services.docs.plan_write.load_children",
                  new=AsyncMock(return_value=[])),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        body = resp.json()
        s = body["openSummary"]
        assert s is not None
        assert s["openPoints"] == 0
        assert s["totalPoints"] == 8
        assert s["openCheckpointCount"] == 0
        assert s["openCheckpoints"] == []

    @pytest.mark.asyncio
    async def test_open_checkpoints_capped_at_eight(self):
        """The inlined open_checkpoints list is capped to keep the payload
        small even on plans with many open items. Full detail via
        plans.detail's checkpoints field (further down the payload)."""
        # 12 open checkpoints — expect 8 in the cap.
        checkpoints = [
            {"id": f"cp{i}", "label": f"open {i}",
             "points_done": 0, "points_total": 1}
            for i in range(12)
        ]
        bundle = _bundle(checkpoints=checkpoints)
        app = _app()
        with (
            patch("pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                  new=AsyncMock(return_value=bundle)),
            patch("pixsim7.backend.main.services.docs.plan_write.load_children",
                  new=AsyncMock(return_value=[])),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        body = resp.json()
        s = body["openSummary"]
        assert s["openPoints"] == 12  # full total preserved
        assert s["openCheckpointCount"] == 12  # full count preserved
        assert len(s["openCheckpoints"]) == 8  # list truncated
