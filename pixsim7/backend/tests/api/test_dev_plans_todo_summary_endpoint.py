"""API tests for GET /dev/plans/todo-summary — open-work view ergonomics."""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-todo-summary",
    "label": "Dev Plans Todo Summary Endpoint",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/routes_todo.py",
        "pixsim7/backend/main/api/v1/plans/helpers.py",
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


def _bundle(
    *,
    plan_id: str,
    title: str,
    summary: str = "",
    owner: str = "lane",
    tags: list[str] | None = None,
    checkpoints: list[dict] | None = None,
    markdown: str = "",
):
    """Build a plan bundle with at least one open checkpoint by default.

    todo-summary only emits plans whose checkpoints have ``points_done <
    points_total``; default checkpoint provides a 0/3 open block so the
    fixture survives the filter unless the caller overrides it.
    """
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    doc = SimpleNamespace(
        id=f"plan:{plan_id}",
        title=title,
        status="active",
        owner=owner,
        summary=summary,
        markdown=markdown,
        visibility="public",
        namespace="dev/plans",
        tags=tags or [],
        revision=3,
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
        checkpoints=checkpoints if checkpoints is not None else [
            {"id": "cp_default", "label": "default open", "status": "pending",
             "points_done": 0, "points_total": 3},
        ],
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        phases=[],
        manifest_hash="hash123",
        last_synced_at=now,
        created_at=now,
        updated_at=now,
    )
    return SimpleNamespace(id=plan_id, doc=doc, plan=plan)


def _app() -> tuple["FastAPI", SimpleNamespace]:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [])))

    async def _db():
        yield db

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
        id=123,
        role="user",
        username="test-user",
    )
    return app, db


def _client(app: "FastAPI"):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansTodoSummaryEndpoint:
    @pytest.mark.asyncio
    async def test_q_filters_by_title_and_checkpoint_text(self):
        """`q` narrows the open-work view by title or checkpoint label."""
        app, _db = _app()
        bundles = [
            _bundle(plan_id="plan-alpha", title="Alpha"),
            _bundle(
                plan_id="plan-objectlink",
                title="ObjectLink Resolver",
                summary="Resolve ObjectLink runtime refs",
            ),
            _bundle(
                plan_id="plan-deep",
                title="Deep Plan",
                checkpoints=[
                    {
                        "id": "cp_open",
                        "label": "Wire ObjectLink resolver path",
                        "status": "pending",
                        "points_done": 0,
                        "points_total": 4,
                    },
                ],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_todo.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/todo-summary?q=ObjectLink")

        assert response.status_code == 200
        body = response.json()
        # plan-objectlink hits on title/summary; plan-deep hits on checkpoint label.
        plan_ids = sorted(p["planId"] for p in body["plans"])
        assert plan_ids == ["plan-deep", "plan-objectlink"]

    @pytest.mark.asyncio
    async def test_matched_checkpoint_ids_echoed_when_q_set(self):
        """todo-summary echoes which checkpoint matched, same as plans.list."""
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-deep",
                title="Deep Plan",
                checkpoints=[
                    {
                        "id": "cp_match",
                        "label": "Wire ObjectLink resolver",
                        "status": "pending",
                        "points_done": 0,
                        "points_total": 4,
                    },
                    {
                        "id": "cp_other",
                        "label": "Unrelated thing",
                        "status": "pending",
                        "points_done": 0,
                        "points_total": 2,
                    },
                ],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_todo.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/todo-summary?q=ObjectLink")

        assert response.status_code == 200
        plan = response.json()["plans"][0]
        assert plan["matchedCheckpointIds"] == ["cp_match"]

    @pytest.mark.asyncio
    async def test_q_omitted_means_matched_checkpoint_ids_is_null(self):
        """No `q` → matchedCheckpointIds is null (distinguishes from empty)."""
        app, _db = _app()
        bundles = [_bundle(plan_id="plan-x", title="X")]

        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_todo.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/todo-summary")

        assert response.status_code == 200
        plan = response.json()["plans"][0]
        assert plan["matchedCheckpointIds"] is None

    @pytest.mark.asyncio
    async def test_q_skips_markdown_body_by_default(self):
        """Body scan is opt-in via q_includes_body=true."""
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-body",
                title="Body Plan",
                markdown="Discusses widget assemblies in depth.",
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_todo.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                r_default = await c.get(
                    "/api/v1/dev/plans/todo-summary?q=widget+assemblies"
                )
                r_body = await c.get(
                    "/api/v1/dev/plans/todo-summary"
                    "?q=widget+assemblies&q_includes_body=true"
                )

        assert r_default.json()["total"] == 0
        body_on = r_body.json()
        assert body_on["total"] == 1
        plan = body_on["plans"][0]
        assert plan["planId"] == "plan-body"
        # Body hit, no checkpoint hit — echo is empty list, not None.
        assert plan["matchedCheckpointIds"] == []

    @pytest.mark.asyncio
    async def test_q_combines_with_stage_and_min_open_points(self):
        """`q` composes with existing filters (stage, min_open_points)."""
        app, _db = _app()
        bundles = [
            # Stage mismatch — should be excluded even though q matches.
            _bundle(plan_id="plan-design", title="ObjectLink Design"),
            _bundle(plan_id="plan-impl", title="ObjectLink Implementation"),
        ]
        # Force a stage on plan-design via direct mutation.
        bundles[0].plan.stage = "design"

        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_todo.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get(
                    "/api/v1/dev/plans/todo-summary"
                    "?q=ObjectLink&stage=implementation"
                )

        assert response.status_code == 200
        plan_ids = [p["planId"] for p in response.json()["plans"]]
        assert plan_ids == ["plan-impl"]
