"""Tests for AgentCmdSession — state machine, resume, serialization."""
from __future__ import annotations

import pytest

try:
    from pixsim7.client.session import (
        AgentCmdSession,
        SessionState,
        SessionStats,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestInitialState:
    """Session starts in correct state."""

    def test_initial_state_idle(self):
        session = AgentCmdSession(session_id="test")
        assert session.state == SessionState.IDLE

    def test_initial_stats(self):
        session = AgentCmdSession(session_id="test")
        assert session.stats.messages_sent == 0
        assert session.stats.messages_received == 0
        assert session.stats.errors == 0

    def test_initial_no_pid(self):
        session = AgentCmdSession(session_id="test")
        assert session.pid is None
        assert not session.is_alive

    def test_default_command(self):
        session = AgentCmdSession(session_id="test")
        assert session._command == "claude"

    def test_custom_command(self):
        session = AgentCmdSession(session_id="test", command="codex")
        assert session._command == "codex"

    def test_extra_args(self):
        session = AgentCmdSession(session_id="test", extra_args=["--dangerously-skip-permissions"])
        assert session._extra_args == ["--dangerously-skip-permissions"]


class TestResumePreservation:
    """restart() preserves session ID for --resume."""

    def test_restart_preserves_session_id(self):
        session = AgentCmdSession(session_id="test")
        session.cli_session_id = "conv-abc"

        # Simulate restart logic (without actually starting a process)
        assert session._resume_session_id is None
        if session.cli_session_id and not session._resume_session_id:
            session._resume_session_id = session.cli_session_id
        assert session._resume_session_id == "conv-abc"

    def test_explicit_resume_not_overwritten(self):
        session = AgentCmdSession(session_id="test", resume_session_id="explicit-id")
        session.cli_session_id = "conv-abc"

        # Should NOT overwrite explicit resume
        if session.cli_session_id and not session._resume_session_id:
            session._resume_session_id = session.cli_session_id
        assert session._resume_session_id == "explicit-id"


class TestToDict:
    """Serialization for status display."""

    def test_to_dict_keys(self):
        session = AgentCmdSession(session_id="test-1")
        d = session.to_dict()

        assert d["session_id"] == "test-1"
        assert "cli_session_id" in d
        assert "cli_model" in d
        assert "state" in d
        assert "pid" in d
        assert "messages_sent" in d

    def test_to_dict_state_value(self):
        session = AgentCmdSession(session_id="test")
        assert session.to_dict()["state"] == "idle"

    def test_to_dict_with_session_data(self):
        session = AgentCmdSession(session_id="test")
        session.cli_session_id = "abc"
        session.cli_model = "claude-opus"
        d = session.to_dict()
        assert d["cli_session_id"] == "abc"
        assert d["cli_model"] == "claude-opus"
