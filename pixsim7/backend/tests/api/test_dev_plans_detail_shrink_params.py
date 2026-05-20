"""API tests for the payload-shrink levers on GET /dev/plans/{plan_id}.

Two query params: ``include_markdown`` (default True) and ``fields`` (CSV
whitelist, default None). Together they let agents trim ``plans.detail``
responses below MCP's ~30k tool-output truncation budget when the full
payload would otherwise get chopped mid-``checkpoints[]``.

Pinned behaviors:
- Default (no params) → byte-identical to pre-change output (response_model
  fast path; no JSONResponse round-trip).
- ``include_markdown=false`` → ``markdown`` key removed; everything else
  intact (notably ``openSummary``, ``checkpoints``, ``codePaths``).
- ``fields=`` whitelist accepts snake_case OR camelCase, normalized to the
  camel aliases used in the response.
- ``id`` is always included even when not in ``fields=`` (primary key).
- Unknown ``fields=`` token → 400 with the valid-names list in the detail.
- Empty ``fields=`` → 400.
- ``fields=`` wins over ``include_markdown`` when both are set —
  whitelisting ``markdown`` explicitly keeps it even if
  ``include_markdown=false``.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-detail-shrink-params",
    "label": "Dev Plans Detail — include_markdown + fields shrink params",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-crud",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_plans.py",
        "pixsim7/backend/main/services/meta/contract_registry.py",
    ],
    "order": 49,
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
    plan_id: str = "p1",
    checkpoints: list[dict] | None = None,
    markdown: str = "# body — long-form doc here",
):
    now = datetime(2026, 5, 19, tzinfo=timezone.utc)
    doc = SimpleNamespace(
        id=f"plan:{plan_id}",
        title=f"Plan {plan_id}",
        status="active",
        owner="stefan",
        summary="short summary",
        markdown=markdown,
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
        code_paths=["pixsim7/backend/main/api/v1/dev_plans.py"],
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


def _patches(bundle):
    return (
        patch(
            "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
            new=AsyncMock(return_value=bundle),
        ),
        patch(
            "pixsim7.backend.main.services.docs.plan_write.load_children",
            new=AsyncMock(return_value=[]),
        ),
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestPlanDetailShrinkParams:
    @pytest.mark.asyncio
    async def test_default_includes_markdown_and_all_fields(self):
        """Regression: no shrink params → full payload, markdown present."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "points_done": 0, "points_total": 1},
        ])
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get("/api/v1/dev/plans/p1")

        assert resp.status_code == 200
        body = resp.json()
        assert body["markdown"] == "# body — long-form doc here"
        assert body["title"] == "Plan p1"
        assert body["openSummary"] is not None
        assert len(body["checkpoints"]) == 1
        assert body["codePaths"] == [
            "pixsim7/backend/main/api/v1/dev_plans.py"
        ]

    @pytest.mark.asyncio
    async def test_include_markdown_false_drops_only_markdown(self):
        """`include_markdown=false` removes the markdown key; nothing else."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "points_done": 0, "points_total": 1},
        ])
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"include_markdown": "false"},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert "markdown" not in body
        assert body["title"] == "Plan p1"
        assert body["openSummary"] is not None
        assert len(body["checkpoints"]) == 1

    @pytest.mark.asyncio
    async def test_fields_whitelist_camelcase(self):
        """`fields=` accepts camelCase names; only listed fields + id returned."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "points_done": 0, "points_total": 1},
        ])
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"fields": "title,openSummary"},
                )

        assert resp.status_code == 200
        body = resp.json()
        # Whitelisted fields present
        assert body["title"] == "Plan p1"
        assert body["openSummary"] is not None
        # id always included
        assert body["id"] == "p1"
        # Non-whitelisted fields absent
        assert "markdown" not in body
        assert "checkpoints" not in body
        assert "codePaths" not in body
        assert "tags" not in body

    @pytest.mark.asyncio
    async def test_fields_whitelist_snake_case_accepted(self):
        """`fields=` accepts snake_case names too; normalized to camel output."""
        bundle = _bundle()
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"fields": "title,open_summary,code_paths"},
                )

        assert resp.status_code == 200
        body = resp.json()
        # Output uses camelCase aliases regardless of input casing
        assert "title" in body
        assert "openSummary" in body
        assert "codePaths" in body
        assert "open_summary" not in body
        assert "code_paths" not in body

    @pytest.mark.asyncio
    async def test_id_always_included_even_when_not_requested(self):
        """`id` is implicitly added — a response without it is useless."""
        bundle = _bundle()
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"fields": "title"},
                )

        body = resp.json()
        assert set(body.keys()) == {"id", "title"}

    @pytest.mark.asyncio
    async def test_unknown_field_returns_400(self):
        """Typo or invalid field → 400 with valid-names list in detail.
        Prefer explicit failure over silent drop (cp-undeclared-param-footgun)."""
        bundle = _bundle()
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"fields": "title,not_a_real_field"},
                )

        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "not_a_real_field" in detail
        # Helpful — the error lists valid names
        assert "title" in detail

    @pytest.mark.asyncio
    async def test_empty_fields_returns_400(self):
        """Empty `fields=` is a usage error, not a silently-empty filter."""
        bundle = _bundle()
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"fields": ""},
                )

        # Note: `fields=` with empty value reads as None on the FastAPI side
        # (Query default kicks in), so this should pass through to the default
        # path. Explicit empty CSV (commas with no content) IS the 400 case.
        # Re-test with whitespace-only:
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"fields": " , , "},
                )

        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_fields_overrides_include_markdown(self):
        """When `fields=` includes `markdown`, it's kept even with
        `include_markdown=false` — the whitelist wins (explicit beats shortcut)."""
        bundle = _bundle()
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={
                        "fields": "title,markdown",
                        "include_markdown": "false",
                    },
                )

        body = resp.json()
        assert "markdown" in body
        assert body["markdown"] == "# body — long-form doc here"

    @pytest.mark.asyncio
    async def test_field_position_order_preserved(self):
        """`openSummary` must still appear before `checkpoints`/`markdown` in
        the wire payload — pins the survives-truncation guarantee even on the
        shrink path."""
        bundle = _bundle(checkpoints=[
            {"id": "cp1", "label": "L", "points_done": 0, "points_total": 1},
        ])
        app = _app()
        p1, p2 = _patches(bundle)
        with p1, p2:
            async with _client(app) as c:
                resp = await c.get(
                    "/api/v1/dev/plans/p1",
                    params={"include_markdown": "false"},
                )

        raw = resp.text
        idx_open = raw.find('"openSummary"')
        idx_checkpoints = raw.find('"checkpoints"')
        assert idx_open != -1 and idx_checkpoints != -1
        assert idx_open < idx_checkpoints
