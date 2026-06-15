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
    from pixsim7.backend.main.api.v1.plans.routes_agent import (
        router,
        _resolve_claim_session_id,
    )
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
class TestSweepIdleClaims:
    """Idle-release sweep: an open claim whose agent went idle without a
    terminal run is auto-released so the persisted record matches the roster.
    Plan ``plan-participant-liveness`` checkpoint ``claim-idle-release-and-ttl-settings``."""

    @pytest.mark.asyncio
    async def test_sweep_releases_idle_open_claim(self):
        idle = utcnow() - timedelta(hours=2)
        row = _participant(
            last_seen_at=idle, last_heartbeat_at=idle, meta={"claim": _open_claim()}
        )
        db = SimpleNamespace(execute=AsyncMock(return_value=_result([row])))
        n = await _h.sweep_idle_claims(db)
        assert n == 1
        assert row.meta["claim"]["released_at"]  # closed
        assert row.last_action == "release:idle"

    @pytest.mark.asyncio
    async def test_sweep_skips_fresh_released_and_unclaimed(self):
        idle = utcnow() - timedelta(hours=2)
        fresh = _participant(meta={"claim": _open_claim()})  # within stale TTL
        already = _participant(
            last_seen_at=idle,
            last_heartbeat_at=idle,
            meta={"claim": {**_open_claim(), "released_at": utcnow().isoformat()}},
        )
        no_claim = _participant(last_seen_at=idle, last_heartbeat_at=idle, meta={})
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_result([fresh, already, no_claim]))
        )
        n = await _h.sweep_idle_claims(db)
        assert n == 0
        assert fresh.meta["claim"]["released_at"] is None

    @pytest.mark.asyncio
    async def test_sweep_idle_ttl_clamped_to_stale_floor(self, monkeypatch):
        # A sub-stale idle override must not release a still-live claimant: the
        # idle TTL is clamped to never drop below the stale TTL.
        monkeypatch.setenv("PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES", "15")
        monkeypatch.setenv("PIXSIM_PLAN_CLAIM_IDLE_RELEASE_MINUTES", "1")
        recent = utcnow() - timedelta(minutes=5)  # stale<15? no — still live
        row = _participant(
            last_seen_at=recent, last_heartbeat_at=recent, meta={"claim": _open_claim()}
        )
        db = SimpleNamespace(execute=AsyncMock(return_value=_result([row])))
        n = await _h.sweep_idle_claims(db)
        assert n == 0
        assert row.meta["claim"]["released_at"] is None


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestLivenessTtlResolution:
    """Effective TTL precedence (runtime override > env > default) and the
    idle-release clamp. The runtime override is what PATCH /dev/plans/settings
    writes onto the process-global settings object. Plan
    ``plan-participant-liveness`` checkpoint ``claim-idle-release-and-ttl-settings``."""

    @staticmethod
    def _clear_env(monkeypatch):
        monkeypatch.delenv("PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES", raising=False)
        monkeypatch.delenv("PIXSIM_PLAN_CLAIM_IDLE_RELEASE_MINUTES", raising=False)

    @staticmethod
    def _settings():
        from pixsim7.backend.main.shared.config import settings

        return settings

    def test_defaults_when_unset(self, monkeypatch):
        self._clear_env(monkeypatch)
        monkeypatch.setattr(self._settings(), "plan_participant_stale_minutes", None)
        monkeypatch.setattr(self._settings(), "plan_claim_idle_release_minutes", None)
        assert _h.participant_stale_minutes() == 15.0
        # idle defaults to the stale TTL
        assert _h.claim_idle_release_minutes() == 15.0

    def test_runtime_override_beats_env(self, monkeypatch):
        monkeypatch.setenv("PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES", "20")
        monkeypatch.setattr(self._settings(), "plan_participant_stale_minutes", 45.0)
        # runtime (45) wins over env (20)
        assert _h.participant_stale_minutes() == 45.0

    def test_env_used_when_no_runtime_override(self, monkeypatch):
        monkeypatch.setenv("PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES", "25")
        monkeypatch.setattr(self._settings(), "plan_participant_stale_minutes", None)
        assert _h.participant_stale_minutes() == 25.0

    def test_idle_override_applies_and_clamps_to_stale_floor(self, monkeypatch):
        self._clear_env(monkeypatch)
        monkeypatch.setattr(self._settings(), "plan_participant_stale_minutes", 30.0)
        # idle override above the floor is honoured
        monkeypatch.setattr(self._settings(), "plan_claim_idle_release_minutes", 90.0)
        assert _h.claim_idle_release_minutes() == 90.0
        # idle override below the stale floor is clamped up to it
        monkeypatch.setattr(self._settings(), "plan_claim_idle_release_minutes", 5.0)
        assert _h.claim_idle_release_minutes() == 30.0


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

    db = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock())

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


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestClaimSessionResolution:
    """The claim must stamp the caller's chat session so the tab groups under
    the plan (plan ``tab-identity-mode``). Bridge tokens carry no session
    claim, so the binding arrives via the principal (recovered from X-* headers
    in ``from_jwt_payload``) or via a ``tab:`` scope_key."""

    @pytest.mark.asyncio
    async def test_chat_session_id_wins(self):
        principal = SimpleNamespace(
            chat_session_id="sess-1", scope_key="tab:11111111-1111-1111-1111-111111111111",
        )
        db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(session_id="from-tab")))
        assert await _resolve_claim_session_id(db, principal) == "sess-1"
        db.get.assert_not_awaited()  # no tab lookup needed

    @pytest.mark.asyncio
    async def test_tab_id_claim_resolves(self):
        """tab_id claim is the primary anchor — works for plan-scoped tabs
        (scope_key='plan:<id>') and on turn 1 (no chat_session_id yet)."""
        principal = SimpleNamespace(
            chat_session_id=None,
            scope_key="plan:foo",
            tab_id="11111111-1111-1111-1111-111111111111",
        )
        db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(session_id="from-tab")))
        assert await _resolve_claim_session_id(db, principal) == "from-tab"
        db.get.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_scope_key_tab_fallback(self):
        principal = SimpleNamespace(
            chat_session_id=None, scope_key="tab:11111111-1111-1111-1111-111111111111",
        )
        db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(session_id="from-tab")))
        assert await _resolve_claim_session_id(db, principal) == "from-tab"

    @pytest.mark.asyncio
    async def test_headless_and_non_tab_scope_return_none(self):
        db = SimpleNamespace(get=AsyncMock())
        assert await _resolve_claim_session_id(
            db, SimpleNamespace(chat_session_id=None, scope_key=None)
        ) is None
        assert await _resolve_claim_session_id(
            db, SimpleNamespace(chat_session_id=None, scope_key="plan:foo")
        ) is None
        db.get.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_malformed_tab_uuid_returns_none(self):
        db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(session_id="x")))
        assert await _resolve_claim_session_id(
            db, SimpleNamespace(chat_session_id=None, scope_key="tab:not-a-uuid")
        ) is None

    @pytest.mark.asyncio
    async def test_claim_endpoint_stamps_session_id(self):
        principal = RequestPrincipal(
            id=0, role="agent", principal_type="agent", agent_id="agent-1",
            username="agent:agent-1", on_behalf_of=1, chat_session_id="sess-xyz",
        )
        app = _app(principal=principal)
        own = _participant(meta={"claim": _open_claim("cp1")})
        with (
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_bundle",
                new=AsyncMock(return_value=SimpleNamespace(id="plan-a")),
            ),
            patch.object(
                _h, "claim_checkpoint", new=AsyncMock(return_value=(own, []))
            ) as claim_mock,
            patch.object(_h, "maybe_tab_identity_nudge", new=AsyncMock(return_value=None)),
        ):
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/claim", json={"checkpoint_id": "cp1"})
        assert r.status_code == 200
        assert claim_mock.await_args.kwargs.get("session_id") == "sess-xyz"


def _scalar_result(value):
    return SimpleNamespace(scalar_one_or_none=lambda: value)


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAutoClaim:
    """Implicit plan-level claim on mutating callsites (option E)."""

    @pytest.mark.asyncio
    async def test_create_path_with_auto_claim_sets_open_claim(self):
        added = []
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_scalar_result(None)),
            add=lambda o: added.append(o),
        )
        await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="update_plan",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1, auto_claim=True,
        )
        assert len(added) == 1
        row = added[0]
        claim = (row.meta or {}).get("claim")
        assert claim is not None
        assert claim["checkpoint_id"] is None
        assert claim["released_at"] is None

    @pytest.mark.asyncio
    async def test_update_path_with_auto_claim_sets_claim_when_absent(self):
        existing = _participant(meta={"other_key": "preserved"})
        db = SimpleNamespace(execute=AsyncMock(return_value=_scalar_result(existing)))
        await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="update_plan",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1, auto_claim=True,
        )
        claim = existing.meta.get("claim")
        assert claim is not None and _h.claim_is_open(claim)
        assert existing.meta.get("other_key") == "preserved"

    @pytest.mark.asyncio
    async def test_update_path_with_auto_claim_does_not_stomp_existing_claim(self):
        existing_claim = _open_claim("cp-explicit")
        existing = _participant(meta={"claim": existing_claim})
        db = SimpleNamespace(execute=AsyncMock(return_value=_scalar_result(existing)))
        await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="update_plan",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1, auto_claim=True,
        )
        # specific checkpoint claim must win over auto's checkpoint_id=None
        assert existing.meta["claim"]["checkpoint_id"] == "cp-explicit"
        assert existing.meta["claim"]["claimed_at"] == existing_claim["claimed_at"]

    @pytest.mark.asyncio
    async def test_update_path_replaces_released_claim_on_new_mutation(self):
        released = {**_open_claim("cp-old"), "released_at": utcnow().isoformat()}
        existing = _participant(meta={"claim": released})
        db = SimpleNamespace(execute=AsyncMock(return_value=_scalar_result(existing)))
        await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="update_plan",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1, auto_claim=True,
        )
        # released claim is not "open" so auto_claim re-opens with checkpoint_id=None
        claim = existing.meta["claim"]
        assert claim["checkpoint_id"] is None
        assert claim["released_at"] is None

    @pytest.mark.asyncio
    async def test_no_auto_claim_does_not_set_claim(self):
        added = []
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_scalar_result(None)),
            add=lambda o: added.append(o),
        )
        await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="touch_only",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1,
            # auto_claim defaults to False
        )
        assert len(added) == 1
        meta = added[0].meta
        assert meta is None or "claim" not in meta

    @pytest.mark.asyncio
    async def test_from_principal_threads_auto_claim(self):
        principal = SimpleNamespace(
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1,
        )
        with patch.object(_h, "_record_plan_participant", new=AsyncMock()) as rec:
            await _h._record_plan_participant_from_principal(
                None, plan_id="plan-a", role="builder", action="update_plan",
                principal=principal, auto_claim=True,
            )
        rec.assert_awaited_once()
        assert rec.await_args.kwargs.get("auto_claim") is True

    @pytest.mark.asyncio
    async def test_returns_true_when_auto_claim_opens_fresh(self):
        """The bool return lets callers fire a one-shot tab-identity nudge
        only when this mutation is what opened the claim. Plan
        ``tab-identity-mode``."""
        added = []
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_scalar_result(None)),
            add=lambda o: added.append(o),
        )
        opened = await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="update_plan",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1, auto_claim=True,
        )
        assert opened is True

    @pytest.mark.asyncio
    async def test_returns_false_when_existing_open_claim(self):
        existing = _participant(meta={"claim": _open_claim("cp-explicit")})
        db = SimpleNamespace(execute=AsyncMock(return_value=_scalar_result(existing)))
        opened = await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="update_plan",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1, auto_claim=True,
        )
        # Existing checkpoint-scoped claim wins; auto_claim is a no-op → False.
        assert opened is False

    @pytest.mark.asyncio
    async def test_returns_false_when_auto_claim_disabled(self):
        added = []
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_scalar_result(None)),
            add=lambda o: added.append(o),
        )
        opened = await _h._record_plan_participant(
            db, plan_id="plan-a", role="builder", action="touch_only",
            principal_type="agent", agent_id="agent-1", agent_type="claude",
            run_id="run-1", user_id=1,
            # auto_claim defaults to False
        )
        assert opened is False


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAgentContextSelfDeclareClaim:
    """Agent-context endpoint claims only on explicit ?plan_id= self-declare
    (option C). Auto-pick path stays informational, no claim."""

    @pytest.mark.asyncio
    async def test_explicit_plan_id_triggers_claim(self):
        app = _app()
        bundle = SimpleNamespace(
            id="plan-a", document_id="doc-a",
            doc=SimpleNamespace(
                title="Plan A", status="active", owner="stefan",
                summary="", namespace="dev/plans", markdown="# A",
                tags=[],
            ),
            plan=SimpleNamespace(
                stage="implementation", priority="high",
                updated_at=utcnow(), code_paths=[], companions=[],
                handoffs=[], depends_on=[],
            ),
        )
        with (
            patch.object(_h, "list_plan_bundles", new=AsyncMock(return_value=[bundle])),
            patch.object(_h, "_normalize_stage_for_response", new=lambda x: x),
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_documents",
                new=AsyncMock(return_value=[]),
            ),
            patch.object(_h, "touch_participant_heartbeat", new=AsyncMock(return_value=False)),
            patch.object(_h, "claim_checkpoint", new=AsyncMock(return_value=(None, []))) as claim_mock,
        ):
            async with _client(app) as c:
                r = await c.get("/api/v1/dev/plans/agent-context?plan_id=plan-a")
        assert r.status_code == 200
        claim_mock.assert_awaited_once()
        kwargs = claim_mock.await_args.kwargs
        assert kwargs.get("plan_id") == "plan-a"
        assert kwargs.get("checkpoint_id") is None

    @pytest.mark.asyncio
    async def test_auto_pick_does_not_claim(self):
        app = _app()
        bundle = SimpleNamespace(
            id="plan-top", document_id="doc-top",
            doc=SimpleNamespace(
                title="Top", status="active", owner="stefan",
                summary="", namespace="dev/plans", markdown="",
                tags=[],
            ),
            plan=SimpleNamespace(
                stage="implementation", priority="high",
                updated_at=utcnow(), code_paths=[], companions=[],
                handoffs=[], depends_on=[],
            ),
        )
        with (
            patch.object(_h, "list_plan_bundles", new=AsyncMock(return_value=[bundle])),
            patch.object(_h, "_normalize_stage_for_response", new=lambda x: x),
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_documents",
                new=AsyncMock(return_value=[]),
            ),
            patch.object(_h, "touch_participant_heartbeat", new=AsyncMock(return_value=False)),
            patch.object(_h, "claim_checkpoint", new=AsyncMock(return_value=(None, []))) as claim_mock,
        ):
            async with _client(app) as c:
                r = await c.get("/api/v1/dev/plans/agent-context")
        assert r.status_code == 200
        claim_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_claim_failure_does_not_break_read(self):
        app = _app()
        bundle = SimpleNamespace(
            id="plan-a", document_id="doc-a",
            doc=SimpleNamespace(
                title="A", status="active", owner="stefan",
                summary="", namespace="dev/plans", markdown="",
                tags=[],
            ),
            plan=SimpleNamespace(
                stage="implementation", priority="high",
                updated_at=utcnow(), code_paths=[], companions=[],
                handoffs=[], depends_on=[],
            ),
        )
        with (
            patch.object(_h, "list_plan_bundles", new=AsyncMock(return_value=[bundle])),
            patch.object(_h, "_normalize_stage_for_response", new=lambda x: x),
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_documents",
                new=AsyncMock(return_value=[]),
            ),
            patch.object(_h, "touch_participant_heartbeat", new=AsyncMock(return_value=False)),
            patch.object(
                _h, "claim_checkpoint",
                new=AsyncMock(side_effect=RuntimeError("db boom")),
            ),
        ):
            async with _client(app) as c:
                r = await c.get("/api/v1/dev/plans/agent-context?plan_id=plan-a")
        # claim explosion does NOT propagate; read still succeeds
        assert r.status_code == 200
        assert r.json()["assignment"]["id"] == "plan-a"


def _bundle(*, title="Plan A", tags=None, plan_type="feature", plan_id="plan-a"):
    return SimpleNamespace(
        id=plan_id,
        doc=SimpleNamespace(title=title, tags=tags or []),
        plan=SimpleNamespace(plan_type=plan_type),
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestTabIdentitySuggestion:
    def test_tag_keyword_wins_over_plan_type(self):
        hint = _h.derive_tab_identity_suggestion(
            _bundle(tags=["auth", "ownership"], plan_type="feature")
        )
        assert hint["icon"] == "lock"

    def test_falls_back_to_plan_type_icon(self):
        hint = _h.derive_tab_identity_suggestion(
            _bundle(tags=["unrelated"], plan_type="bugfix")
        )
        assert hint["icon"] == "bug"

    def test_default_icon_when_no_match(self):
        hint = _h.derive_tab_identity_suggestion(
            _bundle(tags=[], plan_type="unknown-type")
        )
        assert hint["icon"] == "clipboard"

    def test_subtitle_truncates_long_titles(self):
        long_title = "x" * 60
        hint = _h.derive_tab_identity_suggestion(_bundle(title=long_title))
        assert len(hint["subtitle"]) <= 40
        assert hint["subtitle"].endswith("…")

    def test_subtitle_passes_short_titles_through(self):
        hint = _h.derive_tab_identity_suggestion(_bundle(title="Short"))
        assert hint["subtitle"] == "Short"

    @pytest.mark.asyncio
    async def test_claim_endpoint_includes_suggestion_when_nudge_fires(self):
        app = _app()
        own = _participant(meta={"claim": _open_claim("cp1")})
        bundle = _bundle(title="Plan Participant Liveness", tags=["plans"], plan_type="feature")
        with (
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch.object(_h, "claim_checkpoint", new=AsyncMock(return_value=(own, []))),
            patch.object(
                _h, "maybe_tab_identity_nudge",
                new=AsyncMock(return_value="brand your tab"),
            ),
        ):
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/claim", json={"checkpoint_id": "cp1"})
        body = r.json()
        assert body["nudge"] == "brand your tab"
        assert body["tab_identity_suggestion"] is not None
        assert body["tab_identity_suggestion"]["subtitle"] == "Plan Participant Liveness"
        assert body["tab_identity_suggestion"]["icon"] == "clipboard"  # tags=['plans']

    @pytest.mark.asyncio
    async def test_claim_endpoint_omits_suggestion_when_nudge_suppressed(self):
        app = _app()
        own = _participant(meta={"claim": _open_claim("cp1")})
        bundle = _bundle()
        with (
            patch(
                "pixsim7.backend.main.api.v1.plans.routes_agent.get_plan_bundle",
                new=AsyncMock(return_value=bundle),
            ),
            patch.object(_h, "claim_checkpoint", new=AsyncMock(return_value=(own, []))),
            patch.object(
                _h, "maybe_tab_identity_nudge",
                new=AsyncMock(return_value=None),  # ledger says already shown
            ),
        ):
            async with _client(app) as c:
                r = await c.post("/api/v1/dev/plans/plan-a/claim", json={"checkpoint_id": "cp1"})
        body = r.json()
        assert body["nudge"] is None
        assert body["tab_identity_suggestion"] is None
