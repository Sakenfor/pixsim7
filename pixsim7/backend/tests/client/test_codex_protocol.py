"""Unit tests for Codex app-server protocol normalization/parsing."""

from __future__ import annotations

import asyncio

TEST_SUITE = {
    "id": "client-codex-protocol",
    "label": "Client Codex Protocol Tests",
    "kind": "unit",
    "category": "client/protocols",
    "covers": [
        "pixsim7/client/protocols.py",
    ],
    "order": 18.7,
}

import pytest

try:
    from pixsim7.client.protocols import CodexAppServerProtocol
    from pixsim7.client.session import AgentCmdSession

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestCodexAuthMethodOverride:
    def test_forces_chatgpt_auth_on_every_spawn(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex")
        assert "preferred_auth_method=chatgpt" in cmd
        # -c override must be present even with no model/effort.
        bare = p.build_start_cmd("codex")
        assert "preferred_auth_method=chatgpt" in bare


class TestCodexReasoningEffortNormalization:
    def test_maps_claude_max_to_xhigh(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex", reasoning_effort="max")
        assert "model_reasoning_effort=xhigh" in cmd

    def test_maps_minimal_to_low(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex", reasoning_effort="minimal")
        assert "model_reasoning_effort=low" in cmd

    def test_invalid_effort_falls_back_to_safe_default_for_non_default_model(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex", reasoning_effort="weird")
        assert "model_reasoning_effort=high" in cmd


class TestCodexErrorParsing:
    def test_parses_method_error_notification(self):
        p = CodexAppServerProtocol()
        evt = {
            "method": "error",
            "params": {"error": {"message": "The selected model is not available"}},
        }
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        assert "selected model" in parsed.text.lower()


class _FakeStdin:
    def write(self, _data):  # noqa: D401 - test stub
        pass

    async def drain(self):
        pass

    def close(self):
        pass


class _FakeProc:
    """Minimal stand-in so AgentSession.send_message believes it is alive."""

    returncode = None

    def __init__(self):
        self.stdin = _FakeStdin()


class TestCodexAgentMessageNotForwardedAsProgress:
    """Regression: Codex narrates between tool batches via completed
    `agent_message` items carrying full reply-like text. Those must be captured
    as the running result but NOT forwarded to the on_progress (thinking-bubble)
    channel — otherwise each narration repaints the bubble and reads as "the
    reply started over from scratch". Mirrors Claude's is_text_block suppression.
    See session.py send_message progress handling.
    """

    def _drive(self, events: list[dict]):
        async def _run():
            s = AgentCmdSession("test-session", command="codex")
            # send_message clears the queue, then writes turn/start, then reads.
            # Bypass the real subprocess and JSON-RPC startup.
            s._process = _FakeProc()
            s.cli_session_id = "thread-1"
            s._jsonrpc_id = 10  # normally set in start()

            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                # Let send_message clear the queue + emit turn/start first.
                await asyncio.sleep(0.05)
                for evt in events:
                    await s._response_queue.put(evt)

            feeder = asyncio.create_task(feed())
            result = await s.send_message("hi", timeout=5, on_progress=on_progress)
            await feeder
            return result, progress

        return asyncio.run(_run())

    @staticmethod
    def _agent_message(text: str) -> dict:
        return {"method": "item/completed", "params": {"item": {"type": "agentMessage", "text": text}}}

    @staticmethod
    def _tool_call(name: str) -> dict:
        return {"method": "item/completed", "params": {"item": {"type": "toolCall", "name": name}}}

    def test_completed_agent_messages_are_not_forwarded_but_tool_calls_are(self):
        events = [
            self._agent_message("You're asking whether prompt tools should preview..."),
            self._tool_call("shell_command"),
            self._agent_message("Short answer: yes, it should use preview."),
            {"method": "turn/completed", "params": {}},
        ]
        result, progress = self._drive(events)

        # Final result is the last agent_message text.
        assert result == "Short answer: yes, it should use preview."

        forwarded = [detail for _, detail in progress]
        # No agent narration leaked into the progress/thinking channel.
        assert not any("asking whether" in d for d in forwarded)
        assert not any("Short answer" in d for d in forwarded)
        # Tool-call progress is still surfaced.
        assert any("shell_command" in d for d in forwarded)
