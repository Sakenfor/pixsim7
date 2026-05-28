"""Unit tests for Claude stream-json protocol parsing.

The "No response from agent" symptom traced to ClaudeProtocol silently
treating ``is_error=true`` result events as empty successful results — the
session returned "", the bridge sent ``ok:true response:""``, and the
frontend rendered the bare fallback. These tests pin the parser shape.
"""

from __future__ import annotations

TEST_SUITE = {
    "id": "client-claude-protocol",
    "label": "Client Claude Protocol Tests",
    "kind": "unit",
    "category": "client/protocols",
    "covers": [
        "pixsim7/client/protocols.py",
    ],
    "order": 18.6,
}

import pytest

try:
    from pixsim7.client.protocols import ClaudeProtocol

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestClaudeSuccessResult:
    def test_plain_result_event_returns_kind_result(self):
        p = ClaudeProtocol()
        evt = {
            "type": "result",
            "session_id": "abc-123",
            "result": "Hello there",
            "duration_ms": 1234,
        }
        parsed = p.parse_event(evt)
        assert parsed.kind == "result"
        assert parsed.text == "Hello there"
        assert parsed.session_id == "abc-123"
        assert parsed.duration_ms == 1234


class TestClaudeErrorResult:
    """The shape captured in the wild from a failed ``--resume``:

        {"type":"result","subtype":"error_during_execution",
         "duration_ms":0,"is_error":true, ...,
         "errors":[{"message":"…"}]}
    """

    def test_is_error_true_routes_to_kind_error(self):
        p = ClaudeProtocol()
        evt = {
            "type": "result",
            "subtype": "error_during_execution",
            "is_error": True,
            "duration_ms": 0,
            "session_id": "abc-123",
            "errors": [{"message": "Conversation not found"}],
            "stop_reason": "unknown",
        }
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        assert "Conversation not found" in parsed.text

    def test_subtype_error_prefix_routes_to_kind_error_even_without_is_error(self):
        p = ClaudeProtocol()
        evt = {
            "type": "result",
            "subtype": "error_max_turns",
            "duration_ms": 0,
        }
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        # subtype is rendered readable
        assert "error max turns" in parsed.text

    def test_falls_back_to_stop_reason_when_errors_empty(self):
        p = ClaudeProtocol()
        evt = {
            "type": "result",
            "is_error": True,
            "errors": [],
            "stop_reason": "max_tokens",
        }
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        assert "max_tokens" in parsed.text

    def test_no_detail_anywhere_still_returns_useful_message(self):
        p = ClaudeProtocol()
        evt = {"type": "result", "is_error": True}
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        assert parsed.text  # not empty — that was the original bug

    def test_separate_type_error_event_still_routes_to_kind_error(self):
        """Pre-existing path — Claude can also emit a top-level
        ``{"type":"error","error":{...}}`` event. The is_error result-event
        fix must not regress this."""
        p = ClaudeProtocol()
        evt = {"type": "error", "error": {"message": "rate limited"}}
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        assert "rate limited" in parsed.text


class TestClaudeResumeOnlyPassesSessionId:
    """A `--resume` must carry ONLY the session id. Re-asserting the
    conversation's model / reasoning effort / system prompt on resume makes the
    headless stream-json replay the stored assistant thinking blocks under a
    changed config, which the API rejects with 400 "thinking blocks ... cannot
    be modified" — a failure that never appears in interactive `claude --resume`
    (which passes none of these). Mirrors the long-standing --append-system-prompt
    guard. See protocols.py ClaudeProtocol.build_start_cmd.
    """

    def test_fresh_session_includes_model_effort_and_system_prompt(self):
        p = ClaudeProtocol()
        cmd = p.build_start_cmd(
            "claude", model="opus", reasoning_effort="high", system_prompt="be terse",
        )
        assert "--model" in cmd and "opus" in cmd
        assert "--effort" in cmd and "high" in cmd
        assert "--append-system-prompt" in cmd
        assert "--resume" not in cmd

    def test_resume_passes_only_session_id_not_conversation_params(self):
        p = ClaudeProtocol()
        cmd = p.build_start_cmd(
            "claude",
            resume_session_id="conv-abc",
            model="opus",
            reasoning_effort="high",
            system_prompt="be terse",
            mcp_config_path="/tmp/mcp.json",
        )
        assert "--resume" in cmd and "conv-abc" in cmd
        # None of the conversation-establishing flags ride along on resume.
        assert "--model" not in cmd
        assert "--effort" not in cmd
        assert "--append-system-prompt" not in cmd
        # Operational flags the resumed turn still needs are kept.
        assert "--mcp-config" in cmd and "/tmp/mcp.json" in cmd
