"""Tests for the MCP server's per-request tool-focus filtering.

Plan: ``mcp-http-bridge-session-resolution``.

Covers ``resolve_focus_filter_names`` — the pure helper behind
``handle_list_tools`` that turns the ``X-Scope-Key`` header into the set of
tool names a session may see. The important guard: a scope value that names
no real contract (an audience word like ``"dev"``, or a tab scope key that
leaked into the header) must fall back to the full toolset, NOT collapse to
the core-only set.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-mcp-server-focus-filter",
    "label": "MCP server tool-focus filtering",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 19.1,
}

import pytest

from pixsim7.client import mcp_server


_BUILTINS = {"register_session", "log_work", "call_api", "ask_user"}
_CORE = {"plans_management", "project_files"}


def _contracts() -> list[dict]:
    """Minimal contract list spanning the two core contracts plus extras."""
    return [
        {"id": "prompts.authoring", "sub_endpoints": [], "tool_names": []},
        {"id": "blocks.discovery", "sub_endpoints": [], "tool_names": []},
        {"id": "plans.management", "sub_endpoints": [], "tool_names": []},
        {"id": "project.files", "sub_endpoints": [], "tool_names": []},
    ]


@pytest.fixture(autouse=True)
def _force_grouped(monkeypatch):
    # Grouped mode names a contract by its sanitized id (prompts.authoring ->
    # prompts_authoring), which keeps the assertions deterministic.
    monkeypatch.setattr(mcp_server, "MCP_GROUPED", True)


class TestResolveFocusFilterNames:

    def test_none_scope_means_full_toolset(self):
        assert mcp_server.resolve_focus_filter_names(None, _contracts()) is None

    def test_empty_scope_means_full_toolset(self):
        assert mcp_server.resolve_focus_filter_names("", _contracts()) is None

    def test_none_contracts_means_full_toolset(self):
        # Cache not populated yet — never narrow against an unknown world.
        assert mcp_server.resolve_focus_filter_names("prompts.authoring", None) is None

    def test_unmatched_audience_word_falls_back_to_full_toolset(self):
        # "dev" is an audience, not a contract id — must NOT collapse to core.
        assert mcp_server.resolve_focus_filter_names("dev", _contracts()) is None

    def test_leaked_tab_scope_key_falls_back_to_full_toolset(self):
        # The exact pre-fix bug shape: tab:<uuid> in X-Scope-Key.
        assert mcp_server.resolve_focus_filter_names("tab:abc-123", _contracts()) is None

    def test_matched_focus_narrows_to_builtins_core_and_focus(self):
        names = mcp_server.resolve_focus_filter_names("prompts.authoring", _contracts())
        assert names is not None
        assert _BUILTINS <= names          # builtins always included
        assert _CORE <= names              # core contracts always force-added
        assert "prompts_authoring" in names
        assert "blocks_discovery" not in names  # not in focus → excluded

    def test_underscore_contract_id_is_normalized(self):
        # Frontend / config may send the underscore tool-name form.
        names = mcp_server.resolve_focus_filter_names("prompts_authoring", _contracts())
        assert names is not None
        assert "prompts_authoring" in names

    def test_mixed_valid_and_garbage_still_narrows_on_the_valid_one(self):
        names = mcp_server.resolve_focus_filter_names("dev,prompts.authoring", _contracts())
        assert names is not None
        assert "prompts_authoring" in names
        assert "blocks_discovery" not in names
