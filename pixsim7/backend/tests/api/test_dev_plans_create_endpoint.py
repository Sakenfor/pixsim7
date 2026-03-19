"""API tests for POST /dev/plans create endpoint."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_database,
    )
    from pixsim7.backend.main.api.v1.dev_plans import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(*, authenticated: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield SimpleNamespace()

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_user] = _deny
    else:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, role="user")

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


VALID_PAYLOAD = {
    "id": "test-plan",
    "title": "Test Plan",
    "summary": "A test plan",
}


def _mock_db_get(existing_plan_id: str | None = None):
    """Return an async callable for db.get that returns a plan only for existing_plan_id."""
    async def _get(model, pk):
        if existing_plan_id and pk == existing_plan_id:
            return SimpleNamespace(id=pk)
        return None
    return _get


def _make_mock_db(existing_plan_id: str | None = None):
    """Build a mock async DB session."""
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(side_effect=_mock_db_get(existing_plan_id))
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    return mock_db


# Patches for function-level imports inside create_plan endpoint body.
# emit_plan_created_notification and _git_commit are imported at call time,
# so we patch at the source module.
_PATCH_EMIT = "pixsim7.backend.main.services.docs.plan_write.emit_plan_created_notification"
_PATCH_GIT = "pixsim7.backend.main.services.docs.plan_write._git_commit"
_PATCH_SETTINGS = "pixsim7.backend.main.api.v1.dev_plans.settings"
_PATCH_EXPORT = "pixsim7.backend.main.api.v1.dev_plans.export_plan_to_disk"
_PATCH_MAKE_DOC_ID = "pixsim7.backend.main.api.v1.dev_plans.make_document_id"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansCreateEndpoint:
    """Tests for POST /api/v1/dev/plans."""

    @pytest.mark.asyncio
    async def test_create_success_minimal_payload(self):
        """Minimal valid payload creates plan with defaults."""
        app = _app()
        mock_db = _make_mock_db()

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans", json=VALID_PAYLOAD)

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "test-plan"
        assert body["documentId"] == "plan:test-plan"
        assert body["created"] is True
        assert body.get("exportError") is None

    @pytest.mark.asyncio
    async def test_create_success_all_fields(self):
        """Full payload with all optional fields accepted."""
        app = _app()
        mock_db = _make_mock_db()

        payload = {
            "id": "full-plan",
            "title": "Full Plan",
            "plan_type": "bugfix",
            "status": "blocked",
            "stage": "investigation",
            "owner": "alice",
            "priority": "high",
            "summary": "Full summary",
            "markdown": "# Full Plan\nContent here.",
            "task_scope": "system",
            "visibility": "private",
            "namespace": "custom/ns",
            "tags": ["important"],
            "code_paths": ["src/main.py"],
            "companions": [],
            "handoffs": [],
            "depends_on": ["other-plan"],
            "target": {"type": "system"},
            "checkpoints": [{"id": "cp1", "label": "Phase 1"}],
        }

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:full-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "full-plan"
        assert body["created"] is True

    # ── Enum validation tests ─────────────────────────────────────

    @pytest.mark.asyncio
    async def test_invalid_plan_type_rejected(self):
        """Invalid plan_type returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans",
                json={**VALID_PAYLOAD, "plan_type": "invalid_type"},
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert any("plan_type" in str(e) for e in detail)

    @pytest.mark.asyncio
    async def test_invalid_status_rejected(self):
        """Invalid status returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans",
                json={**VALID_PAYLOAD, "status": "archived"},
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert any("status" in str(e) for e in detail)

    @pytest.mark.asyncio
    async def test_invalid_priority_rejected(self):
        """Invalid priority returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans",
                json={**VALID_PAYLOAD, "priority": "critical"},
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert any("priority" in str(e) for e in detail)

    @pytest.mark.asyncio
    async def test_invalid_task_scope_rejected(self):
        """Invalid task_scope returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans",
                json={**VALID_PAYLOAD, "task_scope": "global"},
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert any("task_scope" in str(e) for e in detail)

    @pytest.mark.asyncio
    async def test_invalid_visibility_rejected(self):
        """Invalid visibility returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post(
                "/api/v1/dev/plans",
                json={**VALID_PAYLOAD, "visibility": "internal"},
            )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert any("visibility" in str(e) for e in detail)

    # ── Duplicate ID ──────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_duplicate_id_returns_409(self):
        """Creating a plan with an existing ID returns 409."""
        app = _app()
        mock_db = _make_mock_db(existing_plan_id="test-plan")

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans", json=VALID_PAYLOAD)

        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    # ── Blocked status scope behavior ─────────────────────────────

    @pytest.mark.asyncio
    async def test_blocked_status_gets_active_scope(self):
        """Blocked status should derive scope='active' via _status_to_scope."""
        app = _app()
        mock_db = _make_mock_db()
        added_objects = []
        original_add = mock_db.add
        def capture_add(obj):
            added_objects.append(obj)
            return original_add(obj)
        mock_db.add = capture_add

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans",
                    json={**VALID_PAYLOAD, "status": "blocked"},
                )

        assert response.status_code == 200
        plan_objs = [o for o in added_objects if hasattr(o, "scope") and hasattr(o, "plan_type")]
        assert len(plan_objs) == 1
        assert plan_objs[0].scope == "active"

    @pytest.mark.asyncio
    async def test_done_status_gets_done_scope(self):
        """Done status should derive scope='done'."""
        app = _app()
        mock_db = _make_mock_db()
        added_objects = []
        original_add = mock_db.add
        def capture_add(obj):
            added_objects.append(obj)
            return original_add(obj)
        mock_db.add = capture_add

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans",
                    json={**VALID_PAYLOAD, "status": "done"},
                )

        assert response.status_code == 200
        plan_objs = [o for o in added_objects if hasattr(o, "scope") and hasattr(o, "plan_type")]
        assert len(plan_objs) == 1
        assert plan_objs[0].scope == "done"

    @pytest.mark.asyncio
    async def test_parked_status_gets_parked_scope(self):
        """Parked status should derive scope='parked'."""
        app = _app()
        mock_db = _make_mock_db()
        added_objects = []
        original_add = mock_db.add
        def capture_add(obj):
            added_objects.append(obj)
            return original_add(obj)
        mock_db.add = capture_add

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans",
                    json={**VALID_PAYLOAD, "status": "parked"},
                )

        assert response.status_code == 200
        plan_objs = [o for o in added_objects if hasattr(o, "scope") and hasattr(o, "plan_type")]
        assert len(plan_objs) == 1
        assert plan_objs[0].scope == "parked"

    # ── Export failure observability ──────────────────────────────

    @pytest.mark.asyncio
    async def test_export_failure_is_non_fatal_and_observable(self):
        """Export failure should not prevent DB create; error surfaced in response."""
        app = _app()
        mock_db = _make_mock_db()

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=False)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
            patch(_PATCH_EXPORT, side_effect=RuntimeError("disk full")),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                # task_scope=plan (default) + plans_db_only_mode=False triggers export
                response = await c.post("/api/v1/dev/plans", json=VALID_PAYLOAD)

        assert response.status_code == 200
        body = response.json()
        assert body["created"] is True
        assert body["exportError"] is not None
        assert "disk full" in body["exportError"]

    @pytest.mark.asyncio
    async def test_export_skipped_in_db_only_mode(self):
        """In DB-only mode, no export attempted and no exportError."""
        app = _app()
        mock_db = _make_mock_db()

        with (
            patch(_PATCH_EMIT, new_callable=AsyncMock),
            patch(_PATCH_GIT, return_value=None),
            patch(_PATCH_SETTINGS, SimpleNamespace(plans_db_only_mode=True)),
            patch(_PATCH_MAKE_DOC_ID, return_value="plan:test-plan"),
        ):
            app.dependency_overrides[get_database] = lambda: mock_db
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans", json=VALID_PAYLOAD)

        assert response.status_code == 200
        body = response.json()
        assert body["created"] is True
        assert body["exportError"] is None
        assert body["commitSha"] is None

    # ── Required fields ──────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_missing_id_rejected(self):
        """Missing required id returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans", json={"title": "No ID"})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_title_rejected(self):
        """Missing required title returns 422."""
        app = _app()
        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans", json={"id": "no-title"})
        assert response.status_code == 422
