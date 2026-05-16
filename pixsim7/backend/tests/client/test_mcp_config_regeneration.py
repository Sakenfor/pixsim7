"""Tests for MCP config regeneration robustness.

Plan: mcp-server-reliability — checkpoint `robust-fix-regenerate-on-missing`.

Background: the bridge writes MCP HTTP config to %TEMP%; Windows cleanup can
sweep the file out from under the bridge cache. Previously, session.py:
182-185 silently fell back to launching Claude *without* MCP, so all agents
quietly lost their MCP tools while looking 'fine' (Bash/Read/Edit still worked).

The robust fix wires a regenerator callback from Bridge → AgentPool → Session.
When the session detects its MCP config file is missing at spawn time, it
calls the regenerator. On success: continues with the fresh path. On failure:
refuses to start, surfaces the error.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-mcp-config-regeneration",
    "label": "MCP Config Regeneration Robustness",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/session.py",
        "pixsim7/client/agent_pool.py",
    ],
    "order": 18.9,
}

from unittest.mock import MagicMock

import pytest

from pixsim7.client.session import (
    AgentCmdSession,
    MCPConfigUnavailable,
    SessionState,
)
from pixsim7.client.agent_pool import AgentPool


# ═══════════════════════════════════════════════════════════════════
# Session.start() — regenerate-or-fail-loud behavior
# ═══════════════════════════════════════════════════════════════════


class TestSessionRegenerateOrFailLoud:
    """Session.start() should regenerate MCP config or fail loudly when the
    cached config file is missing — NOT silently fall back when a regenerator
    is wired.
    """

    @pytest.mark.asyncio
    async def test_regenerator_returns_none_session_fails_loud(self, tmp_path):
        # Path that doesn't exist — simulates Windows %TEMP% sweep.
        missing = str(tmp_path / "swept.json")
        regenerator = MagicMock(return_value=None)

        session = AgentCmdSession(
            session_id="test-session",
            command="claude",
            mcp_config_path=missing,
            mcp_config_regenerator=regenerator,
        )

        result = await session.start()

        assert result is False, "session.start() must return False on unrecoverable MCP loss"
        assert session.state == SessionState.STOPPED
        assert "regenerator" in (session.last_error or "").lower()
        regenerator.assert_called_once()

    @pytest.mark.asyncio
    async def test_regenerator_raises_session_fails_loud(self, tmp_path):
        missing = str(tmp_path / "swept.json")

        def regenerator_raises():
            raise OSError("simulated filesystem error")

        session = AgentCmdSession(
            session_id="test-session",
            command="claude",
            mcp_config_path=missing,
            mcp_config_regenerator=regenerator_raises,
        )

        result = await session.start()

        assert result is False
        assert session.state == SessionState.STOPPED
        # Error message should name the exception type for debugging.
        assert "OSError" in (session.last_error or "")

    @pytest.mark.asyncio
    async def test_regenerator_returns_invalid_path_session_fails_loud(self, tmp_path):
        # Regenerator returns a string path but the file doesn't actually exist
        # — could happen if the write succeeded but immediate cleanup ran, or
        # the regenerator has a bug. Either way, fail loud.
        missing = str(tmp_path / "swept.json")
        also_missing = str(tmp_path / "fake_fresh.json")
        regenerator = MagicMock(return_value=also_missing)

        session = AgentCmdSession(
            session_id="test-session",
            command="claude",
            mcp_config_path=missing,
            mcp_config_regenerator=regenerator,
        )

        result = await session.start()

        assert result is False
        assert session.state == SessionState.STOPPED

    @pytest.mark.asyncio
    async def test_no_regenerator_preserves_legacy_silent_fallback(self, tmp_path, monkeypatch):
        # Legacy callers (tests, standalone usage) that construct Session
        # without a regenerator should preserve the old silent-fallback
        # behavior so we don't break back-compat.
        missing = str(tmp_path / "swept.json")

        session = AgentCmdSession(
            session_id="test-session",
            command="claude",
            mcp_config_path=missing,
            mcp_config_regenerator=None,
        )

        # Patch shutil.which so we don't depend on `claude` being installed.
        monkeypatch.setattr("shutil.which", lambda _: "/usr/bin/fake-claude")

        # We don't want to actually spawn a subprocess; just verify the regen
        # logic took the silent-fallback path (no fail-loud). The simplest
        # assertion is that state did NOT transition to STOPPED via the
        # regen-failure path before subprocess spawn.
        async def _fake_exec(*args, **kwargs):
            # Raise so start() returns False, but only AFTER the regen check.
            raise FileNotFoundError("intentional — bypassing real subprocess")

        monkeypatch.setattr("asyncio.create_subprocess_exec", _fake_exec)

        result = await session.start()

        # start() will return False because subprocess failed, but the
        # _last_error should be about the subprocess, not about MCP regen.
        assert result is False
        # If MCP-regen had fail-louded, last_error would mention regeneration.
        assert "regenerator" not in (session.last_error or "").lower()
        assert "regeneration" not in (session.last_error or "").lower()

    @pytest.mark.asyncio
    async def test_existing_config_skips_regenerator(self, tmp_path, monkeypatch):
        # Happy path: config file exists, regenerator should NOT be called.
        config = tmp_path / "config.json"
        config.write_text('{"mcpServers": {}}')

        regenerator = MagicMock(return_value=None)

        session = AgentCmdSession(
            session_id="test-session",
            command="claude",
            mcp_config_path=str(config),
            mcp_config_regenerator=regenerator,
        )

        monkeypatch.setattr("shutil.which", lambda _: "/usr/bin/fake-claude")

        async def _fake_exec(*args, **kwargs):
            raise FileNotFoundError("intentional")

        monkeypatch.setattr("asyncio.create_subprocess_exec", _fake_exec)

        await session.start()

        regenerator.assert_not_called()


# ═══════════════════════════════════════════════════════════════════
# AgentPool._make_session_mcp_regenerator — orchestration
# ═══════════════════════════════════════════════════════════════════


class TestPoolMcpRegenerator:
    """AgentPool builds the per-session regenerator closure that Session
    calls when its config goes missing. Closure tries to re-clone from the
    pool's base config; if the base is also missing, asks the bridge via
    base_mcp_config_regenerator. Returns None on unrecoverable failure.
    """

    def test_base_missing_no_base_regenerator_returns_none(self, tmp_path):
        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(tmp_path / "never_existed.json")
        # No base_mcp_config_regenerator wired.

        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        assert result is None

    def test_base_missing_base_regenerator_raises_returns_none(self, tmp_path):
        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(tmp_path / "never_existed.json")

        def base_regen_raises():
            raise RuntimeError("simulated bridge failure")

        pool.set_base_mcp_config_regenerator(base_regen_raises)
        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        assert result is None

    def test_base_missing_base_regenerator_returns_invalid_returns_none(self, tmp_path):
        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(tmp_path / "missing.json")

        # Base regen returns a path that also doesn't exist (regen wrote file
        # but it got swept again, or regen has a bug).
        pool.set_base_mcp_config_regenerator(
            lambda: str(tmp_path / "still_missing.json")
        )
        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        assert result is None

    def test_base_regenerator_called_when_base_missing(self, tmp_path, monkeypatch):
        # Verify the base_regenerator gets called when pool's cached base
        # path doesn't exist. Mock _create_session_mcp_config so we don't
        # have to set up the full token/clone machinery.
        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(tmp_path / "missing.json")

        fresh_base = tmp_path / "fresh_base.json"
        fresh_base.write_text('{"mcpServers": {}}')

        base_regen = MagicMock(return_value=str(fresh_base))
        pool.set_base_mcp_config_regenerator(base_regen)

        # Mock _create_session_mcp_config to skip heavy clone logic.
        # 3-tuple: (token_file, mcp_config, owns_private_clone).
        cloned_path = str(tmp_path / "session_clone.json")
        monkeypatch.setattr(
            pool,
            "_create_session_mcp_config",
            lambda pool_key, base_config_path=None: (None, cloned_path, True),
        )

        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        base_regen.assert_called_once()
        # Pool's base path should now be the fresh one.
        assert pool._mcp_config_path == str(fresh_base)
        assert result == cloned_path

    def test_base_exists_skips_base_regenerator(self, tmp_path, monkeypatch):
        # When pool's cached base config exists, skip base regeneration
        # and just re-clone for the session.
        base = tmp_path / "existing_base.json"
        base.write_text('{"mcpServers": {}}')

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        base_regen = MagicMock(return_value=None)
        pool.set_base_mcp_config_regenerator(base_regen)

        cloned_path = str(tmp_path / "session_clone.json")
        monkeypatch.setattr(
            pool,
            "_create_session_mcp_config",
            lambda pool_key, base_config_path=None: (None, cloned_path, True),
        )

        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        base_regen.assert_not_called()
        assert result == cloned_path

    def test_clone_failure_returns_none(self, tmp_path, monkeypatch):
        # Base is fine but the per-session clone fails (e.g., couldn't
        # extract token from base, or filesystem error). Should return None
        # so Session fails loud.
        base = tmp_path / "existing_base.json"
        base.write_text('{"mcpServers": {}}')

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        # _create_session_mcp_config returns (None, None, False) on real failure.
        monkeypatch.setattr(
            pool,
            "_create_session_mcp_config",
            lambda pool_key, base_config_path=None: (None, None, False),
        )

        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        assert result is None


# ═══════════════════════════════════════════════════════════════════
# HTTP-only base: no per-session clone, fall back to base directly
# ═══════════════════════════════════════════════════════════════════


HTTP_BASE_CONFIG = (
    '{"mcpServers": {"pixsim": {"type": "http",'
    ' "url": "http://127.0.0.1:9999/mcp",'
    ' "headers": {"Authorization": "Bearer fake-token"}}}}'
)


class TestHttpOnlyBaseNoClone:
    """For HTTP-mode bases, ``clone_mcp_config_for_session`` returns None by
    design — token rides in headers, nothing per-session to override.
    ``_create_session_mcp_config`` must surface that as ``(None, base)`` so
    both the spawn site and the regenerator hand the base path back to the
    session. Returning ``(None, None)`` here would conflate "no clone needed"
    with "real failure" and break the regenerator path (the original symptom:
    "regenerator returned None" after %TEMP% sweep recovery).
    """

    def test_http_only_base_returns_base_path(self, tmp_path):
        base = tmp_path / "default.json"
        base.write_text(HTTP_BASE_CONFIG)

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        token_path, mcp_path, owns = pool._create_session_mcp_config("pool-key-http")

        # No per-session token file — HTTP identity is in headers.
        assert token_path is None
        # MCP path is the base itself (not None — that would mean failure).
        assert mcp_path == str(base)
        # NOT owned — it's the shared base; teardown must not delete it.
        assert owns is False

    def test_stdio_base_still_clones(self, tmp_path):
        # Sanity: STDIO bases still go through clone_mcp_config_for_session
        # and produce a session-specific token file + cloned config path.
        base = tmp_path / "default.json"
        base.write_text(
            '{"mcpServers": {"pixsim": {"command": "python",'
            ' "args": ["mcp_server.py"],'
            ' "env": {"PIXSIM_API_TOKEN": "seed-token-value"}}}}'
        )

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        token_path, mcp_path, owns = pool._create_session_mcp_config("pool-key-stdio")

        assert token_path is not None
        assert mcp_path is not None
        # Cloned path is distinct from base.
        assert mcp_path != str(base)
        # Private clone — this pool owns it and must clean it up.
        assert owns is True

    def test_regenerator_recovers_when_http_base_swept(self, tmp_path):
        # Integration shape: pool's cached HTTP base path is missing (Windows
        # %TEMP% / Storage Sense sweep). Bridge regenerator re-writes it.
        # Regenerator's step 2 must hand the (rewritten) base path back to
        # the session, not return None. This is the exact path that produced
        # the symptom: "MCP config missing at ... and regenerator returned
        # None. Refusing to start session without MCP."
        missing = tmp_path / "default.json"
        # Don't write yet — pool starts with cached path that doesn't exist.

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(missing)

        def base_regen() -> str:
            # Simulate the bridge re-writing the HTTP base config.
            missing.write_text(HTTP_BASE_CONFIG)
            return str(missing)

        pool.set_base_mcp_config_regenerator(base_regen)

        regen = pool._make_session_mcp_regenerator("pool-key-http-recover")
        result = regen()

        # Must NOT be None — that's the bug we're fixing. Session would
        # refuse to start otherwise.
        assert result == str(missing)
        # And the rewritten base is on disk for the session to consume.
        import os as _os
        assert _os.path.exists(result)


# ═══════════════════════════════════════════════════════════════════
# P0: session teardown must not unlink the SHARED base config
# ═══════════════════════════════════════════════════════════════════


class TestCleanupDoesNotDeleteSharedBase:
    """`_cleanup_session_files` must only delete files genuinely private to
    the session. In HTTP mode every session points at the shared base
    (`~/.pixsim/mcp/default.json`), so an unconditional unlink on evict /
    idle-evict deletes MCP out from under every other live session and the
    bridge cache — a regenerate storm.
    Plan: mcp-server-reliability / cleanup-must-not-delete-shared-base.
    """

    def test_http_session_teardown_preserves_shared_base(self, tmp_path):
        base = tmp_path / "default.json"
        base.write_text(HTTP_BASE_CONFIG)

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        # HTTP session: no token file, no owned clone, _mcp_config_path = base.
        session = AgentCmdSession(
            session_id="http-sess",
            mcp_config_path=str(base),
            token_file_path=None,
            owned_mcp_config_path=None,
        )

        pool._cleanup_session_files(session)

        # The shared base must survive teardown.
        assert base.exists()

    def test_stdio_session_teardown_removes_private_clone(self, tmp_path):
        base = tmp_path / "default.json"
        base.write_text('{"mcpServers": {"pixsim": {"command": "python"}}}')
        clone = tmp_path / "session_clone.json"
        clone.write_text("{}")
        tok = tmp_path / "session.token"
        tok.write_text("t")

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        session = AgentCmdSession(
            session_id="stdio-sess",
            mcp_config_path=str(clone),
            token_file_path=str(tok),
            owned_mcp_config_path=str(clone),
        )

        pool._cleanup_session_files(session)

        # Private clone + token file removed; shared base untouched.
        assert not clone.exists()
        assert not tok.exists()
        assert base.exists()

    def test_owned_path_decoupled_from_reassigned_mcp_config_path(self, tmp_path):
        # Regression guard: configure()/regenerator reassign _mcp_config_path
        # to the shared base even on STDIO sessions. Cleanup keys off the
        # decoupled owned path, so it still deletes the right (private) file
        # and never the base — regardless of _mcp_config_path's current value.
        base = tmp_path / "default.json"
        base.write_text(HTTP_BASE_CONFIG)
        clone = tmp_path / "old_clone.json"
        clone.write_text("{}")

        pool = AgentPool(pool_size=1)
        pool._mcp_config_path = str(base)

        session = AgentCmdSession(
            session_id="reassigned-sess",
            mcp_config_path=str(clone),
            owned_mcp_config_path=str(clone),
        )
        # Simulate configure() stamping the base onto the session.
        session._mcp_config_path = str(base)

        pool._cleanup_session_files(session)

        assert not clone.exists()  # owned file still cleaned
        assert base.exists()       # base never touched despite being _mcp_config_path


# ═══════════════════════════════════════════════════════════════════
# P2/B: one home for the regenerate-or-fail decision tree
# Plan: mcp-server-reliability / consolidate-mcp-config-resolution
# ═══════════════════════════════════════════════════════════════════


class TestResolveMcpConfigDecisionMatrix:
    """`_resolve_mcp_config` is the single place the regenerate-or-fail
    contract lives. Cover the full matrix directly (sync, no subprocess).
    """

    def _session(self, path, regen=None):
        return AgentCmdSession(
            session_id="resolve-test",
            mcp_config_path=path,
            mcp_config_regenerator=regen,
        )

    def test_no_path_returns_none(self):
        assert self._session(None)._resolve_mcp_config() is None

    def test_existing_path_used_as_is(self, tmp_path):
        cfg = tmp_path / "c.json"
        cfg.write_text("{}")
        s = self._session(str(cfg))
        assert s._resolve_mcp_config() == str(cfg)

    def test_missing_no_regenerator_legacy_none(self, tmp_path):
        # Back-compat: standalone Session w/o pool launches MCP-less.
        s = self._session(str(tmp_path / "gone.json"))
        assert s._resolve_mcp_config() is None

    def test_missing_regenerator_raises_is_unavailable(self, tmp_path):
        def boom():
            raise RuntimeError("bridge down")

        s = self._session(str(tmp_path / "gone.json"), regen=boom)
        with pytest.raises(MCPConfigUnavailable, match="regeneration raised"):
            s._resolve_mcp_config()

    def test_missing_regenerator_returns_none_is_unavailable(self, tmp_path):
        s = self._session(str(tmp_path / "gone.json"), regen=lambda: None)
        with pytest.raises(MCPConfigUnavailable, match="regenerator returned"):
            s._resolve_mcp_config()

    def test_missing_regenerator_returns_nonexistent_is_unavailable(self, tmp_path):
        ghost = str(tmp_path / "still-gone.json")
        s = self._session(str(tmp_path / "gone.json"), regen=lambda: ghost)
        with pytest.raises(MCPConfigUnavailable, match="regenerator returned"):
            s._resolve_mcp_config()

    def test_missing_regenerator_returns_valid_path_adopts_it(self, tmp_path):
        fresh = tmp_path / "fresh.json"
        fresh.write_text("{}")
        s = self._session(str(tmp_path / "gone.json"), regen=lambda: str(fresh))
        resolved = s._resolve_mcp_config()
        assert resolved == str(fresh)
        # Adopted onto the session for the subsequent launch.
        assert s._mcp_config_path == str(fresh)
