"""Tests for the MCP server's operation-aware approval gate.

Plan: agent-confirmation-hooks.

The in-server gate (``mcp_server.handle_call_tool``) is the real per-tool MCP
approval gate — cross-engine, so it applies to Codex too (which never reads
``.claude/``). It is operation-aware: a gated GROUP prompts only on its WRITE
operations, a fine-grained tool (``group__operation``) gates that one op any
method, and a ``group::endpoint_id`` op-pin gates one exact operation
regardless of method. Covers ``_resolve_operation`` (resolve method/endpoint
from a tool call) and ``_tool_needs_approval`` (the decision).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-mcp-tool-approval-gate",
    "label": "MCP tool approval gate (operation-aware)",
    "kind": "unit",
    "category": "client/agent-confirmation-hooks",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 19.3,
}

import pytest

from pixsim7.client import mcp_server


@pytest.fixture
def routes(monkeypatch):
    """Install a known set of grouped + fine-grained routes + one alias."""
    dynamic = {
        "_grouped::assets_management": {"grouped": True},
        "assets_management::list_assets": {"method": "GET", "path_template": "/assets", "summary": "List"},
        "assets_management::delete_asset": {"method": "DELETE", "path_template": "/assets/{id}", "summary": "Delete"},
        "assets_management::create_asset": {"method": "POST", "path_template": "/assets", "summary": "Create"},
        # A fine-grained (non-grouped) tool.
        "blocks_discovery__search": {"method": "GET", "path_template": "/blocks"},
    }
    aliases = {"legacy_delete": "assets_management::delete_asset"}
    monkeypatch.setattr(mcp_server, "_dynamic_routes", dynamic)
    monkeypatch.setattr(mcp_server, "_tool_aliases", aliases)
    return dynamic


# ── _resolve_operation ──────────────────────────────────────────────────

def test_resolve_grouped(routes):
    assert mcp_server._resolve_operation("assets_management", {"endpoint": "delete_asset"}) == ("DELETE", "delete_asset")
    assert mcp_server._resolve_operation("assets_management", {"endpoint": "list_assets"}) == ("GET", "list_assets")


def test_resolve_grouped_missing_endpoint(routes):
    # No 'endpoint' arg → route unresolved → method None (fail-safe), no endpoint id.
    assert mcp_server._resolve_operation("assets_management", {}) == (None, None)


def test_resolve_call_api(routes):
    assert mcp_server._resolve_operation("call_api", {"method": "delete", "path": "/x"}) == ("DELETE", None)
    assert mcp_server._resolve_operation("call_api", {}) == ("GET", None)  # defaults to GET


def test_resolve_fine_grained(routes):
    assert mcp_server._resolve_operation("blocks_discovery__search", {}) == ("GET", None)


def test_resolve_alias_to_grouped_route(routes):
    assert mcp_server._resolve_operation("legacy_delete", {}) == ("DELETE", "delete_asset")


# ── _tool_needs_approval: group-level (writes only) ─────────────────────

def test_group_gates_writes_only():
    aset = {"assets_management"}
    assert mcp_server._tool_needs_approval("assets_management", aset, method="DELETE", endpoint_id="delete_asset") is True
    assert mcp_server._tool_needs_approval("assets_management", aset, method="POST", endpoint_id="create_asset") is True
    assert mcp_server._tool_needs_approval("assets_management", aset, method="GET", endpoint_id="list_assets") is False


def test_group_unresolved_method_fails_safe():
    # When the method can't be resolved we prompt rather than risk a silent write.
    assert mcp_server._tool_needs_approval("assets_management", {"assets_management"}, method=None, endpoint_id=None) is True


def test_not_ticked_never_prompts():
    assert mcp_server._tool_needs_approval("assets_management", {"prompts_authoring"}, method="DELETE", endpoint_id="delete_asset") is False


# ── _tool_needs_approval: op-pins (exact op, any method) ────────────────

def test_op_pin_gates_exact_op_any_method():
    aset = {"assets_management::list_assets"}  # pin a READ
    assert mcp_server._tool_needs_approval("assets_management", aset, method="GET", endpoint_id="list_assets") is True
    # A different op in the same group is untouched.
    assert mcp_server._tool_needs_approval("assets_management", aset, method="DELETE", endpoint_id="delete_asset") is False


def test_op_pin_bare_endpoint_id():
    assert mcp_server._tool_needs_approval("assets_management", {"list_assets"}, method="GET", endpoint_id="list_assets") is True


# ── _tool_needs_approval: fine-grained tool (one op, any method) ────────

def test_fine_grained_tool_gates_any_method():
    # In fine-grained mode the tool name IS one operation, so ticking it gates
    # it regardless of method — even a GET read.
    assert mcp_server._tool_needs_approval("blocks_discovery__search", {"blocks_discovery__search"}, method="GET", endpoint_id=None) is True
