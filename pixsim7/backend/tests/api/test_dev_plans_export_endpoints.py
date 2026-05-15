"""API tests for /dev/plans/{plan_id}/export and /dev/plans/export."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import get_current_admin_principal, get_database
    from pixsim7.backend.main.api.v1.dev_plans import router
    from pixsim7.backend.main.services.docs.plan_write import PlanBundle

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(*, authenticated: bool = True, admin: bool = True) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_admin_principal] = _deny
    elif not admin:
        async def _forbidden():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[get_current_admin_principal] = _forbidden
    else:
        app.dependency_overrides[get_current_admin_principal] = lambda: SimpleNamespace(id=123, role="admin")

    return app


def _client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def _bundle(plan_id: str = "plan-a", *, tags=None):
    doc = SimpleNamespace(
        title="Plan A",
        status="active",
        owner="lane",
        summary="",
        markdown="# Plan A",
        visibility="public",
        namespace="dev/plans",
        tags=list(tags) if tags is not None else [],
        revision=1,
        updated_at=None,
    )
    plan = SimpleNamespace(
        id=plan_id,
        stage="proposed",
        priority="normal",
        task_scope="plan",
        plan_type="feature",
        target=None,
        checkpoints=[],
        code_paths=[],
        companions=[],
        handoffs=[],
        depends_on=[],
        scope="active",
        updated_at=None,
    )
    return PlanBundle(plan=plan, doc=doc)


_EXPORT_MODULE = "pixsim7.backend.main.api.v1.plans.routes_export"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExportSinglePermissions:
    @pytest.mark.asyncio
    async def test_unauthenticated(self):
        app = _app(authenticated=False)
        async with _client(app) as c:
            r = await c.post("/api/v1/dev/plans/plan-a/export", json={})
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_non_admin(self):
        app = _app(authenticated=True, admin=False)
        async with _client(app) as c:
            r = await c.post("/api/v1/dev/plans/plan-a/export", json={})
        assert r.status_code == 403


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExportSingleBehavior:
    @pytest.mark.asyncio
    async def test_killswitch_returns_409(self):
        app = _app()
        with patch(f"{_EXPORT_MODULE}.settings") as s:
            s.plans_db_only_mode = True
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/export", json={})
        assert r.status_code == 409
        assert "plans_db_only_mode" in r.json()["detail"]

    @pytest.mark.asyncio
    async def test_missing_plan_returns_404(self):
        app = _app()
        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.get_plan_bundle", new=AsyncMock(return_value=None)):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/missing/export", json={})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_happy_path_with_commit(self):
        app = _app()
        bundle = _bundle("plan-a")
        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.get_plan_bundle", new=AsyncMock(return_value=bundle)), \
             patch(f"{_EXPORT_MODULE}.export_plan_to_disk", MagicMock(return_value=["/tmp/manifest.yaml", "/tmp/plan.md"])), \
             patch(f"{_EXPORT_MODULE}._git_commit", MagicMock(return_value="abc123")):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/export", json={"commit": True})
        assert r.status_code == 200
        body = r.json()
        assert body["planId"] == "plan-a"
        assert len(body["paths"]) == 2
        assert body["commitSha"] == "abc123"

    @pytest.mark.asyncio
    async def test_commit_false_skips_git(self):
        app = _app()
        bundle = _bundle("plan-a")
        git_mock = MagicMock(return_value="should-not-be-called")
        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.get_plan_bundle", new=AsyncMock(return_value=bundle)), \
             patch(f"{_EXPORT_MODULE}.export_plan_to_disk", MagicMock(return_value=["/tmp/manifest.yaml"])), \
             patch(f"{_EXPORT_MODULE}._git_commit", git_mock):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/export", json={"commit": False})
        assert r.status_code == 200
        assert r.json()["commitSha"] is None
        git_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_scope_override_passed_through(self):
        app = _app()
        bundle = _bundle("plan-a")
        export_mock = MagicMock(return_value=["/tmp/manifest.yaml"])
        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.get_plan_bundle", new=AsyncMock(return_value=bundle)), \
             patch(f"{_EXPORT_MODULE}.export_plan_to_disk", export_mock), \
             patch(f"{_EXPORT_MODULE}._git_commit", MagicMock(return_value=None)):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/export", json={"scopeOverride": "parked"})
        assert r.status_code == 200
        assert export_mock.call_args.kwargs["scope_override"] == "parked"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestExportBatch:
    @pytest.mark.asyncio
    async def test_killswitch_returns_409(self):
        app = _app()
        with patch(f"{_EXPORT_MODULE}.settings") as s:
            s.plans_db_only_mode = True
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={"allTagged": True})
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_zero_selectors_returns_400(self):
        app = _app()
        with patch(f"{_EXPORT_MODULE}.settings") as s:
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={})
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_multiple_selectors_returns_400(self):
        app = _app()
        with patch(f"{_EXPORT_MODULE}.settings") as s:
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={
                    "ids": ["a"],
                    "allTagged": True,
                })
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_ids_selector_404_on_missing(self):
        app = _app()
        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.get_plan_bundle", new=AsyncMock(return_value=None)):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={"ids": ["missing"]})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_ids_selector_single_commit_for_batch(self):
        app = _app()
        b1 = _bundle("plan-a", tags=["fs-export"])
        b2 = _bundle("plan-b", tags=["fs-export"])
        b2.plan.id = "plan-b"
        get_mock = AsyncMock(side_effect=[b1, b2])
        export_mock = MagicMock(side_effect=[["/tmp/a/m.yaml"], ["/tmp/b/m.yaml"]])
        git_mock = MagicMock(return_value="batchsha")

        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.get_plan_bundle", new=get_mock), \
             patch(f"{_EXPORT_MODULE}.export_plan_to_disk", export_mock), \
             patch(f"{_EXPORT_MODULE}._git_commit", git_mock):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={"ids": ["plan-a", "plan-b"]})

        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) == 2
        assert body["commitSha"] == "batchsha"
        # Single batch commit, not per-plan
        git_mock.assert_called_once()
        assert export_mock.call_count == 2

    @pytest.mark.asyncio
    async def test_all_tagged_filters_untagged(self):
        app = _app()
        b1 = _bundle("plan-a", tags=["fs-export"])
        b2 = _bundle("plan-b", tags=["unrelated"])
        b2.plan.id = "plan-b"
        list_mock = AsyncMock(return_value=[b1, b2])
        export_mock = MagicMock(return_value=["/tmp/m.yaml"])

        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.list_plan_bundles", new=list_mock), \
             patch(f"{_EXPORT_MODULE}.export_plan_to_disk", export_mock), \
             patch(f"{_EXPORT_MODULE}._git_commit", MagicMock(return_value=None)):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={"allTagged": True})

        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) == 1
        assert body["results"][0]["planId"] == "plan-a"

    @pytest.mark.asyncio
    async def test_changed_since_filters_by_updated_at(self):
        from datetime import datetime, timezone, timedelta

        app = _app()
        recent = datetime.now(timezone.utc)
        old = recent - timedelta(days=7)
        cutoff = recent - timedelta(days=1)

        b_recent = _bundle("plan-recent", tags=["fs-export"])
        b_recent.plan.id = "plan-recent"
        b_recent.plan.updated_at = recent

        b_old = _bundle("plan-old", tags=["fs-export"])
        b_old.plan.id = "plan-old"
        b_old.plan.updated_at = old

        list_mock = AsyncMock(return_value=[b_recent, b_old])
        export_mock = MagicMock(return_value=["/tmp/m.yaml"])

        with patch(f"{_EXPORT_MODULE}.settings") as s, \
             patch(f"{_EXPORT_MODULE}.list_plan_bundles", new=list_mock), \
             patch(f"{_EXPORT_MODULE}.export_plan_to_disk", export_mock), \
             patch(f"{_EXPORT_MODULE}._git_commit", MagicMock(return_value=None)):
            s.plans_db_only_mode = False
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/export", json={
                    "changedSince": cutoff.isoformat(),
                })

        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) == 1
        assert body["results"][0]["planId"] == "plan-recent"
