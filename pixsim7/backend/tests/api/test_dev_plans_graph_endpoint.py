"""API tests for GET /dev/plans/graph — canonical plan topology payload."""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-graph",
    "label": "Dev Plans Graph Endpoint",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/routes_graph.py",
        "pixsim7/backend/main/api/v1/dev_plans.py",
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
    title: str = "",
    status: str = "active",
    plan_type: str = "feature",
    parent_id: str | None = None,
    checkpoints: list[dict] | None = None,
    depends_on: list[str] | None = None,
    companions: list[str] | None = None,
    handoffs: list[str] | None = None,
    tags: list[str] | None = None,
):
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    doc = SimpleNamespace(
        id=f"plan:{plan_id}",
        title=title or plan_id,
        status=status,
        owner="lane",
        summary=f"summary for {plan_id}",
        markdown="",
        visibility="public",
        namespace="dev/plans",
        tags=tags or [],
        revision=1,
        updated_at=now,
    )
    plan = SimpleNamespace(
        id=plan_id,
        parent_id=parent_id,
        stage="implementation",
        priority="normal",
        scope="plan",
        plan_type=plan_type,
        target=None,
        checkpoints=checkpoints or [],
        code_paths=[],
        companions=companions or [],
        handoffs=handoffs or [],
        depends_on=depends_on or [],
        phases=[],
        manifest_hash="h",
        last_synced_at=now,
        created_at=now,
        updated_at=now,
    )
    return SimpleNamespace(id=plan_id, doc=doc, plan=plan)


def _app():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
        id=123, role="user", username="test-user"
    )
    return app


def _client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def _cp(done: int, total: int) -> dict:
    return {"id": "cp", "label": "cp", "status": "active", "points_done": done, "points_total": total}


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansGraphEndpoint:
    async def _fetch(self, bundles):
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.plans.helpers.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/graph")
        assert resp.status_code == 200
        return resp.json()

    @pytest.mark.asyncio
    async def test_subtree_rollup_and_descendants(self):
        bundles = [
            _bundle(plan_id="u1", plan_type="umbrella"),  # own 0/0
            _bundle(plan_id="c1", parent_id="u1", checkpoints=[_cp(2, 5)]),
            _bundle(plan_id="c2", parent_id="u1", checkpoints=[_cp(1, 3)]),
        ]
        body = await self._fetch(bundles)
        by_id = {n["id"]: n for n in body["nodes"]}

        assert len(body["nodes"]) == 3
        # Umbrella rolls up its own (0/0) + c1 (2/5) + c2 (1/3) = 3/8.
        assert by_id["u1"]["subtreeProgress"] == {"done": 3, "total": 8}
        assert by_id["u1"]["descendantCount"] == 2
        # A leaf's subtree is just itself.
        assert by_id["c1"]["subtreeProgress"] == {"done": 2, "total": 5}
        assert by_id["c1"]["progress"] == {"done": 2, "total": 5}
        assert by_id["c1"]["descendantCount"] == 0

        kinds = {(e["source"], e["target"], e["kind"]) for e in body["edges"]}
        assert ("u1", "c1", "parent") in kinds
        assert ("u1", "c2", "parent") in kinds

    @pytest.mark.asyncio
    async def test_dependency_edges_and_reverse_counts(self):
        bundles = [
            _bundle(plan_id="a"),
            _bundle(plan_id="b", depends_on=["a"]),
            _bundle(plan_id="c", depends_on=["a"]),
        ]
        body = await self._fetch(bundles)
        by_id = {n["id"]: n for n in body["nodes"]}

        # Two plans depend on 'a'.
        assert by_id["a"]["dependedOnByCount"] == 2
        assert by_id["b"]["dependsOnCount"] == 1

        edges = {(e["source"], e["target"], e["kind"]) for e in body["edges"]}
        assert ("b", "a", "depends_on") in edges
        assert ("c", "a", "depends_on") in edges

    @pytest.mark.asyncio
    async def test_doc_links_resolve_and_external_count(self):
        bundles = [
            _bundle(plan_id="a"),
            _bundle(
                plan_id="b",
                companions=["a", "external-doc.md"],  # one plan, one non-plan
                handoffs=["a"],
            ),
        ]
        body = await self._fetch(bundles)
        by_id = {n["id"]: n for n in body["nodes"]}
        edges = {(e["source"], e["target"], e["kind"]) for e in body["edges"]}

        # In-graph companion/handoff become edges; the non-plan doc does not.
        assert ("b", "a", "companion") in edges
        assert ("b", "a", "handoff") in edges
        assert not any(e["target"] == "external-doc.md" for e in body["edges"])
        # The unresolved companion is surfaced as an external doc count.
        assert by_id["b"]["externalDocCount"] == 1

    @pytest.mark.asyncio
    async def test_dangling_refs_and_hidden_excluded(self):
        bundles = [
            _bundle(plan_id="a", depends_on=["ghost"]),  # ghost not in graph
            _bundle(plan_id="archived-one", status="archived"),
        ]
        body = await self._fetch(bundles)
        ids = {n["id"] for n in body["nodes"]}

        # Hidden statuses are excluded by default.
        assert "archived-one" not in ids
        assert ids == {"a"}
        # Edges only connect in-graph plans — the dangling dep is dropped.
        assert body["edges"] == []
