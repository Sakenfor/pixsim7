"""Unit tests for AgentTrackingService.revoke_profile — hard revocation.

Pausing/archiving a profile must terminate its live runs AND revoke the
UserSession backing each run's token so in-flight agent tokens stop
authenticating immediately. Plan ``scoped-agent-authorization``.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

try:
    from pixsim7.backend.main.services.audit.agent_tracking import AgentTrackingService

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend imports unavailable")


def _result(items):
    """Mimic ``(await db.execute(stmt)).scalars().all()``."""
    res = MagicMock()
    res.scalars.return_value.all.return_value = items
    return res


def _fake_run(run_id, jti, status="running"):
    return SimpleNamespace(run_id=run_id, profile_id="collab", status=status,
                           ended_at=None, token_jti=jti)


def _fake_session(token_id, is_revoked=False):
    return SimpleNamespace(token_id=token_id, is_revoked=is_revoked,
                           revoked_at=None, revoke_reason=None)


def _service(run_results, session_results):
    db = MagicMock()
    # First execute → runs query; second → sessions query.
    db.execute = AsyncMock(side_effect=[_result(run_results), _result(session_results)])
    db.commit = AsyncMock()
    svc = AgentTrackingService(db)
    svc._audit = MagicMock()
    svc._audit.record = AsyncMock()
    return svc, db


@pytest.mark.asyncio
async def test_revoke_kills_runs_and_sessions(monkeypatch):
    runs = [_fake_run("run-1", "jti-1"), _fake_run("run-2", "jti-2")]
    sessions = [_fake_session("jti-1"), _fake_session("jti-2")]
    svc, db = _service(runs, sessions)

    evicted = []
    monkeypatch.setattr(
        "pixsim7.backend.main.services.user.auth_service.AuthService.evict_claims_cache_for_jti",
        AsyncMock(side_effect=lambda jti: evicted.append(jti)),
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.api.v1.plans.helpers.release_claims_for_run",
        AsyncMock(),
    )

    out = await svc.revoke_profile("collab", reason="profile_paused", actor="admin:1")

    assert out == {"runs_revoked": 2, "sessions_revoked": 2}
    assert all(r.status == "revoked" and r.ended_at is not None for r in runs)
    assert all(s.is_revoked and s.revoke_reason == "profile_paused" for s in sessions)
    assert sorted(evicted) == ["jti-1", "jti-2"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_revoke_noop_when_no_live_runs(monkeypatch):
    svc, db = _service([], [])
    monkeypatch.setattr(
        "pixsim7.backend.main.services.user.auth_service.AuthService.evict_claims_cache_for_jti",
        AsyncMock(),
    )

    out = await svc.revoke_profile("collab")

    assert out == {"runs_revoked": 0, "sessions_revoked": 0}
    # No live runs → no second (sessions) query was needed.
    assert db.execute.await_count == 1
    db.commit.assert_awaited_once()
