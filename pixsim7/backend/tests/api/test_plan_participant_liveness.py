"""Unit tests for plan-participant liveness (plan ``plan-participant-liveness``,
checkpoint ``liveness-signal``).

Covers the pure liveness helpers, the run-terminal override, the
heartbeat-advance on work logging, and the cheap heartbeat ping. All
pure/in-memory — no DB or FK tables required (the helpers operate on
detached ``PlanParticipant`` instances)."""
from __future__ import annotations

TEST_SUITE = {
    "id": "plan-participant-liveness",
    "label": "Plan Participant Liveness",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "plan-participants",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/helpers.py",
        "pixsim7/backend/main/domain/docs/models.py",
        "pixsim7/backend/main/api/v1/plans/schemas.py",
    ],
    "order": 43,
}

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    from pixsim7.backend.main.api.v1.plans import helpers as _h
    from pixsim7.backend.main.domain.docs.models import PlanParticipant
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


def _execute_result(*, scalar=None, rows=None, scalars_all=None):
    """SQLAlchemy-ish result stub matching the two access shapes used."""
    return SimpleNamespace(
        scalar_one_or_none=lambda: scalar,
        scalars=lambda: SimpleNamespace(all=lambda: scalars_all or rows or []),
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestLivenessHelpers:
    def test_liveness_at_picks_most_recent_signal(self):
        now = utcnow()
        row = _participant(
            last_seen_at=now - timedelta(hours=2),
            last_heartbeat_at=now - timedelta(minutes=1),
        )
        assert _h.participant_liveness_at(row) == now - timedelta(minutes=1)

    def test_liveness_at_none_when_no_signal(self):
        row = _participant(last_seen_at=None, last_heartbeat_at=None)
        assert _h.participant_liveness_at(row) is None

    def test_fresh_heartbeat_is_not_stale(self):
        row = _participant(
            last_seen_at=utcnow() - timedelta(hours=3),  # stale work...
            last_heartbeat_at=utcnow() - timedelta(seconds=5),  # ...but pinged
        )
        assert _h.participant_is_stale(row) is False

    def test_old_signals_are_stale_after_ttl(self):
        old = utcnow() - timedelta(hours=1)
        row = _participant(last_seen_at=old, last_heartbeat_at=old)
        assert _h.participant_is_stale(row) is True

    def test_no_signal_is_stale(self):
        row = _participant(last_seen_at=None, last_heartbeat_at=None)
        assert _h.participant_is_stale(row) is True

    def test_ttl_override_is_respected(self):
        ago = utcnow() - timedelta(minutes=10)
        row = _participant(last_seen_at=ago, last_heartbeat_at=ago)
        assert _h.participant_is_stale(row, ttl=timedelta(minutes=5)) is True
        assert _h.participant_is_stale(row, ttl=timedelta(minutes=30)) is False

    def test_env_configures_ttl(self, monkeypatch):
        ago = utcnow() - timedelta(minutes=5)
        row = _participant(last_seen_at=ago, last_heartbeat_at=ago)
        monkeypatch.setenv("PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES", "2")
        assert _h.participant_is_stale(row) is True
        monkeypatch.setenv("PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES", "120")
        assert _h.participant_is_stale(row) is False

    def test_entry_exposes_liveness_fields(self):
        row = _participant(last_heartbeat_at=utcnow() - timedelta(seconds=2))
        entry = _h._participant_to_entry(row)
        assert entry.is_stale is False
        assert entry.is_active is True
        assert entry.last_heartbeat_at  # iso string, non-empty

    def test_entry_run_terminal_forces_inactive_even_when_fresh(self):
        row = _participant(last_heartbeat_at=utcnow())
        entry = _h._participant_to_entry(row, run_terminal=True)
        assert entry.is_stale is False  # heartbeat itself is fresh
        assert entry.is_active is False  # ...but the run ended

    def test_entry_stale_is_inactive(self):
        row = _participant(
            last_seen_at=utcnow() - timedelta(hours=2),
            last_heartbeat_at=utcnow() - timedelta(hours=2),
        )
        entry = _h._participant_to_entry(row)
        assert entry.is_stale is True
        assert entry.is_active is False


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestHeartbeatAdvance:
    @pytest.mark.asyncio
    async def test_record_creates_row_with_heartbeat(self):
        added = []
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_execute_result(scalar=None)),
            add=lambda obj: added.append(obj),
        )
        await _h._record_plan_participant(
            db,
            plan_id="plan-a",
            role="builder",
            action="progress",
            principal_type="agent",
            agent_id="agent-1",
            run_id="run-1",
        )
        assert len(added) == 1
        row = added[0]
        assert row.last_heartbeat_at == row.last_seen_at
        assert row.last_heartbeat_at is not None

    @pytest.mark.asyncio
    async def test_record_advances_heartbeat_on_existing_row(self):
        stale = utcnow() - timedelta(hours=5)
        existing = _participant(last_seen_at=stale, last_heartbeat_at=stale, touches=3)
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_execute_result(scalar=existing)),
            add=lambda obj: None,
        )
        await _h._record_plan_participant(
            db,
            plan_id="plan-a",
            role="builder",
            action="progress",
            principal_type="agent",
            agent_id="agent-1",
            run_id="run-1",
        )
        assert existing.last_heartbeat_at > stale
        assert existing.last_heartbeat_at == existing.last_seen_at
        assert existing.touches == 4


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestRunTerminalAndPing:
    @pytest.mark.asyncio
    async def test_load_terminal_run_ids_returns_subset(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_execute_result(scalars_all=["run-1"]))
        )
        terminal = await _h.load_terminal_run_ids(db, {"run-1", "run-2"})
        assert terminal == {"run-1"}

    @pytest.mark.asyncio
    async def test_load_terminal_run_ids_empty_input_skips_query(self):
        db = SimpleNamespace(execute=AsyncMock())
        assert await _h.load_terminal_run_ids(db, set()) == set()
        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_touch_heartbeat_advances_matching_rows(self):
        stale = utcnow() - timedelta(hours=4)
        rows = [_participant(last_heartbeat_at=stale), _participant(last_heartbeat_at=stale)]
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_execute_result(rows=rows))
        )
        principal = SimpleNamespace(
            principal_type="agent", agent_id="agent-1", run_id="run-1",
            agent_type="claude", user_id=None,
        )
        touched = await _h.touch_participant_heartbeat(
            db, principal=principal, plan_id="plan-a"
        )
        assert touched == 2
        assert all(r.last_heartbeat_at > stale for r in rows)

    @pytest.mark.asyncio
    async def test_touch_heartbeat_noop_without_agent_identity(self):
        db = SimpleNamespace(execute=AsyncMock())
        principal = SimpleNamespace(
            principal_type="user", agent_id=None, run_id=None, user_id=7,
        )
        assert await _h.touch_participant_heartbeat(db, principal=principal) == 0
        db.execute.assert_not_awaited()
