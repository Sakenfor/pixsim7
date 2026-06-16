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
    import asyncio
    import json as _json

    from pixsim7.client.protocols import ClaudeProtocol
    from pixsim7.client.session import AgentCmdSession

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

    def test_streams_partial_messages_on_fresh_and_resume(self):
        # --include-partial-messages must always be present: it is what feeds
        # session.py's inactivity watchdog a liveness signal during extended
        # thinking / long replies. Without it a healthy-but-quiet turn trips the
        # idle-gap timeout. Required on resume too (long turns happen there).
        p = ClaudeProtocol()
        fresh = p.build_start_cmd("claude", model="opus")
        resumed = p.build_start_cmd("claude", resume_session_id="conv-abc")
        assert "--include-partial-messages" in fresh
        assert "--include-partial-messages" in resumed


class TestClaudeRuntimeControl:
    """Live mid-session control via stdin ``control_request`` frames. The CLI
    accepts ``set_model`` to switch the model for subsequent turns without a
    respawn/resume (verified against the binary's control-request schema). Used
    to make the per-tab model dropdown take effect mid-conversation. (Effort has
    no equivalent live control on modern models, so it stays spawn-time.)
    """

    def test_supports_runtime_control(self):
        assert ClaudeProtocol().supports_runtime_control() is True

    def test_build_set_model_control_request_envelope(self):
        import json
        p = ClaudeProtocol()
        frame = p.build_control_request("set-model-1", "set_model", model="claude-opus-4-8")
        assert frame.endswith("\n")  # newline-delimited stdin frame
        obj = json.loads(frame)
        assert obj == {
            "type": "control_request",
            "request_id": "set-model-1",
            "request": {"subtype": "set_model", "model": "claude-opus-4-8"},
        }


class _RecordingStdin:
    def __init__(self):
        self.writes: list[bytes] = []

    def write(self, data):
        self.writes.append(data)

    async def drain(self):
        pass

    def close(self):
        pass


class _AliveProc:
    """Stand-in process that reports alive (returncode None)."""
    returncode = None

    def __init__(self):
        self.stdin = _RecordingStdin()


class TestApplyRuntimeModel:
    """Session.apply_runtime_model writes a ``set_model`` control frame to the
    live process and commits the switch only when the CLI acks with a matching
    ``control_response`` (success). Drives the per-tab model dropdown taking
    effect mid-conversation (agent_pool calls this before each turn).
    """

    def test_switch_writes_frame_and_commits_on_success(self):
        async def _run():
            s = AgentCmdSession("s", command="claude")
            s._process = _AliveProc()
            s._live_model = "claude-haiku-4-5"

            async def ack():
                await asyncio.sleep(0.02)
                await s._response_queue.put({
                    "type": "control_response",
                    "response": {"request_id": "set-model-1", "subtype": "success"},
                })

            feeder = asyncio.create_task(ack())
            ok = await s.apply_runtime_model("claude-opus-4-8")
            await feeder
            return ok, s

        ok, s = asyncio.run(_run())
        assert ok is True
        assert s._live_model == "claude-opus-4-8"
        assert s.cli_model == "claude-opus-4-8"
        # The set_model control frame was written to stdin.
        frames = [_json.loads(w.decode()) for w in s._process.stdin.writes]
        assert any(
            f.get("type") == "control_request"
            and f["request"] == {"subtype": "set_model", "model": "claude-opus-4-8"}
            for f in frames
        )

    def test_noop_when_model_unchanged_writes_nothing(self):
        async def _run():
            s = AgentCmdSession("s", command="claude")
            s._process = _AliveProc()
            s._live_model = "claude-opus-4-8"
            ok = await s.apply_runtime_model("claude-opus-4-8")
            return ok, s

        ok, s = asyncio.run(_run())
        assert ok is True
        assert s._process.stdin.writes == []  # no frame sent

    def test_empty_model_is_noop(self):
        async def _run():
            s = AgentCmdSession("s", command="claude")
            s._process = _AliveProc()
            s._live_model = "claude-opus-4-8"
            return await s.apply_runtime_model(""), s

        ok, s = asyncio.run(_run())
        assert ok is True
        assert s._process.stdin.writes == []

    def test_failure_response_does_not_commit(self):
        async def _run():
            s = AgentCmdSession("s", command="claude")
            s._process = _AliveProc()
            s._live_model = "claude-haiku-4-5"

            async def nack():
                await asyncio.sleep(0.02)
                await s._response_queue.put({
                    "type": "control_response",
                    "response": {"request_id": "set-model-1", "subtype": "error", "error": "no such model"},
                })

            feeder = asyncio.create_task(nack())
            ok = await s.apply_runtime_model("bogus-model")
            await feeder
            return ok, s

        ok, s = asyncio.run(_run())
        assert ok is False
        assert s._live_model == "claude-haiku-4-5"  # unchanged

    def test_codex_protocol_has_no_live_control(self):
        async def _run():
            s = AgentCmdSession("s", command="codex")
            s._process = _AliveProc()
            s._live_model = "gpt-5.3-codex"
            return await s.apply_runtime_model("gpt-5.4"), s

        ok, s = asyncio.run(_run())
        assert ok is False  # Codex can't switch live — falls back to spawn-time
        assert s._process.stdin.writes == []
