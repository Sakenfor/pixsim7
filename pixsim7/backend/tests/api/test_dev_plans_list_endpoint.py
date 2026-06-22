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
    markdown: str = "",
):
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
        # Heavyweight fields stripped:
        assert plan["checkpoints"] is None
        assert plan["codePaths"] == []
        assert plan["phases"] == []
        # Graph-topology fields preserved (needed by plan-graph view):
        assert plan["tags"] == ["policy"]
        assert plan["dependsOn"] == ["plan-dep"]
        assert plan["companions"] == ["docs/plans/a.md"]
        assert plan["handoffs"] == ["handoff-1"]

    @pytest.mark.asyncio
    async def test_q_matches_checkpoint_label(self):
        """`q` searches checkpoint label text and echoes the matched id."""
        app, _db = _app()
        bundles = [
            _bundle(plan_id="plan-alpha", title="Alpha", summary="unrelated"),
            _bundle(
                plan_id="plan-beta",
                title="Beta",
                summary="unrelated",
                checkpoints=[
                    {"id": "cp_one", "label": "Migrate inventory mirror", "status": "pending"},
                    {"id": "cp_two", "label": "Unrelated step", "status": "pending"},
                ],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans?q=inventory+mirror")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        plan = body["plans"][0]
        assert plan["id"] == "plan-beta"
        assert plan["matchedCheckpointIds"] == ["cp_one"]

    @pytest.mark.asyncio
    async def test_q_matches_step_label_and_last_update_note(self):
        """`q` reaches into steps[].label and last_update.note."""
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-deep",
                title="Deep",
                summary="unrelated",
                checkpoints=[
                    {
                        "id": "cp_step",
                        "label": "Outer label",
                        "status": "pending",
                        "steps": [{"id": "s1", "label": "Wire POJO-edge boundary"}],
                    },
                    {
                        "id": "cp_note",
                        "label": "Other",
                        "status": "pending",
                        "last_update": {
                            "at": "2026-05-01T00:00:00+00:00",
                            "note": "Wire POJO-edge boundary",
                        },
                    },
                ],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans?q=pojo-edge")

        assert response.status_code == 200
        plan = response.json()["plans"][0]
        assert sorted(plan["matchedCheckpointIds"]) == ["cp_note", "cp_step"]

    @pytest.mark.asyncio
    async def test_q_skips_markdown_body_by_default(self):
        """Markdown body is not searched unless `q_includes_body=true`."""
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-body",
                title="Body Plan",
                summary="unrelated",
                markdown="This blueprint discusses widget assemblies in depth.",
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                # Default: body excluded, no match.
                r_default = await c.get("/api/v1/dev/plans?q=widget+assemblies")
                # Opt-in: body included, match.
                r_body = await c.get(
                    "/api/v1/dev/plans?q=widget+assemblies&q_includes_body=true"
                )

        assert r_default.json()["total"] == 0
        body_on = r_body.json()
        assert body_on["total"] == 1
        plan = body_on["plans"][0]
        assert plan["id"] == "plan-body"
        # Body hit, no checkpoint hit — echo is empty list, not None.
        assert plan["matchedCheckpointIds"] == []

    @pytest.mark.asyncio
    async def test_q_omitted_means_matched_checkpoint_ids_is_null(self):
        """No `q` → `matchedCheckpointIds` is null, distinguishing from empty match."""
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-x",
                title="X",
                summary="x",
                checkpoints=[{"id": "cp", "label": "anything", "status": "pending"}],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans")

        assert response.status_code == 200
        plan = response.json()["plans"][0]
        assert plan["matchedCheckpointIds"] is None

    @pytest.mark.asyncio
    async def test_q_matched_checkpoint_ids_survives_compact_mode(self):
        """Compact strips `checkpoints` but `matchedCheckpointIds` still echoes."""
        app, _db = _app()
        bundles = [
            _bundle(
                plan_id="plan-c",
                title="C",
                summary="unrelated",
                checkpoints=[
                    {"id": "cp_match", "label": "needle haystack", "status": "pending"},
                ],
            ),
        ]

        with patch(
            "pixsim7.backend.main.api.v1.dev_plans.list_plan_bundles",
            AsyncMock(return_value=bundles),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans?q=needle&compact=true")

        assert response.status_code == 200
        plan = response.json()["plans"][0]
        assert plan["checkpoints"] is None  # compact strips checkpoints
        assert plan["matchedCheckpointIds"] == ["cp_match"]  # but echo survives

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
        # Heavyweight fields stripped from compact registry entries:
        assert entry["codePaths"] == []
        assert entry["phases"] == []
        assert entry["manifestHash"] == ""
        # Graph-topology fields preserved:
        assert entry["tags"] == []
        assert entry["dependsOn"] == ["plan-dep"]
        assert entry["companions"] == ["docs/plans/a.md"]
        assert entry["handoffs"] == ["handoff-1"]
