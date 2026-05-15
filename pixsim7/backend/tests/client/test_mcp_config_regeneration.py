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

from pixsim7.client.session import AgentCmdSession, SessionState
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
        cloned_path = str(tmp_path / "session_clone.json")
        monkeypatch.setattr(
            pool,
            "_create_session_mcp_config",
            lambda pool_key, base_config_path=None: (None, cloned_path),
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
            lambda pool_key, base_config_path=None: (None, cloned_path),
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

        # _create_session_mcp_config returns (None, None) on failure.
        monkeypatch.setattr(
            pool,
            "_create_session_mcp_config",
            lambda pool_key, base_config_path=None: (None, None),
        )

        regen = pool._make_session_mcp_regenerator("pool-key-1")
        result = regen()

        assert result is None
