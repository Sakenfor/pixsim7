"""Tests for AgentPool — session routing, on-demand spawn, eviction, engine override."""
from __future__ import annotations

import pytest

try:
    from pixsim7.client.agent_pool import AgentPool, MAX_SESSIONS, IDLE_EVICT_SECONDS
    from pixsim7.client.claude_session import AgentCmdSession, SessionState

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestPoolInit:
    """Pool creation and configuration."""

    def test_default_command(self):
        pool = AgentPool(pool_size=1)
        assert pool._command == "claude"
        assert pool._prefix == "claude"

    def test_custom_command(self):
        pool = AgentPool(pool_size=1, command="codex")
        assert pool._command == "codex"
        assert pool._prefix == "codex"

    def test_command_with_path(self):
        pool = AgentPool(pool_size=1, command="/usr/local/bin/claude")
        assert pool._prefix == "claude"

    def test_windows_path(self):
        pool = AgentPool(pool_size=1, command="C:\\tools\\codex.exe")
        assert pool._prefix == "codex.exe"

    def test_extra_args_stored(self):
        pool = AgentPool(pool_size=1, extra_args=["--verbose", "--debug"])
        assert pool._extra_args == ["--verbose", "--debug"]

    def test_max_sessions(self):
        pool = AgentPool(pool_size=1, max_sessions=5)
        assert pool._max_sessions == 5


class TestSessionLookup:
    """_find_by_session_id and index management."""

    def test_find_by_session_id_miss(self):
        pool = AgentPool(pool_size=1)
        assert pool._find_by_session_id("nonexistent") is None

    def test_find_by_session_id_hit(self):
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.cli_session_id = "conv-abc"
        pool._sessions["claude"] = session

        result = pool._find_by_session_id("conv-abc")
        assert result is session

    def test_index_updated(self):
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.cli_session_id = "conv-abc"
        pool._sessions["claude"] = session
        pool._update_index(session)

        assert pool._session_id_index.get("conv-abc") == "claude"

    def test_index_fast_path(self):
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.cli_session_id = "conv-abc"
        pool._sessions["claude"] = session
        pool._session_id_index["conv-abc"] = "claude"

        # Fast path — found via index
        result = pool._find_by_session_id("conv-abc")
        assert result is session

    def test_index_stale_falls_back_to_scan(self):
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.cli_session_id = "conv-abc"
        pool._sessions["claude"] = session
        # Stale index pointing to wrong key
        pool._session_id_index["conv-abc"] = "old-key"

        result = pool._find_by_session_id("conv-abc")
        assert result is session
        # Index updated
        assert pool._session_id_index["conv-abc"] == "claude"


class TestGetAvailable:
    """get_available — pick any READY session."""

    def test_empty_pool(self):
        pool = AgentPool(pool_size=1)
        assert pool.get_available() is None

    def test_returns_ready_session(self):
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.state = SessionState.READY
        pool._sessions["claude"] = session

        assert pool.get_available() is session

    def test_skips_busy(self):
        pool = AgentPool(pool_size=1)
        busy = AgentCmdSession(session_id="claude-0")
        busy.state = SessionState.BUSY
        ready = AgentCmdSession(session_id="claude-1")
        ready.state = SessionState.READY
        pool._sessions["claude-0"] = busy
        pool._sessions["claude-1"] = ready

        assert pool.get_available() is ready


class TestSessionIdPrefixes:
    """Session IDs use the command prefix, not hardcoded 'claude'."""

    def test_dynamic_session_prefix(self):
        pool = AgentPool(pool_size=1, command="codex")
        # Simulate _get_or_create_for_session_id key generation
        pool._next_dynamic_id += 1
        prefix = pool._prefix
        pool_key = f"{prefix}-r-{'abcdef12'}"
        assert pool_key == "codex-r-abcdef12"

    def test_warm_session_prefix_single(self):
        pool = AgentPool(pool_size=1, command="codex")
        # Single session = just the prefix
        session_id = pool._prefix
        assert session_id == "codex"

    def test_warm_session_prefix_multi(self):
        pool = AgentPool(pool_size=3, command="codex")
        # Multiple sessions = prefix-N
        for i in range(3):
            session_id = f"{pool._prefix}-{i}"
            assert session_id.startswith("codex-")


class TestPoolProperties:
    """ready_count, busy_count, status."""

    def test_counts(self):
        pool = AgentPool(pool_size=1)
        s1 = AgentCmdSession(session_id="s1")
        s1.state = SessionState.READY
        s2 = AgentCmdSession(session_id="s2")
        s2.state = SessionState.BUSY
        s3 = AgentCmdSession(session_id="s3")
        s3.state = SessionState.STOPPED
        pool._sessions = {"s1": s1, "s2": s2, "s3": s3}

        assert pool.ready_count == 1
        assert pool.busy_count == 1

    def test_status_dict(self):
        pool = AgentPool(pool_size=1)
        status = pool.status()
        assert "pool_size" in status
        assert "total" in status
        assert "ready" in status
        assert "busy" in status
        assert "sessions" in status

    def test_sessions_property(self):
        pool = AgentPool(pool_size=1)
        s = AgentCmdSession(session_id="test")
        pool._sessions["test"] = s
        assert pool.sessions == [s]
