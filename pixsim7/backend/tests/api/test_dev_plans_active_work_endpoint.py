"""API tests for /dev/plans/active-work/{plan_id} checkpoint inference."""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-plans-active-work",
    "label": "Dev Plans Active Work Endpoint",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-progress",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_plans.py",
    ],
    "order": 42.1,
}

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


def _fake_db():
    ns = SimpleNamespace()
    ns.execute = AsyncMock()
    return ns


def _app() -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield _fake_db()

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
        id=123,
        role="user",
        username="user123",
    )
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansActiveWorkEndpoint:
    @pytest.mark.asyncio
    async def test_active_work_returns_rich_checkpoint_metadata_for_active_status(self):
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "phase_4",
                        "label": "Phase 4",
                        "status": "active",
                        "points_done": 3,
                        "points_total": 5,
                        "tests": ["entity-crud-policy-router"],
                        "evidence": [
                            {"kind": "test_suite", "ref": "entity-crud-policy-router"},
                            {"kind": "test_suite", "ref": "dev-plans-active-work"},
                            {"kind": "file_path", "ref": "pixsim7/backend/main/api/v1/dev_plans.py"},
                        ],
                        "steps": [
                            {
                                "id": "p4-link-tests",
                                "label": "Link tests to checkpoint",
                                "done": True,
                                "tests": ["dev-plans-active-work"],
                            },
                            {
                                "label": "Surface checkpoint details",
                                "status": "pending",
                            },
                        ],
                        "last_update": {"at": "2026-04-03T10:00:00Z"},
                    }
                ]
            )
        )

        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.services.audit.list_entity_audit_events",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/active-work/plan-policy-v2")

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "plan-policy-v2"
        assert len(body["activeCheckpoints"]) == 1

        checkpoint = body["activeCheckpoints"][0]
        assert checkpoint["checkpoint_id"] == "phase_4"
        assert checkpoint["confidence"] == "high"
        assert checkpoint["status"] == "active"
        assert checkpoint["points_done"] == 3
        assert checkpoint["points_total"] == 5
        assert checkpoint["evidence_count"] == 3
        assert checkpoint["tests"] == [
            "entity-crud-policy-router",
            "dev-plans-active-work",
        ]
        assert checkpoint["steps"][0]["step_id"] == "p4-link-tests"
        assert checkpoint["steps"][0]["done"] is True
        assert checkpoint["steps"][1]["label"] == "Surface checkpoint details"

    @pytest.mark.asyncio
    async def test_active_work_falls_back_to_latest_checkpoint_when_no_active_or_audit_match(self):
        app = _app()
        bundle = SimpleNamespace(
            plan=SimpleNamespace(
                checkpoints=[
                    {
                        "id": "phase_1",
                        "label": "Phase 1",
                        "status": "done",
                        "last_update": {"at": "2026-04-01T10:00:00Z"},
                    },
                    {
                        "id": "phase_2",
                        "label": "Phase 2",
                        "status": "pending",
                        "points_done": 1,
                        "points_total": 4,
                        "last_update": {"at": "2026-04-03T12:15:00Z"},
                    },
                ]
            )
        )

        with (
            patch(
                "pixsim7.backend.main.api.v1.dev_plans.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch(
                "pixsim7.backend.main.services.audit.list_entity_audit_events",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/active-work/plan-policy-v2")

        assert response.status_code == 200
        checkpoint = response.json()["activeCheckpoints"][0]
        assert checkpoint["checkpoint_id"] == "phase_2"
        assert checkpoint["confidence"] == "low"
        assert checkpoint["reason"] == "Most recently updated checkpoint"
        assert checkpoint["points_done"] == 1
        assert checkpoint["points_total"] == 4
