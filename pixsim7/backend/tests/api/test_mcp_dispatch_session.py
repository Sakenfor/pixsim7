"""Tests for MCP dispatch session resolution — verifies the in-process
session identity channel used by the bridge to tell the MCP server which
chat session a log_work call belongs to."""
from __future__ import annotations

TEST_SUITE = {
    "id": "mcp-dispatch-session",
    "label": "MCP Dispatch Session Resolution",
    "kind": "unit",
    "category": "client/mcp",
    "subcategory": "session",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 35,
}

import os
from unittest.mock import patch

import pytest

try:
    from pixsim7.client.mcp_server import (
        _read_session_sidecar,
        set_dispatch_session,
        _dispatch_session_id,
        _request_session_id,
    )
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestDispatchSessionResolution:
    """Verify the 4-level resolution order in _read_session_sidecar."""

    def setup_method(self):
        """Reset dispatch session state between tests."""
        set_dispatch_session(None)

    def teardown_method(self):
        set_dispatch_session(None)

    def test_dispatch_session_set_and_read(self):
        """set_dispatch_session value is returned by _read_session_sidecar."""
        set_dispatch_session("sess-abc-123")
        result = _read_session_sidecar()
        assert result == "sess-abc-123"

    def test_dispatch_session_none_skips_to_file(self):
        """When dispatch session is None, falls through to file-based resolution."""
        set_dispatch_session(None)
        # With no dispatch session and no PIXSIM_TOKEN_FILE, should return None
        with patch.dict(os.environ, {}, clear=False):
            # Remove PIXSIM_TOKEN_FILE if set
            os.environ.pop("PIXSIM_TOKEN_FILE", None)
            result = _read_session_sidecar()
        assert result is None

    def test_contextvar_takes_priority_over_dispatch(self):
        """HTTP contextvar (priority 1) beats dispatch session (priority 2)."""
        set_dispatch_session("dispatch-sess")
        token = _request_session_id.set("header-sess")
        try:
            result = _read_session_sidecar()
            assert result == "header-sess"
        finally:
            _request_session_id.reset(token)

    def test_dispatch_clears_stale_state(self):
        """Setting dispatch to None clears stale value from previous dispatch."""
        set_dispatch_session("old-session")
        assert _read_session_sidecar() == "old-session"

        set_dispatch_session(None)
        # Should no longer return the old session
        result = _read_session_sidecar()
        assert result != "old-session"

    def test_dispatch_session_overwrite(self):
        """Sequential dispatches overwrite correctly (no accumulation)."""
        set_dispatch_session("session-A")
        assert _read_session_sidecar() == "session-A"

        set_dispatch_session("session-B")
        assert _read_session_sidecar() == "session-B"


class TestSetDispatchSession:
    """Verify set_dispatch_session API."""

    def teardown_method(self):
        set_dispatch_session(None)

    def test_set_string(self):
        set_dispatch_session("test-id")
        import pixsim7.client.mcp_server as mod
        assert mod._dispatch_session_id == "test-id"

    def test_set_none(self):
        set_dispatch_session("something")
        set_dispatch_session(None)
        import pixsim7.client.mcp_server as mod
        assert mod._dispatch_session_id is None


class TestSysPathBootstrap:
    """Verify the MCP server prepends the repo root to sys.path at module load.

    Regression guard: the MCP server is launched as a raw script
    (`python path/to/mcp_server.py`), not as a module. Without this
    bootstrap, `from pixsim7.common.scope_helpers import ...` inside
    ``_normalize_profile_id`` blows up with ModuleNotFoundError whenever
    the MCP client is started from a cwd other than the repo root —
    which is what caused `log_work` to fail for users.
    """

    def test_repo_root_attribute_present_and_correct(self):
        import pathlib
        import pixsim7.client.mcp_server as mod

        expected_root = pathlib.Path(mod.__file__).resolve().parents[2]
        assert hasattr(mod, "_repo_root"), (
            "mcp_server.py must define _repo_root at module load for sys.path bootstrap"
        )
        assert pathlib.Path(mod._repo_root).resolve() == expected_root

    def test_repo_root_is_on_sys_path_after_import(self):
        import pathlib
        import sys
        import pixsim7.client.mcp_server as mod

        assert pathlib.Path(mod._repo_root).resolve() == pathlib.Path(mod._repo_root).resolve()
        # Either the literal string or any path resolving to the same dir.
        root = pathlib.Path(mod._repo_root).resolve()
        on_path = any(
            pathlib.Path(p).resolve() == root for p in sys.path if p
        )
        assert on_path, (
            f"_repo_root ({root}) must be on sys.path after mcp_server import "
            f"so `from pixsim7.*` imports resolve regardless of cwd."
        )

    def test_lazy_pixsim_import_resolves(self):
        """Calling _normalize_profile_id exercises the lazy
        `from pixsim7.common.scope_helpers import normalize_profile_id`
        that originally failed. Must not raise ModuleNotFoundError.
        """
        from pixsim7.client.mcp_server import _normalize_profile_id

        assert _normalize_profile_id("profile-123") == "profile-123"
        assert _normalize_profile_id(None) is None


class TestAutoRegisterIdempotency:
    """Cover _auto_register_if_needed re-entry guards. These are elusive
    because failure manifests as duplicate ChatSession rows on the backend
    — only visible when a user inspects the sessions list and sees two
    entries for what should be one session.
    """

    def _reset_module_state(self):
        import pixsim7.client.mcp_server as mod
        mod._registered_session_id = None
        mod._resolved_profile_id = None
        mod._bridge_session_cache.clear()

    def setup_method(self):
        self._reset_module_state()

    def teardown_method(self):
        self._reset_module_state()
        os.environ.pop("PIXSIM_BRIDGE_MANAGED", None)

    @pytest.mark.asyncio
    async def test_skips_when_bridge_managed_env_set(self):
        """PIXSIM_BRIDGE_MANAGED means ws_chat owns ChatSession creation —
        MCP auto-register must NOT fire a POST that would create a second
        ChatSession row competing with the bridge-owned one."""
        import pixsim7.client.mcp_server as mod

        proxy_calls = []

        async def fake_proxy(**kwargs):
            proxy_calls.append(kwargs)
            return []

        os.environ["PIXSIM_BRIDGE_MANAGED"] = "1"
        with patch.object(mod, "_proxy", fake_proxy):
            await mod._auto_register_if_needed()

        assert mod._registered_session_id == "__bridge__"
        assert proxy_calls == [], "bridge-managed must not POST register-chat-session"

    @pytest.mark.asyncio
    async def test_short_circuits_when_already_registered(self):
        """Second tool call must not re-register. Duplicate registration
        would generate a duplicate heartbeat task and a second ChatSession
        upsert — both masking the real state on the backend."""
        import pixsim7.client.mcp_server as mod

        mod._registered_session_id = "preset-sess"

        proxy_calls = []

        async def fake_proxy(**kwargs):
            proxy_calls.append(kwargs)
            return []

        with patch.object(mod, "_proxy", fake_proxy):
            await mod._auto_register_if_needed()

        assert mod._registered_session_id == "preset-sess"
        assert proxy_calls == []

    @pytest.mark.asyncio
    async def test_skips_when_no_token_available(self):
        """No token = no auth = no registration. Previously this silently
        left `_registered_session_id` unset and tool calls proceeded as
        unregistered; pinning the behavior prevents a regression where a
        register call fires with an empty Authorization header."""
        import pixsim7.client.mcp_server as mod

        proxy_calls = []

        async def fake_proxy(**kwargs):
            proxy_calls.append(kwargs)
            return []

        with patch.object(mod, "_get_token", lambda: ""), \
             patch.object(mod, "_proxy", fake_proxy):
            await mod._auto_register_if_needed()

        assert mod._registered_session_id is None
        assert proxy_calls == []
