"""Tests for the chat -> plan participant bridge (plan
plan-participant-liveness / checkpoint chat-plan-link-boundary).

record_chat_plan_participant makes a chat-driven agent visible in the
cross-plan active-agent roster without merging ChatSession and
PlanParticipant (see the canonical boundary docstring on the helper)."""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-plan-participant-bridge",
    "label": "Chat → Plan Participant Bridge",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "plan-participants",
    "covers": [
        "pixsim7/backend/main/api/v1/plans/helpers.py",
    ],
    "order": 47,
}

from unittest.mock import AsyncMock

import pytest

try:
    from pixsim7.backend.main.api.v1.plans import helpers as _h

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _FakeSession:
    def __init__(self):
        self.commit = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


@pytest.fixture
def patched(monkeypatch):
    rec = AsyncMock()
    monkeypatch.setattr(_h, "_record_plan_participant", rec)
    monkeypatch.setattr(
        "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
        lambda: _FakeSession(),
    )
    return rec


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestChatPlanParticipantBridge:
    @pytest.mark.asyncio
    async def test_records_lightweight_chat_participant(self, patched):
        await _h.record_chat_plan_participant(
            plan_id="plan-a",
            profile_id="profile-abc",
            session_id="sess-1",
            user_id=1,
            agent_type="claude",
        )

        patched.assert_awaited_once()
        kwargs = patched.await_args.kwargs
        assert kwargs["plan_id"] == "plan-a"
        assert kwargs["role"] == "builder"
        assert kwargs["action"] == "chat"
        assert kwargs["principal_type"] == "agent"
        assert kwargs["agent_id"] == "profile-abc"
        assert kwargs["profile_id"] == "profile-abc"
        assert kwargs["session_id"] == "sess-1"
        assert kwargs["user_id"] == 1
        assert kwargs["agent_type"] == "claude"
        assert kwargs["meta"] == {"source": "chat"}

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "plan_id,profile_id",
        [
            (None, "profile-abc"),
            ("", "profile-abc"),
            ("plan-a", None),
            ("plan-a", "  "),
            ("plan-a", "unknown"),
            ("plan-a", "agent"),
        ],
    )
    async def test_skips_when_no_real_plan_or_agent(
        self, patched, plan_id, profile_id
    ):
        await _h.record_chat_plan_participant(
            plan_id=plan_id,
            profile_id=profile_id,
            session_id="sess-1",
            user_id=1,
        )
        patched.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_failure_is_swallowed(self, monkeypatch):
        monkeypatch.setattr(
            _h, "_record_plan_participant",
            AsyncMock(side_effect=RuntimeError("db down")),
        )
        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            lambda: _FakeSession(),
        )
        # Must not raise — chat must never break on participant recording.
        await _h.record_chat_plan_participant(
            plan_id="plan-a",
            profile_id="profile-abc",
            session_id="sess-1",
            user_id=1,
        )
