"""API tests for GET /dev/plans and /dev/plans/registry list ergonomics."""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-list",
    "label": "Dev Plans List Endpoint",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_plans.py",
        "pixsim7/backend/main/api/v1/plans/routes_admin.py",
        "pixsim7/backend/main/api/v1/plans/helpers.py",
    ],
    "order": 46,
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


class _ExecResult:
    def __init__(self, rows=None):
        self._rows = rows or []

    def all(self):
        return list(self._rows)


def _bundle(
    *,
    plan_id: str,
    title: str,
    summary: str,
    owner: str = "lane",
    tags: list[str] | None = None,
    checkpoints: list[dict] | None = None,
    code_paths: list[str] | None = None,
):
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    doc = SimpleNamespace(
        id=f"plan:{plan_id}",
        title=title,
        status="active",
        owner=owner,
        summary=summary,
        markdown="",
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
        target={"kind": "system", "id": "x"},
        checkpoints=checkpoints or [],
        code_paths=code_paths or [],
        companions=["docs/plans/a.md"],
        handoffs=["handoff-1"],
        depends_on=["plan-dep"],
        phases=["plan-phase"],
        manifest_hash="hash123",
        last_synced_at=now,
        created_at=now,
        updated_at=now,
    )
    return SimpleNamespace(id=plan_id, doc=doc, plan=plan)


def _app() -> tuple["FastAPI", SimpleNamespace]:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    db = SimpleNamespace(execute=AsyncMock(return_value=_ExecResult([])))

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
class TestDevPlansListEndpoint:
    @pytest.mark.asyncio
    async def test_list_supports_q_filter(self):
        app, _db = _app()
        bundles = [
            _bundle(plan_id="plan-alpha", title="Alpha work", summary="infra chores"),
            _bundle(
                plan_id="plan-policy-v2",
                title="Plan Authoring Policy v2",
                summary="Extensible cross-domain policy engine",
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans?q=policy+engine")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert len(body["plans"]) == 1
        assert body["plans"][0]["id"] == "plan-policy-v2"

    @pytest.mark.asyncio
    async def test_list_compact_omits_heavy_fields(self):
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-heavy",
                title="Heavy plan",
                summary="Contains large payload fields",
                tags=["policy"],
                checkpoints=[{"id": "cp1", "label": "Checkpoint 1", "status": "active"}],
                code_paths=["pixsim7/backend/main/api/v1/dev_plans.py"],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans?compact=true")

        assert response.status_code == 200
        plan = response.json()["plans"][0]
        assert plan["checkpoints"] is None
        assert plan["codePaths"] == []
        assert plan["companions"] == []
        assert plan["handoffs"] == []
        assert plan["dependsOn"] == []
        assert plan["phases"] == []

    @pytest.mark.asyncio
    async def test_registry_supports_q_and_compact(self):
        app, _db = _app()
        bundles = [
            _bundle(plan_id="plan-alpha", title="Alpha work", summary="infra chores"),
            _bundle(
                plan_id="plan-policy-v2",
                title="Plan Authoring Policy v2",
                summary="Extensible cross-domain policy engine",
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.plans.helpers.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/registry?q=policy&compact=true")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert len(body["plans"]) == 1
        entry = body["plans"][0]
        assert entry["id"] == "plan-policy-v2"
        assert entry["codePaths"] == []
        assert entry["companions"] == []
        assert entry["handoffs"] == []
        assert entry["dependsOn"] == []
        assert entry["phases"] == []
        assert entry["tags"] == []
        assert entry["manifestHash"] == ""
