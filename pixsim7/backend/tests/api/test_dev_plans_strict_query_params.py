"""API tests for the strict-query-param guard on the dev_plans router.

Default FastAPI behavior silently accepts and discards unknown query
params — a typo (``include_markdown`` vs ``includeMarkdown``) or a stale
param name after a rename becomes a silent no-op. The guard reads the
matched route's declared query params and 422s on any extras.

Pinned:
- Unknown query param on a top-level route (e.g. plans.detail) → 422
  with structured detail (``unknown[]``, ``allowed[]``, ``hint``).
- Unknown query param on a sub-router route (e.g. todo-summary) → 422,
  confirming the dependency propagates through ``include_router``.
- Unknown query param on the new per-checkpoint route → 422.
- Declared query params (``include_markdown``, ``fields`` on plans.detail;
  ``compact`` on plans.list) → 200, not blocked.
- Multi-value query params (``?tag=a&tag=b``) when ``tag`` is declared →
  200 (dedup handled correctly).
- Multiple unknown params surface all of them in the 422 detail.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-strict-query-params",
    "label": "Dev Plans — strict query-param guard (no silent drops)",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_plans.py",
    ],
    "order": 50,
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
    now = datetime(2026, 5, 20, tzinfo=timezone.utc)
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
class TestStrictQueryParams:
    @pytest.mark.asyncio
    async def test_unknown_param_on_detail_returns_422(self):
        """Unknown param on /dev/plans/{id} → 422 with structured detail."""
        bundle = _bundle()
        app = _app()
        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.services.docs.plan_write.load_children",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"includeMarkdown": "false"},  # camelCase typo
                )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["error"] == "unknown_query_params"
        assert detail["unknown"] == ["includeMarkdown"]
        assert "include_markdown" in detail["allowed"]
        assert "fields" in detail["allowed"]
        assert "hint" in detail

    @pytest.mark.asyncio
    async def test_declared_params_pass_through(self):
        """Declared query params (`include_markdown`, `fields`) → 200."""
        bundle = _bundle()
        app = _app()
        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.services.docs.plan_write.load_children",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"include_markdown": "false", "fields": "id,title"},
                )

        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_unknown_param_on_list_returns_422(self):
        """Verifies the guard on a top-level route with many declared params."""
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            new=AsyncMock(return_value=[]),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans",
                    params={"complete": "true"},  # typo for `compact`
                )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "complete" in detail["unknown"]
        assert "compact" in detail["allowed"]

    @pytest.mark.asyncio
    async def test_declared_list_params_pass_through(self):
        """`compact`, `limit`, etc. are declared → 200."""
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            new=AsyncMock(return_value=[]),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans",
                    params={"compact": "true", "limit": "10", "offset": "0"},
                )

        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_unknown_param_on_checkpoint_detail_returns_422(self):
        """The guard reaches the new per-checkpoint route too."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "status": "pending"},
        ])
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1/checkpoints/cp1",
                    params={"verbose": "true"},
                )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "verbose" in detail["unknown"]

    @pytest.mark.asyncio
    async def test_guard_propagates_to_sub_router_route(self):
        """include_router merges parent dependencies into child routes —
        verify by hitting a sub-router endpoint (todo-summary) with an
        unknown param. If propagation broke, this would silently 200."""
        app = _app()
        # todo-summary lives in routes_todo.py; it accepts many filters.
        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_todo.list_plan_bundles",
            new=AsyncMock(return_value=[]),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/todo-summary",
                    params={"definitely_not_a_real_param": "x"},
                )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert "definitely_not_a_real_param" in detail["unknown"]

    @pytest.mark.asyncio
    async def test_multiple_unknown_params_all_surfaced(self):
        """All unknown keys appear in the 422 detail — sorted for stability."""
        bundle = _bundle()
        app = _app()
        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.services.docs.plan_write.load_children",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"zfoo": "1", "afoo": "2", "mfoo": "3"},
                )

        detail = resp.json()["detail"]
        assert detail["unknown"] == ["afoo", "mfoo", "zfoo"]

    @pytest.mark.asyncio
    async def test_repeated_declared_param_passes(self):
        """`?tag=a&tag=b` — same declared key repeated; should be allowed."""
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            new=AsyncMock(return_value=[]),
        ):
            async with _client(app) as c:
                # `tag` is a declared query param on plans.list
                resp = await c.get(
                    "/api/v1/dev/plans",
                    params=[("tag", "a"), ("tag", "b")],
                )

        assert resp.status_code == 200
