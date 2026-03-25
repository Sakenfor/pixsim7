"""API tests for Dev Plans review graph endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import dev_plans
    from pixsim7.backend.main.api.v1.dev_plans import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app(db_obj=None, *, authenticated: bool = True, principal=None) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    if db_obj is None:
        db_obj = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            flush=AsyncMock(),
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )

    async def _db():
        return db_obj

    app.dependency_overrides[get_database] = _db

    if not authenticated:
        async def _deny():
            raise HTTPException(status_code=401, detail="Not authenticated")

        app.dependency_overrides[get_current_user] = _deny
    else:
        app.dependency_overrides[get_current_user] = lambda: (
            principal
            if principal is not None
            else SimpleNamespace(
                id=1,
                role="user",
                source="user:1",
                actor_display_name="User 1",
                user_id=1,
                is_agent=False,
            )
        )

    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestDevPlansReviewGraph:
    @pytest.mark.asyncio
    async def test_create_review_round_rejects_invalid_plan_id(self):
        app = _app()
        payload = {"status": "open"}
        async with _client(app) as c:
            response = await c.post("/api/v1/dev/plans/reviews/BAD_PLAN/rounds", json=payload)
        assert response.status_code == 400
        assert "Invalid 'plan_id'" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_review_node_ref_requires_target(self):
        db = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            flush=AsyncMock(),
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )
        app = _app(db_obj=db)
        round_id = str(uuid4())
        payload = {
            "round_id": round_id,
            "kind": "review_comment",
            "author_role": "reviewer",
            "body": "Need evidence for checkpoint 2.",
            "refs": [
                {
                    "relation": "addresses",
                }
            ],
        }

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(
                dev_plans,
                "_load_review_round",
                new=AsyncMock(return_value=SimpleNamespace(id=uuid4(), plan_id="plan-a")),
            ),
            patch.object(dev_plans, "_load_causal_review_adjacency", new=AsyncMock(return_value={})),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/reviews/plan-a/nodes", json=payload)

        assert response.status_code == 400
        assert "target_node_id or target_plan_anchor" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_review_node_causal_requires_target_node(self):
        db = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            flush=AsyncMock(),
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )
        app = _app(db_obj=db)
        round_id = str(uuid4())
        payload = {
            "round_id": round_id,
            "kind": "review_comment",
            "author_role": "reviewer",
            "body": "This follows from checkpoint performance risk.",
            "refs": [
                {
                    "relation": "because_of",
                    "target_plan_anchor": {"selector": "checkpoint:phase_2"},
                }
            ],
        }

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(
                dev_plans,
                "_load_review_round",
                new=AsyncMock(return_value=SimpleNamespace(id=uuid4(), plan_id="plan-a")),
            ),
            patch.object(dev_plans, "_load_causal_review_adjacency", new=AsyncMock(return_value={})),
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/dev/plans/reviews/plan-a/nodes", json=payload)

        assert response.status_code == 400
        assert "requires target_node_id" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_review_round_concluded_requires_conclusion(self):
        db = SimpleNamespace(
            commit=AsyncMock(),
        )
        app = _app(db_obj=db)
        round_uuid = str(uuid4())

        round_row = SimpleNamespace(
            id=uuid4(),
            plan_id="plan-a",
            round_number=1,
            review_revision=3,
            status="open",
            note=None,
            conclusion=None,
            created_by="user:1",
            created_at=SimpleNamespace(isoformat=lambda: "2026-03-20T00:00:00+00:00"),
            updated_at=SimpleNamespace(isoformat=lambda: "2026-03-20T00:00:00+00:00"),
        )

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(dev_plans, "_load_review_round", new=AsyncMock(return_value=round_row)),
        ):
            async with _client(app) as c:
                response = await c.patch(
                    f"/api/v1/dev/plans/reviews/plan-a/rounds/{round_uuid}",
                    json={"status": "concluded"},
                )

        assert response.status_code == 400
        assert "require non-empty conclusion" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_review_round_tracks_agent_actor_fields(self):
        added_rows = []
        db = SimpleNamespace(
            add=lambda row: added_rows.append(row),
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )
        principal = SimpleNamespace(
            id=0,
            source="agent:assistant:codex",
            principal_type="agent",
            agent_id="assistant:codex",
            run_id="run-xyz-123",
            user_id=1,
            is_agent=True,
        )
        app = _app(db_obj=db, principal=principal)

        with patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/reviews/plan-a/rounds",
                    json={"status": "open", "note": "Need cross-agent review"},
                )

        assert response.status_code == 200
        body = response.json()
        assert body["createdBy"] == "agent:assistant:codex"
        assert body["actorPrincipalType"] == "agent"
        assert body["actorAgentId"] == "assistant:codex"
        assert body["actorRunId"] == "run-xyz-123"
        assert body["actorUserId"] == 1
        assert added_rows
        assert getattr(added_rows[0], "actor_run_id", None) == "run-xyz-123"

    @pytest.mark.asyncio
    async def test_create_review_request_tracks_requester_and_can_be_fulfilled(self):
        db = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )
        principal = SimpleNamespace(
            id=0,
            source="agent:assistant:codex",
            principal_type="agent",
            agent_id="assistant:codex",
            run_id="run-review-1",
            user_id=1,
            is_agent=True,
        )
        app = _app(db_obj=db, principal=principal)

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(
                dev_plans,
                "_list_live_bridge_agents",
                return_value=[
                    {
                        "agent_id": "assistant:claude",
                        "agent_type": "claude-cli",
                        "busy": False,
                        "active_tasks": 0,
                        "tasks_completed": 4,
                        "connected_at": None,
                    }
                ],
            ),
        ):
            async with _client(app) as c:
                create_response = await c.post(
                    "/api/v1/dev/plans/reviews/plan-a/requests",
                    json={
                        "title": "Re-review by Claude",
                        "body": "Please review after Codex feedback is addressed.",
                        "target_agent_id": "assistant:claude",
                    },
                )

        assert create_response.status_code == 200
        created = create_response.json()
        assert created["status"] == "open"
        assert created["requestedBy"] == "agent:assistant:codex"
        assert created["requestedByPrincipalType"] == "agent"
        assert created["requestedByAgentId"] == "assistant:codex"
        assert created["requestedByRunId"] == "run-review-1"
        assert created["targetMode"] == "session"
        assert created["dispatchState"] == "assigned"

        request_row = SimpleNamespace(
            id=uuid4(),
            plan_id="plan-a",
            round_id=None,
            title="Re-review by Claude",
            body="Please review after Codex feedback is addressed.",
            status="open",
            target_agent_id="assistant:claude",
            target_agent_type=None,
            requested_by="agent:assistant:codex",
            requested_by_principal_type="agent",
            requested_by_agent_id="assistant:codex",
            requested_by_run_id="run-review-1",
            requested_by_user_id=1,
            meta=None,
            resolution_note=None,
            resolved_node_id=None,
            resolved_by=None,
            resolved_by_principal_type=None,
            resolved_by_agent_id=None,
            resolved_by_run_id=None,
            resolved_by_user_id=None,
            created_at=SimpleNamespace(isoformat=lambda: "2026-03-20T00:00:00+00:00"),
            updated_at=SimpleNamespace(isoformat=lambda: "2026-03-20T00:00:00+00:00"),
            resolved_at=None,
        )

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(dev_plans, "_load_review_request", new=AsyncMock(return_value=request_row)),
        ):
            async with _client(app) as c:
                update_response = await c.patch(
                    f"/api/v1/dev/plans/reviews/plan-a/requests/{uuid4()}",
                    json={"status": "fulfilled", "resolution_note": "Completed by target reviewer."},
                )

        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["status"] == "fulfilled"
        assert updated["resolvedBy"] == "agent:assistant:codex"
        assert updated["resolvedByPrincipalType"] == "agent"
        assert updated["resolvedByAgentId"] == "assistant:codex"
        assert updated["resolvedByRunId"] == "run-review-1"

    @pytest.mark.asyncio
    async def test_list_review_assignees_returns_live_and_recent(self):
        app = _app()

        live_connected = [
            {
                "agent_id": "assistant:claude-live",
                "agent_type": "claude-cli",
                "busy": False,
                "active_tasks": 0,
                "tasks_completed": 12,
                "connected_at": None,
            }
        ]
        recent = [
            {
                "agent_id": "assistant:claude-live",
                "agent_type": "claude-cli",
                "last_seen_at": None,
            },
            {
                "agent_id": "assistant:codex-recent",
                "agent_type": "codex",
                "last_seen_at": None,
            },
        ]

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(dev_plans, "_list_live_bridge_agents", return_value=live_connected),
            patch.object(dev_plans, "_list_recent_review_agents", new=AsyncMock(return_value=recent)),
        ):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/reviews/plan-a/assignees")

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "plan-a"
        assert len(body["liveSessions"]) == 1
        assert body["liveSessions"][0]["agentId"] == "assistant:claude-live"
        assert body["liveSessions"][0]["targetMode"] == "session"
        assert len(body["recentAgents"]) == 1
        assert body["recentAgents"][0]["agentId"] == "assistant:codex-recent"
        assert body["recentAgents"][0]["targetMode"] == "recent_agent"

    @pytest.mark.asyncio
    async def test_create_review_request_reroutes_when_target_session_busy(self):
        db = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )
        app = _app(db_obj=db)

        live_agents = [
            {
                "agent_id": "assistant:busy",
                "agent_type": "claude-cli",
                "busy": True,
                "active_tasks": 1,
                "tasks_completed": 9,
                "connected_at": None,
            },
            {
                "agent_id": "assistant:idle",
                "agent_type": "claude-cli",
                "busy": False,
                "active_tasks": 0,
                "tasks_completed": 3,
                "connected_at": None,
            },
        ]

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(dev_plans, "_list_live_bridge_agents", return_value=live_agents),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/reviews/plan-a/requests",
                    json={
                        "title": "Busy target reroute",
                        "body": "Route to someone idle if target is busy.",
                        "target_mode": "session",
                        "target_session_id": "assistant:busy",
                        "queue_if_busy": False,
                        "auto_reroute_if_busy": True,
                    },
                )

        assert response.status_code == 200
        created = response.json()
        assert created["targetMode"] == "session"
        assert created["targetAgentId"] == "assistant:idle"
        assert created["targetSessionId"] == "assistant:idle"
        assert created["dispatchState"] == "assigned"
        assert created["dispatchReason"] == "target_session_busy_rerouted"

    @pytest.mark.asyncio
    async def test_dispatch_review_request_endpoint_returns_node_and_request(self):
        db = SimpleNamespace(
            add=lambda *_args, **_kwargs: None,
            flush=AsyncMock(),
            commit=AsyncMock(),
            execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)),
        )
        app = _app(db_obj=db)

        now = SimpleNamespace(isoformat=lambda: "2026-03-21T00:00:00+00:00")
        round_uuid = uuid4()
        node_uuid = uuid4()
        request_row = SimpleNamespace(
            id=uuid4(),
            plan_id="plan-a",
            round_id=round_uuid,
            title="Dispatch me",
            body="Please review this plan.",
            status="fulfilled",
            target_agent_id="assistant:claude",
            target_agent_type="claude-cli",
            requested_by="user:1",
            requested_by_principal_type="user",
            requested_by_agent_id=None,
            requested_by_run_id=None,
            requested_by_user_id=1,
            meta={
                "dispatch": {
                    "target_mode": "session",
                    "target_session_id": "assistant:claude",
                    "preferred_agent_id": None,
                    "target_profile_id": "assistant:claude",
                    "target_method": "remote",
                    "target_model_id": "anthropic:claude-3.5",
                    "target_provider": "anthropic",
                    "queue_if_busy": False,
                    "auto_reroute_if_busy": True,
                    "dispatch_state": "assigned",
                    "dispatch_reason": "target_session_idle",
                }
            },
            resolution_note="Auto-dispatched via remote.",
            resolved_node_id=node_uuid,
            resolved_by="agent:assistant:claude",
            resolved_by_principal_type="agent",
            resolved_by_agent_id="assistant:claude",
            resolved_by_run_id="session-1",
            resolved_by_user_id=1,
            created_at=now,
            updated_at=now,
            resolved_at=now,
        )
        node_row = SimpleNamespace(
            id=node_uuid,
            plan_id="plan-a",
            round_id=round_uuid,
            kind="agent_response",
            author_role="agent",
            body="Looks good after fixes.",
            severity=None,
            plan_anchor=None,
            meta=None,
            created_by="agent:assistant:claude",
            actor_principal_type="agent",
            actor_agent_id="assistant:claude",
            actor_run_id="session-1",
            actor_user_id=1,
            created_at=now,
            updated_at=now,
        )

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(dev_plans, "_load_review_request", new=AsyncMock(return_value=request_row)),
            patch.object(
                dev_plans,
                "_dispatch_review_request_execution",
                new=AsyncMock(
                    return_value={
                        "executed": True,
                        "message": "Review request dispatched and fulfilled.",
                        "duration_ms": 1234,
                        "request_row": request_row,
                        "node_row": node_row,
                        "error": None,
                    }
                ),
            ),
        ):
            async with _client(app) as c:
                response = await c.post(
                    f"/api/v1/dev/plans/reviews/plan-a/requests/{uuid4()}/dispatch",
                    json={},
                )

        assert response.status_code == 200
        body = response.json()
        assert body["executed"] is True
        assert body["request"]["status"] == "fulfilled"
        assert body["node"]["id"] == str(node_uuid)

    @pytest.mark.asyncio
    async def test_dispatch_tick_processes_open_requests(self):
        now = SimpleNamespace(isoformat=lambda: "2026-03-21T00:00:00+00:00")

        def _request_row(status: str = "open") -> SimpleNamespace:
            req_id = uuid4()
            return SimpleNamespace(
                id=req_id,
                plan_id="plan-a",
                round_id=None,
                title=f"Request {req_id.hex[:6]}",
                body="Please review.",
                status=status,
                target_agent_id="assistant:claude",
                target_agent_type="claude-cli",
                requested_by="user:1",
                requested_by_principal_type="user",
                requested_by_agent_id=None,
                requested_by_run_id=None,
                requested_by_user_id=1,
                meta={
                    "dispatch": {
                        "target_mode": "session",
                        "target_session_id": "assistant:claude",
                        "queue_if_busy": False,
                        "auto_reroute_if_busy": True,
                        "dispatch_state": "assigned",
                        "dispatch_reason": "target_session_idle",
                    }
                },
                resolution_note=None,
                resolved_node_id=None,
                resolved_by=None,
                resolved_by_principal_type=None,
                resolved_by_agent_id=None,
                resolved_by_run_id=None,
                resolved_by_user_id=None,
                created_at=now,
                updated_at=now,
                resolved_at=None,
            )

        req_a = _request_row("open")
        req_b = _request_row("open")

        db = SimpleNamespace(
            execute=AsyncMock(
                return_value=SimpleNamespace(
                    scalars=lambda: SimpleNamespace(all=lambda: [req_a, req_b]),
                    scalar_one_or_none=lambda: None,
                )
            ),
            commit=AsyncMock(),
            add=lambda *_args, **_kwargs: None,
        )
        app = _app(db_obj=db)

        req_a_done = _request_row("fulfilled")
        req_a_done.id = req_a.id
        req_a_done.plan_id = req_a.plan_id
        req_b_deferred = _request_row("open")
        req_b_deferred.id = req_b.id
        req_b_deferred.plan_id = req_b.plan_id
        req_b_deferred.meta = {
            "dispatch": {
                "target_mode": "session",
                "target_session_id": "assistant:claude",
                "queue_if_busy": False,
                "auto_reroute_if_busy": True,
                "dispatch_state": "queued",
                "dispatch_reason": "target_session_busy_queued",
            }
        }

        with (
            patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()),
            patch.object(
                dev_plans,
                "_dispatch_review_request_execution",
                new=AsyncMock(
                    side_effect=[
                        {
                            "executed": True,
                            "message": "done",
                            "duration_ms": 100,
                            "request_row": req_a_done,
                            "node_row": None,
                            "error": None,
                        },
                        {
                            "executed": False,
                            "message": "queued",
                            "duration_ms": None,
                            "request_row": req_b_deferred,
                            "node_row": None,
                            "error": None,
                        },
                    ]
                ),
            ),
        ):
            async with _client(app) as c:
                response = await c.post(
                    "/api/v1/dev/plans/reviews/dispatch/tick",
                    json={"plan_id": "plan-a", "limit": 5},
                )

        assert response.status_code == 200
        body = response.json()
        assert body["attempted"] == 2
        assert body["processed"] == 1
        assert len(body["items"]) == 2
        assert body["items"][0]["executed"] is True
        assert body["items"][1]["executed"] is False

    @pytest.mark.asyncio
    async def test_list_plan_participants_groups_builders_and_reviewers(self):
        now = datetime(2026, 3, 21, tzinfo=timezone.utc)
        rows = [
            SimpleNamespace(
                id=uuid4(),
                plan_id="plan-a",
                role="builder",
                principal_type="agent",
                agent_id="assistant:codex",
                agent_type="codex",
                profile_id="assistant:codex",
                run_id="run-build-1",
                session_id=None,
                user_id=1,
                touches=3,
                last_action="update_plan",
                first_seen_at=now,
                last_seen_at=now,
                meta={"changed_fields": ["stage", "status"]},
            ),
            SimpleNamespace(
                id=uuid4(),
                plan_id="plan-a",
                role="reviewer",
                principal_type="agent",
                agent_id="assistant:claude",
                agent_type="claude-cli",
                profile_id="assistant:claude",
                run_id="run-review-2",
                session_id="session-abc",
                user_id=1,
                touches=2,
                last_action="dispatch_review_request",
                first_seen_at=now,
                last_seen_at=now,
                meta={"request_id": "req-1"},
            ),
        ]
        db = SimpleNamespace(
            execute=AsyncMock(
                return_value=SimpleNamespace(
                    scalars=lambda: SimpleNamespace(all=lambda: rows),
                    scalar_one_or_none=lambda: None,
                )
            )
        )
        app = _app(db_obj=db)

        with patch.object(dev_plans, "_ensure_plan_exists", new=AsyncMock()):
            async with _client(app) as c:
                response = await c.get("/api/v1/dev/plans/plan-a/participants")

        assert response.status_code == 200
        body = response.json()
        assert body["planId"] == "plan-a"
        assert len(body["participants"]) == 2
        assert len(body["builders"]) == 1
        assert len(body["reviewers"]) == 1
        assert body["builders"][0]["agentId"] == "assistant:codex"
        assert body["reviewers"][0]["sessionId"] == "session-abc"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_graph_has_path():
    a = uuid4()
    b = uuid4()
    c = uuid4()
    adjacency = {
        a: {b},
        b: {c},
        c: set(),
    }
    assert dev_plans._graph_has_path(adjacency, a, c) is True
    assert dev_plans._graph_has_path(adjacency, c, a) is False
