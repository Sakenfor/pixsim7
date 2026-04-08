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
