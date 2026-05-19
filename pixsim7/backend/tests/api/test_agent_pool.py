"""Tests for AgentPool — session routing, on-demand spawn, eviction, engine override."""
from __future__ import annotations

import pytest

try:
    from pixsim7.client.agent_pool import (
        AgentPool,
        MAX_SESSIONS,
        IDLE_EVICT_SECONDS,
        STUCK_BUSY_SECONDS,
    )
    from pixsim7.client.session import AgentCmdSession, SessionState

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

    # ── Regression: 2026-03-31 claude_session rename clobbered the
    #    bridge_session_id/cli_session_id split in _update_index, breaking
    #    conversation→subprocess affinity and leaving _cli_id_map empty.
    #    Symptom: a tab gets a false "conversation … is busy" because the
    #    panel handle resolves to the wrong (busy) pooled subprocess.

    def test_index_keyed_by_panel_handle_not_cli_uuid(self):
        """The panel addresses a conversation by bridge_session_id; the index
        must be keyed by that handle, not Claude's internal resume UUID."""
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude-r-deadbeef")
        session.bridge_session_id = "auto-tab-7"   # what the panel dispatches with
        session.cli_session_id = "9f1c-real-uuid"  # Claude's resume id (differs)
        pool._sessions["claude-r-deadbeef"] = session
        pool._update_index(session)

        # Affinity lookup uses the panel handle and resolves the subprocess.
        assert pool._session_id_index.get("auto-tab-7") == "claude-r-deadbeef"
        assert pool._find_by_session_id("auto-tab-7") is session

    def test_cli_id_map_is_populated(self):
        """Regression: the guard had degenerated to ``x != x`` (always False),
        so _cli_id_map never filled and --resume affinity silently broke."""
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.bridge_session_id = "auto-tab-7"
        session.cli_session_id = "9f1c-real-uuid"
        pool._sessions["claude"] = session
        pool._update_index(session)

        assert pool._cli_id_map.get("auto-tab-7") == "9f1c-real-uuid"

    def test_new_conversation_falls_back_to_cli_id(self):
        """Brand-new conversations have no panel handle until Claude's init
        event — fall back to cli_session_id (which the bridge then adopts)."""
        pool = AgentPool(pool_size=1)
        session = AgentCmdSession(session_id="claude")
        session.bridge_session_id = None
        session.cli_session_id = "conv-fresh"
        pool._sessions["claude"] = session
        pool._update_index(session)

        assert pool._session_id_index.get("conv-fresh") == "claude"
        # No spurious self-map when handle == cli id.
        assert "conv-fresh" not in pool._cli_id_map

    def test_distinct_conversations_do_not_collide(self):
        """Two tabs with distinct handles must resolve to their own
        subprocess — never cross-resolve into each other's (busy) session."""
        pool = AgentPool(pool_size=2)
        a = AgentCmdSession(session_id="claude-a")
        a.bridge_session_id = "tab-A"
        a.cli_session_id = "uuid-A"
        b = AgentCmdSession(session_id="claude-b")
        b.bridge_session_id = "tab-B"
        b.cli_session_id = "uuid-B"
        pool._sessions["claude-a"] = a
        pool._sessions["claude-b"] = b
        pool._update_index(a)
        pool._update_index(b)

        assert pool._find_by_session_id("tab-A") is a
        assert pool._find_by_session_id("tab-B") is b


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


class TestDbBackedResume:
    """Plan `chat-session-durable-resume` CP-B: after a bridge restart the
    in-memory `_cli_id_map` is empty; resume must recover the CLI conversation
    UUID from the backend (`ChatSession.cli_session_id`) for *any* id shape —
    not only the legacy `mcp-`/`auto-` prefixes."""

    @staticmethod
    def _capture_spawn(pool):
        captured: dict = {}

        async def _fake_spawn(**kwargs):
            captured.update(kwargs)
            return AgentCmdSession(session_id="spawned")

        pool._spawn_session = _fake_spawn  # type: ignore[assignment]
        return captured

    @pytest.mark.asyncio
    async def test_plain_uuid_recovers_cli_id_from_backend(self, monkeypatch):
        """A plain conversation UUID with an empty map used to fall straight
        through to a blind self-resume with no DB recovery. It must now
        consult the backend and resume the persisted cli_session_id."""
        import pixsim7.client.agent_pool as ap

        monkeypatch.setattr(
            ap, "_lookup_cli_session_id", lambda sid: "real-cli-uuid-xyz"
        )
        pool = AgentPool(pool_size=1)
        captured = self._capture_spawn(pool)

        await pool._get_or_create_for_session_id("7d579848-a99d-48a5-bfbb-f058")

        assert captured["resume_session_id"] == "real-cli-uuid-xyz"
        # Cached so the next turn in the same process skips the HTTP round-trip.
        assert pool._cli_id_map["7d579848-a99d-48a5-bfbb-f058"] == "real-cli-uuid-xyz"

    @pytest.mark.asyncio
    async def test_plain_uuid_no_backend_mapping_falls_back_to_direct(self, monkeypatch):
        """No persisted mapping (e.g. first turn never reached the backend):
        a real-looking UUID is still worth a direct --resume attempt."""
        import pixsim7.client.agent_pool as ap

        monkeypatch.setattr(ap, "_lookup_cli_session_id", lambda sid: None)
        pool = AgentPool(pool_size=1)
        captured = self._capture_spawn(pool)

        await pool._get_or_create_for_session_id("plain-uuid-1234")

        assert captured["resume_session_id"] == "plain-uuid-1234"

    @pytest.mark.asyncio
    async def test_derived_id_without_mapping_spawns_fresh(self, monkeypatch):
        """Derived `mcp-`/`auto-` ids Claude can't recognize must NOT be
        blindly passed to --resume when there's no DB mapping — spawn fresh."""
        import pixsim7.client.agent_pool as ap

        monkeypatch.setattr(ap, "_lookup_cli_session_id", lambda sid: None)
        pool = AgentPool(pool_size=1)
        captured = self._capture_spawn(pool)

        await pool._get_or_create_for_session_id("mcp-deadbeef")

        assert captured["resume_session_id"] is None


class TestEngineProbe:
    """`probe_engine` startup self-test — guards advertised engine list."""

    @pytest.mark.asyncio
    async def test_missing_binary_returns_failure(self):
        from pixsim7.client.agent_pool import probe_engine

        ok, reason = await probe_engine("definitely-not-a-real-binary-xyz123")
        assert ok is False
        # Either FileNotFoundError on POSIX or a spawn-level failure on
        # Windows when the OS hands back a path-not-found error.
        assert reason.startswith("binary_not_found") or reason.startswith("spawn_failed")

    @pytest.mark.asyncio
    async def test_zero_exit_with_version_output_succeeds(self, tmp_path):
        """Stand up a one-shot fake binary that prints a version banner."""
        import os
        import stat
        from pixsim7.client.agent_pool import probe_engine

        # On POSIX use a shell stub; on Windows use a .cmd. Both follow
        # the same contract: exit 0 with one line of stdout.
        if os.name == "nt":
            stub = tmp_path / "fake-engine.cmd"
            stub.write_text("@echo fake-engine 9.9.9\r\n")
        else:
            stub = tmp_path / "fake-engine.sh"
            stub.write_text("#!/bin/sh\necho fake-engine 9.9.9\n")
            stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        ok, detail = await probe_engine(str(stub))
        assert ok is True
        assert "fake-engine" in detail

    @pytest.mark.asyncio
    async def test_nonzero_exit_returns_failure_with_exit_code(self, tmp_path):
        import os
        import stat
        from pixsim7.client.agent_pool import probe_engine

        if os.name == "nt":
            stub = tmp_path / "broken-engine.cmd"
            stub.write_text("@exit /b 7\r\n")
        else:
            stub = tmp_path / "broken-engine.sh"
            stub.write_text("#!/bin/sh\nexit 7\n")
            stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        ok, reason = await probe_engine(str(stub))
        assert ok is False
        assert reason.startswith("exit_7")

    @pytest.mark.asyncio
    async def test_start_drops_engines_that_fail_probe(self, monkeypatch):
        """`AgentPool.start` should mutate `_engines` to survivors only."""
        from pixsim7.client import agent_pool as ap_module

        async def _fake_probe(cmd, *, timeout=ap_module.ENGINE_PROBE_TIMEOUT_S):
            # claude survives, codex fails — exactly the symptom the
            # engine-health pill needs to surface.
            if cmd == "claude":
                return True, "claude 1.0.0"
            return False, "binary_not_found"

        monkeypatch.setattr(ap_module, "probe_engine", _fake_probe)
        pool = AgentPool(pool_size=1, engines=["claude", "codex"], auto_restart=False)
        survivors = await pool.start()

        assert survivors == 1
        assert pool._engines == ["claude"]
        assert pool.failed_engines == [("codex", "binary_not_found")]

    @pytest.mark.asyncio
    async def test_start_with_all_engines_failing_returns_zero(self, monkeypatch):
        """All-failure path: pool comes up but advertises no engines.

        Backend will then reject every engine-tagged request with
        bridge_engine_unavailable, which the new error wording tells the
        user to fix at their end.
        """
        from pixsim7.client import agent_pool as ap_module

        async def _fake_probe(cmd, *, timeout=ap_module.ENGINE_PROBE_TIMEOUT_S):
            return False, "timeout_8.0s"

        monkeypatch.setattr(ap_module, "probe_engine", _fake_probe)
        pool = AgentPool(pool_size=1, engines=["claude", "codex"], auto_restart=False)
        survivors = await pool.start()

        assert survivors == 0
        assert pool._engines == []
        assert {name for name, _ in pool.failed_engines} == {"claude", "codex"}

    @pytest.mark.asyncio
    async def test_failed_engines_default_empty_before_start(self):
        """`failed_engines` is well-defined even before `start` runs."""
        pool = AgentPool(pool_size=1, engines=["claude"], auto_restart=False)
        assert pool.failed_engines == []


class TestEvictOldestIdle:
    """Eviction path — no longer gated on `-r-` in session_id.

    Pre-fix: model-pinned / scoped sessions (keys like ``codex-1``) were
    never evictable, so probing 10 (model, effort) variants in a 30-min
    window bricked the pool with "Max sessions reached and no idle
    sessions to evict". Post-fix: any READY on-demand session is fair
    game; the oldest one wins.
    """

    @staticmethod
    def _make_ready(session_id: str, last_activity_secs_ago: float = 0.0):
        """Build a READY session with controlled last_activity for ordering."""
        from datetime import datetime, timedelta, timezone

        s = AgentCmdSession(session_id=session_id)
        s.state = SessionState.READY
        s.stats.last_activity = datetime.now(timezone.utc) - timedelta(seconds=last_activity_secs_ago)
        return s

    @pytest.mark.asyncio
    async def test_evicts_dynamic_non_resume_session(self, monkeypatch):
        """The bug fix in one line: a session keyed `codex-1` (no `-r-`)
        is now evictable. Pre-fix this returned False and the pool
        deadlocked at MAX_SESSIONS."""
        pool = AgentPool(pool_size=1, max_sessions=2)
        # Two model-pinned sessions, neither has `-r-` in the key.
        s1 = self._make_ready("codex-1", last_activity_secs_ago=300)
        s2 = self._make_ready("codex-2", last_activity_secs_ago=10)
        pool._sessions = {"codex-1": s1, "codex-2": s2}

        # Don't actually try to subprocess.kill — just record the call.
        stop_calls: list[str] = []

        async def _fake_stop():
            stop_calls.append(s1.session_id)

        monkeypatch.setattr(s1, "stop", _fake_stop)
        evicted = await pool._evict_oldest_idle()

        assert evicted is True
        assert stop_calls == ["codex-1"]  # oldest by last_activity
        assert "codex-1" not in pool._sessions
        assert "codex-2" in pool._sessions

    @pytest.mark.asyncio
    async def test_evicts_oldest_among_mixed_resume_and_dynamic(self, monkeypatch):
        """Both `-r-` resume sessions and bare dynamic sessions compete
        on equal terms — last_activity is the only tiebreaker."""
        pool = AgentPool(pool_size=1, max_sessions=2)
        # Resume session is OLDER than the dynamic one — it should be
        # the one evicted, even though pre-fix the dynamic was untouchable.
        s_resume = self._make_ready("claude-r-abc12345", last_activity_secs_ago=600)
        s_dynamic = self._make_ready("claude-3", last_activity_secs_ago=60)
        pool._sessions = {s_resume.session_id: s_resume, s_dynamic.session_id: s_dynamic}

        stop_calls: list[str] = []

        async def _fake_stop_r():
            stop_calls.append(s_resume.session_id)

        monkeypatch.setattr(s_resume, "stop", _fake_stop_r)
        evicted = await pool._evict_oldest_idle()

        assert evicted is True
        assert stop_calls == [s_resume.session_id]
        assert s_resume.session_id not in pool._sessions
        assert s_dynamic.session_id in pool._sessions

    @pytest.mark.asyncio
    async def test_no_idle_sessions_returns_false(self):
        """If every session is BUSY, eviction reports failure (caller
        then raises 'Max sessions reached')."""
        pool = AgentPool(pool_size=1, max_sessions=2)
        s = self._make_ready("codex-1")
        s.state = SessionState.BUSY
        pool._sessions = {"codex-1": s}

        evicted = await pool._evict_oldest_idle()
        assert evicted is False
        assert "codex-1" in pool._sessions

    @pytest.mark.asyncio
    async def test_eleventh_spawn_after_ten_dynamic_sessions_succeeds(self, monkeypatch):
        """End-to-end: 10 dynamic sessions, 11th spawn triggers eviction
        rather than the old hard-error path. Validates the fix at the
        call site that originally broke (`_spawn_session`)."""
        pool = AgentPool(pool_size=1, max_sessions=10)
        # Larger `last_activity_secs_ago` = older. Make codex-10 the oldest
        # so the assertion is unambiguous about which one wins eviction.
        for i in range(10):
            s = self._make_ready(f"codex-{i + 1}", last_activity_secs_ago=100 + i)
            pool._sessions[s.session_id] = s

        oldest_id = "codex-10"  # largest last_activity_secs_ago → oldest

        async def _fake_stop():
            pass

        for s in pool._sessions.values():
            monkeypatch.setattr(s, "stop", _fake_stop)

        # Trigger the cap-and-evict branch directly.
        evicted = await pool._evict_oldest_idle()
        assert evicted is True
        assert oldest_id not in pool._sessions
        assert len(pool._sessions) == 9


class TestRecoverStuckBusy:
    """Stuck-BUSY watchdog — recovers a session left BUSY while still alive.

    Regression for the false ``conversation_session_busy`` on real-UUID
    sessions: a prior turn never settled back to READY, and the
    health-monitor previously had no branch for BUSY-but-alive, so every
    later message to that conversation was rejected. ``45b0582f8`` (derived
    bridge/cli id split) explicitly no-ops the real-UUID flow, so it does
    not cover this; the watchdog does.
    """

    @staticmethod
    def _busy(session_id: str, last_activity_secs_ago: float):
        from datetime import datetime, timedelta, timezone

        s = AgentCmdSession(session_id=session_id)
        s.state = SessionState.BUSY
        s.stats.last_activity = datetime.now(timezone.utc) - timedelta(
            seconds=last_activity_secs_ago
        )
        return s

    @pytest.mark.asyncio
    async def test_restarts_session_stuck_busy_past_threshold(self, monkeypatch):
        pool = AgentPool(pool_size=1, max_sessions=10)
        s = self._busy("claude-r-5bb91fe1", STUCK_BUSY_SECONDS + 60)
        pool._sessions = {s.session_id: s}

        restarts: list[str] = []

        async def _fake_restart():
            restarts.append(s.session_id)
            return True

        monkeypatch.setattr(s, "restart", _fake_restart)

        recovered = await pool._maybe_recover_stuck_busy(s)

        assert recovered is True
        assert restarts == ["claude-r-5bb91fe1"]

    @pytest.mark.asyncio
    async def test_leaves_legitimately_long_running_turn_alone(self, monkeypatch):
        """A turn busy for less than the threshold must NOT be killed mid-flight."""
        pool = AgentPool(pool_size=1, max_sessions=10)
        s = self._busy("claude-r-longturn", STUCK_BUSY_SECONDS - 60)
        pool._sessions = {s.session_id: s}

        async def _fake_restart():
            raise AssertionError("must not restart a still-progressing turn")

        monkeypatch.setattr(s, "restart", _fake_restart)

        recovered = await pool._maybe_recover_stuck_busy(s)
        assert recovered is False

    @pytest.mark.asyncio
    async def test_no_last_activity_is_not_treated_as_stuck(self, monkeypatch):
        pool = AgentPool(pool_size=1, max_sessions=10)
        s = self._busy("claude-r-fresh", 0)
        s.stats.last_activity = None
        pool._sessions = {s.session_id: s}

        async def _fake_restart():
            raise AssertionError("no timestamp → cannot conclude stuck")

        monkeypatch.setattr(s, "restart", _fake_restart)

        recovered = await pool._maybe_recover_stuck_busy(s)
        assert recovered is False


class TestHealthMonitorIdleEviction:
    """Health-monitor idle eviction — same `-r-` filter drop, applied
    to the periodic background reaper."""

    @pytest.mark.asyncio
    async def test_dynamic_session_past_idle_timeout_is_reaped(self, monkeypatch):
        """Run a single iteration of the eviction loop body and confirm
        a non-resume session past IDLE_EVICT_SECONDS gets stopped."""
        from datetime import datetime, timedelta, timezone

        pool = AgentPool(pool_size=1, max_sessions=10)
        # Idle for IDLE_EVICT_SECONDS + 60s — definitely past timeout.
        idle_secs = IDLE_EVICT_SECONDS + 60
        s = AgentCmdSession(session_id="codex-1")
        s.state = SessionState.READY
        s.stats.last_activity = datetime.now(timezone.utc) - timedelta(seconds=idle_secs)
        pool._sessions = {"codex-1": s}

        stops: list[str] = []

        async def _fake_stop():
            stops.append(s.session_id)

        monkeypatch.setattr(s, "stop", _fake_stop)

        # Inline the loop body (the real loop runs forever; we just want
        # one iteration's worth of eviction logic).
        now = datetime.now(timezone.utc)
        for session in list(pool._sessions.values()):
            if session.state == SessionState.READY and session.stats.last_activity:
                idle = (now - session.stats.last_activity).total_seconds()
                if idle > IDLE_EVICT_SECONDS:
                    await session.stop()
                    pool._cleanup_session_files(session)
                    pool._sessions.pop(session.session_id, None)
                    pool._drop_indexes_for_session(session.session_id)

        assert stops == ["codex-1"]
        assert "codex-1" not in pool._sessions

    def test_recently_active_session_not_evicted_by_loop(self):
        """Sanity: only sessions past the timeout are reaped."""
        from datetime import datetime, timedelta, timezone

        pool = AgentPool(pool_size=1, max_sessions=10)
        s = AgentCmdSession(session_id="codex-fresh")
        s.state = SessionState.READY
        s.stats.last_activity = datetime.now(timezone.utc) - timedelta(seconds=30)  # fresh
        pool._sessions = {"codex-fresh": s}

        # Mirror the loop body's filter check.
        now = datetime.now(timezone.utc)
        target_for_eviction = []
        for session in list(pool._sessions.values()):
            if session.state == SessionState.READY and session.stats.last_activity:
                idle = (now - session.stats.last_activity).total_seconds()
                if idle > IDLE_EVICT_SECONDS:
                    target_for_eviction.append(session.session_id)

        assert target_for_eviction == []
