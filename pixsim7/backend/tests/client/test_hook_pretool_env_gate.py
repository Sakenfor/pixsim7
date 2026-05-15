"""Tests for ``hook_pretool.py``'s PIXSIM_BRIDGE_MANAGED env-gate.

Plan: agent-confirmation-hooks / cross-tab-fanout-fix.

The PreToolUse hook is configured globally in the user's Claude Code
settings — so it fires for EVERY Claude CLI on the machine, not just
sessions the pixsim bridge spawned. Bridge-spawned sessions carry
``PIXSIM_BRIDGE_MANAGED=1`` (set by ``token_manager.build_mcp_env`` and
``bridge.py`` when launching the pool's MCP server / agent processes).
Foreign Claude CLIs (the user's own terminal, scheduled jobs, parallel
worktrees) lack it. If those post to the bridge's ``/confirm``,
``_hook_confirm``'s reverse-lookup misses, the synthetic_fallback
broadcasts the prompt into every in-flight chat tab — the exact
cross-tab leak we hit.

These tests pin the early-return behavior at the top of ``main()``.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-hook-pretool-env-gate",
    "label": "Hook pretool bridge-managed env gate",
    "kind": "unit",
    "category": "client/agent-confirmation-hooks",
    "covers": [
        "pixsim7/client/hook_pretool.py",
    ],
    "order": 19.2,
}

import io
import json
import os
import sys
from unittest.mock import patch

import pytest

from pixsim7.client import hook_pretool


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    """Each test owns the env-var state explicitly."""
    monkeypatch.delenv("PIXSIM_BRIDGE_MANAGED", raising=False)
    yield


def _payload_stdin(payload: dict) -> io.StringIO:
    return io.StringIO(json.dumps(payload))


def test_foreign_session_returns_without_touching_stdin_or_network(monkeypatch):
    """When PIXSIM_BRIDGE_MANAGED is unset (foreign Claude CLI), main()
    must short-circuit before reading stdin so it doesn't accidentally
    consume a payload meant for Claude Code's native UI pipeline, and
    before any network call to the bridge.
    """
    # Sentinel stdin: if main() reads it, the test fails (it shouldn't).
    class _ExplodeOnRead:
        def read(self) -> str:
            raise AssertionError("stdin must not be read for foreign sessions")

    monkeypatch.setattr(sys, "stdin", _ExplodeOnRead())

    post_calls: list = []
    monkeypatch.setattr(
        hook_pretool, "_post_confirm",
        lambda payload: post_calls.append(payload) or {"approved": True},
        raising=False,
    )

    # Should return cleanly.
    hook_pretool.main()
    assert post_calls == []


def test_bridge_managed_session_proceeds_to_dispatch(monkeypatch):
    """When PIXSIM_BRIDGE_MANAGED=1, main() must read stdin and dispatch
    to the approval/AskUserQuestion handlers as before — the env-gate is
    a foreign-session filter, not a kill-switch for bridge sessions.
    """
    monkeypatch.setenv("PIXSIM_BRIDGE_MANAGED", "1")

    stdin_payload = {
        "session_id": "claude-cli-uuid",
        "tool_name": "Bash",
        "tool_input": {"command": "ls"},
    }
    monkeypatch.setattr(sys, "stdin", _payload_stdin(stdin_payload))

    captured: list[dict] = []

    def _fake_handle_approval(tool_name, tool_input, *, cli_session_id=None):
        captured.append({
            "tool_name": tool_name,
            "tool_input": tool_input,
            "cli_session_id": cli_session_id,
        })

    monkeypatch.setattr(hook_pretool, "_handle_approval", _fake_handle_approval)

    hook_pretool.main()

    assert len(captured) == 1
    assert captured[0]["tool_name"] == "Bash"
    assert captured[0]["tool_input"] == {"command": "ls"}
    assert captured[0]["cli_session_id"] == "claude-cli-uuid"


def test_bridge_managed_routes_askuserquestion_to_question_handler(monkeypatch):
    """The dispatch by tool_name still works after the env-gate runs."""
    monkeypatch.setenv("PIXSIM_BRIDGE_MANAGED", "1")

    stdin_payload = {
        "session_id": "claude-cli-uuid",
        "tool_name": "AskUserQuestion",
        "tool_input": {"questions": []},
    }
    monkeypatch.setattr(sys, "stdin", _payload_stdin(stdin_payload))

    captured: list[dict] = []

    def _fake_handle(tool_input, *, cli_session_id=None):
        captured.append({"tool_input": tool_input, "cli_session_id": cli_session_id})

    monkeypatch.setattr(hook_pretool, "_handle_ask_user_question", _fake_handle)

    hook_pretool.main()

    assert len(captured) == 1
    assert captured[0]["cli_session_id"] == "claude-cli-uuid"
