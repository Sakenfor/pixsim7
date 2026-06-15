"""Tests for the cross-plan active-agent roster (plan
``plan-participant-liveness``, checkpoint ``cross-plan-roster``).

GET /dev/plans/active-agents — non-stale, run-not-terminal participants
grouped by plan. Verifies stale + terminal exclusion, grouping, ordering
and claim/heartbeat-age extraction."""
from __future__ import annotations

TEST_SUITE = {
    "id": "plan-active-agents-roster",
    "label": "Plan Active Agents Roster",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-participants",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/helpers.py",
        "pixsim7/backend/main/api/v1/plans/routes_agent.py",
    ],
    "order": 45,
}

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import (
        get_current_principal,
        get_database,
    )
    from pixsim7.backend.main.api.v1.plans import helpers as _h
    from pixsim7.backend.main.api.v1.plans.routes_agent import router
    from pixsim7.backend.main.domain.docs.models import PlanParticipant
    from pixsim7.backend.main.shared.actor import RequestPrincipal
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _p(plan_id, age_seconds, *, run_id, claim=None, agent_id="a", role="builder"):
    t = utcnow() - timedelta(seconds=age_seconds)
    return PlanParticipant(
        id=uuid4(),
        plan_id=plan_id,
        role=role,
        principal_type="agent",
        agent_id=agent_id,
        agent_type="claude",
        run_id=run_id,
        first_seen_at=t,
        last_seen_at=t,
        last_heartbeat_at=t,
        touches=1,
        meta=({"claim": claim} if claim else None),
    )


def _open_claim(cp):
    return {"checkpoint_id": cp, "claimed_at": utcnow().isoformat(), "released_at": None}


class _Result:
    """Flexible result stub: supports both .scalars().all() and .all()."""

    def __init__(self, *, scalars=None, rows=None):
        self._scalars = scalars if scalars is not None else []
        self._rows = rows if rows is not None else []

    def scalars(self):
        return SimpleNamespace(all=lambda: self._scalars)

    def all(self):
        return self._rows


def _app(db):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/dev/plans")

    async def _db():
        yield db

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: RequestPrincipal(
        id=1, role="user", username="user1"
    )
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestRosterHelpers:
    @pytest.mark.asyncio
    async def test_list_active_participants_noop_without_db(self):
        assert await _h.list_active_participants(SimpleNamespace()) == []

    @pytest.mark.asyncio
    async def test_resolve_plan_titles_empty_skips_query(self):
        db = SimpleNamespace(execute=AsyncMock())
        assert await _h.resolve_plan_titles(db, set()) == {}
        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_resolve_plan_titles_maps_rows(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_Result(rows=[("plan-a", "Plan A")]))
        )
        assert await _h.resolve_plan_titles(db, {"plan-a"}) == {"plan-a": "Plan A"}


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestActiveAgentsEndpoint:
    @pytest.mark.asyncio
    async def test_roster_groups_excludes_stale_and_terminal(self):
        fresh_a1 = _p("plan-a", 5, run_id="run-1", claim=_open_claim("cp1"), agent_id="a1")
        fresh_a2 = _p("plan-a", 30, run_id="run-2", agent_id="a2")
        stale = _p("plan-a", 3 * 3600, run_id="run-3", agent_id="old")  # > TTL
        terminal = _p("plan-b", 10, run_id="run-term", agent_id="t")
        fresh_b = _p("plan-b", 8, run_id="run-4", claim=_open_claim("cp9"), agent_id="b1")
        rows = [fresh_a1, fresh_a2, stale, terminal, fresh_b]

        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    _Result(scalars=[]),  # sweep_idle_claims (nothing to release)
                    _Result(scalars=rows),  # list_active_participants
                    _Result(scalars=["run-term"]),  # load_terminal_run_ids
                    _Result(rows=[("plan-a", "Plan A"), ("plan-b", "Plan B")]),  # titles
                ]
            )
        )
        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/dev/plans/active-agents")

        assert r.status_code == 200
        body = r.json()
        assert body["total_active"] == 3  # a1, a2, b1 (stale + terminal dropped)
        plans = {g["plan_id"]: g for g in body["plans"]}
        assert plans["plan-a"]["active_count"] == 2
        assert plans["plan-a"]["plan_title"] == "Plan A"
        assert plans["plan-b"]["active_count"] == 1
        # Busiest plan first
        assert body["plans"][0]["plan_id"] == "plan-a"
        # Claim surfaced; agents sorted by freshest heartbeat first
        a_agents = plans["plan-a"]["agents"]
        assert a_agents[0]["agent_id"] == "a1"
        assert a_agents[0]["claimed"] is True
        assert a_agents[0]["checkpoint_id"] == "cp1"
        assert a_agents[0]["heartbeat_age_seconds"] >= 0
        assert a_agents[1]["claimed"] is False

    @pytest.mark.asyncio
    async def test_roster_empty_when_no_active(self):
        stale = _p("plan-a", 5 * 3600, run_id="run-x")
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    _Result(scalars=[]),  # sweep_idle_claims (nothing to release)
                    _Result(scalars=[stale]),
                    _Result(scalars=[]),
                    _Result(rows=[]),
                ]
            )
        )
        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/dev/plans/active-agents")
        assert r.status_code == 200
        body = r.json()
        assert body["total_active"] == 0
        assert body["plans"] == []
