"""Tests for explicit plan-participant claim / release (plan
``plan-participant-liveness``, checkpoint ``claim-endpoint``).

Covers the pure claim predicates, the claim/release helpers, the
run-end auto-release hook, and the /claim & /release endpoints."""
from __future__ import annotations

TEST_SUITE = {
    "id": "plan-participant-claims",
    "label": "Plan Participant Claims",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "plan-participants",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/helpers.py",
        "pixsim7/backend/main/api/v1/plans/routes_agent.py",
        "pixsim7/backend/main/services/audit/agent_tracking.py",
    ],
    "order": 44,
}

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    import httpx
    from fastapi import FastAPI, HTTPException
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


def _participant(**overrides) -> "PlanParticipant":
    now = utcnow()
    base = dict(
        plan_id="plan-a",
        role="builder",
        principal_type="agent",
        agent_id="agent-1",
        run_id="run-1",
        first_seen_at=now,
        last_seen_at=now,
        last_heartbeat_at=now,
        touches=1,
    )
    base.update(overrides)
    return PlanParticipant(**base)


def _open_claim(checkpoint_id="cp1"):
    return {"checkpoint_id": checkpoint_id, "claimed_at": utcnow().isoformat(), "released_at": None}


def _result(rows):
    return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestClaimPredicates:
    def test_participant_claim_and_open(self):
        row = _participant(meta={"claim": _open_claim()})
        claim = _h.participant_claim(row)
        assert claim and _h.claim_is_open(claim) is True

    def test_released_claim_is_closed(self):
        claim = {**_open_claim(), "released_at": utcnow().isoformat()}
        assert _h.claim_is_open(claim) is False
        assert _h.participant_claim(_participant(meta={})) is None

    def test_live_claimant_requires_open_fresh_matching(self):
        row = _participant(meta={"claim": _open_claim("cp1")})
        assert _h.participant_is_live_claimant(row, checkpoint_id="cp1") is True
        # checkpoint mismatch
        assert _h.participant_is_live_claimant(row, checkpoint_id="cp2") is False
        # checkpoint_id=None matches any
        assert _h.participant_is_live_claimant(row, checkpoint_id=None) is True

    def test_live_claimant_false_when_stale_or_terminal(self):
        stale = utcnow() - timedelta(hours=2)
        stale_row = _participant(
            last_seen_at=stale, last_heartbeat_at=stale, meta={"claim": _open_claim()}
        )
        assert _h.participant_is_live_claimant(stale_row, checkpoint_id="cp1") is False
        fresh_row = _participant(meta={"claim": _open_claim()})
        assert (
            _h.participant_is_live_claimant(
                fresh_row, checkpoint_id="cp1", run_terminal=True
            )
            is False
        )

    def test_actor_owns_participant(self):
        row = _participant(agent_id="a1", run_id="r1")
        assert _h._actor_owns_participant(row, {"agent_id": "a1", "run_id": "r1"}) is True
        assert _h._actor_owns_participant(row, {"agent_id": "a1", "run_id": "r2"}) is False
        user_row = _participant(agent_id=None, run_id=None, user_id=7, principal_type="user")
        assert _h._actor_owns_participant(user_row, {"user_id": 7}) is True


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestClaimHelpers:
    @pytest.mark.asyncio
    async def test_claim_returns_own_row_and_surfaces_conflict(self):
        own = _participant(agent_id="agent-1", run_id="run-1", meta={"claim": _open_claim("cp1")})
        rival = _participant(agent_id="agent-2", run_id="run-2", meta={"claim": _open_claim("cp1")})
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[_result([own, rival]), _result([])]),
            flush=AsyncMock(),
            add=lambda o: None,
        )
        principal = SimpleNamespace(
            principal_type="agent", agent_id="agent-1", run_id="run-1",
            agent_type="claude", user_id=None,
        )
        with patch.object(
            _h, "_record_plan_participant_from_principal", new=AsyncMock()
        ) as rec:
            own_row, conflicts = await _h.claim_checkpoint(
                db, principal=principal, plan_id="plan-a", checkpoint_id="cp1"
            )
        rec.assert_awaited_once()
        assert own_row is own
        assert [c.agent_id for c in conflicts] == ["agent-2"]

    @pytest.mark.asyncio
    async def test_claim_no_conflict_when_rival_run_terminal(self):
        own = _participant(agent_id="agent-1", run_id="run-1", meta={"claim": _open_claim("cp1")})
        rival = _participant(agent_id="agent-2", run_id="run-2", meta={"claim": _open_claim("cp1")})
        db = SimpleNamespace(
            execute=AsyncMock(side_effect=[_result([own, rival]), _result(["run-2"])]),
            flush=AsyncMock(),
            add=lambda o: None,
        )
        principal = SimpleNamespace(
            principal_type="agent", agent_id="agent-1", run_id="run-1",
            agent_type="claude", user_id=None,
        )
        with patch.object(_h, "_record_plan_participant_from_principal", new=AsyncMock()):
            _own, conflicts = await _h.claim_checkpoint(
                db, principal=principal, plan_id="plan-a", checkpoint_id="cp1"
            )
        assert conflicts == []  # rival's run is terminal -> not a live claimant

    @pytest.mark.asyncio
    async def test_release_closes_only_callers_matching_claim(self):
        mine = _participant(agent_id="agent-1", run_id="run-1", meta={"claim": _open_claim("cp1")})
        mine_other_cp = _participant(
            agent_id="agent-1", run_id="run-1", meta={"claim": _open_claim("cp2")}
        )
        not_mine = _participant(agent_id="agent-9", run_id="run-9", meta={"claim": _open_claim("cp1")})
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_result([mine, mine_other_cp, not_mine]))
        )
        principal = SimpleNamespace(
            principal_type="agent", agent_id="agent-1", run_id="run-1",
            agent_type="claude", user_id=None,
        )
        released = await _h.release_checkpoint(
            db, principal=principal, plan_id="plan-a", checkpoint_id="cp1"
        )
        assert released == 1
        assert mine.meta["claim"]["released_at"]  # closed
        assert mine_other_cp.meta["claim"]["released_at"] is None  # different cp
        assert not_mine.meta["claim"]["released_at"] is None  # different agent

    @pytest.mark.asyncio
    async def test_release_claims_for_run_closes_open_only(self):
        open_row = _participant(run_id="run-x", meta={"claim": _open_claim()})
        already = _participant(
            run_id="run-x",
            meta={"claim": {**_open_claim(), "released_at": utcnow().isoformat()}},
        )
        db = SimpleNamespace(execute=AsyncMock(return_value=_result([open_row, already])))
        n = await _h.release_claims_for_run(db, "run-x")
        assert n == 1
        assert open_row.meta["claim"]["released_at"]
        assert open_row.last_action == "release:run_end"

    @pytest.mark.asyncio
    async def test_release_claims_for_run_noop_without_run_id(self):
        db = SimpleNamespace(execute=AsyncMock())
        assert await _h.release_claims_for_run(db, "") == 0
        db.execute.assert_not_awaited()


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestRunEndHook:
    @pytest.mark.asyncio
    async def test_complete_run_triggers_release(self):
        from pixsim7.backend.main.services.audit.agent_tracking import (
            AgentTrackingService,
        )

        run = SimpleNamespace(
            run_id="run-x", status="running", profile_id="prof-1", summary=None,
            ended_at=None,
        )
        db = SimpleNamespace(
            execute=AsyncMock(
                return_value=SimpleNamespace(scalar_one_or_none=lambda: run)
            )
        )
        svc = AgentTrackingService(db)
        with (
            patch.object(svc._audit, "record", new=AsyncMock()),
            patch(
                "pixsim7.backend.main.api.v1.plans.helpers.release_claims_for_run",
                new=AsyncMock(return_value=2),
            ) as rel,
        ):
            await svc.complete_run("run-x", status="completed")
        rel.assert_awaited_once()
        assert rel.await_args.args[1] == "run-x"


def _app(principal=None) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/dev/plans")

    db = SimpleNamespace(commit=AsyncMock())

    async def _db():
        yield db

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_principal] = lambda: (
        principal
        or RequestPrincipal(
            id=0, role="agent", principal_type="agent", agent_id="agent-1",
            username="agent:agent-1", on_behalf_of=1,
        )
    )
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestClaimEndpoints:
    @pytest.mark.asyncio
    async def test_claim_returns_conflicts_without_rejection(self):
        app = _app()
        own = _participant(meta={"claim": _open_claim("cp1")})
        rival = _participant(
            agent_id="agent-2", run_id="run-2", meta={"claim": _open_claim("cp1")}
        )
        with (
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_bundle",
                new=AsyncMock(return_value=SimpleNamespace(id="plan-a")),
            ),
            patch.object(
                _h, "claim_checkpoint",
                new=AsyncMock(return_value=(own, [rival])),
            ),
        ):
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/claim", json={"checkpoint_id": "cp1"})

        assert r.status_code == 200
        body = r.json()
        assert body["claimed"] is True
        assert body["checkpoint_id"] == "cp1"
        assert len(body["conflicts"]) == 1
        assert body["conflicts"][0]["agent_id"] == "agent-2"
        assert body["conflicts"][0]["checkpoint_id"] == "cp1"

    @pytest.mark.asyncio
    async def test_claim_404_when_plan_missing(self):
        app = _app()
        with patch(
            "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_bundle",
            new=AsyncMock(return_value=None),
        ):
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/ghost/claim", json={})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_release_reports_count(self):
        app = _app()
        with (
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_bundle",
                new=AsyncMock(return_value=SimpleNamespace(id="plan-a")),
            ),
            patch.object(_h, "release_checkpoint", new=AsyncMock(return_value=2)),
        ):
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/release", json={})
        assert r.status_code == 200
        assert r.json()["released"] == 2
