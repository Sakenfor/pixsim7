"""Unit tests for Codex app-server protocol normalization/parsing."""

from __future__ import annotations

import asyncio
import time

TEST_SUITE = {
    "id": "client-codex-protocol",
    "label": "Client Codex Protocol Tests",
    "kind": "unit",
    "category": "client/protocols",
    "covers": [
        "pixsim7/client/protocols.py",
        "pixsim7/client/session.py",
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


class TestToolInflightHeartbeat:
    """A tool that runs silently (Bash script, blocking MCP call, subagent)
    emits no stdout while it works. The session re-arms its inactivity timeout
    during that silence and must pulse a `tool_running` heartbeat — carrying the
    last action plus elapsed seconds — so the thinking bubble reads as "still
    working" rather than a frozen last line. See session.py send_message.
    """

    @staticmethod
    def _tool_use(command: str) -> dict:
        return {
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": command}}]},
        }

    def test_silent_tool_pulses_heartbeat_with_elapsed(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()

            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                await asyncio.sleep(0.05)
                # Tool starts → opens the silent window (tool_inflight=True).
                await s._response_queue.put(self._tool_use("pytest -q"))
                # Stay silent long enough for one re-arm (slice = min(timeout,30)
                # = 1s here), then finish the turn.
                await asyncio.sleep(1.35)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            # timeout=1 → the in-flight re-arm slice is 1s, so the heartbeat
            # fires once before the result lands.
            result = await s.send_message("go", timeout=1, on_progress=on_progress)
            await feeder
            return result, progress

        result, progress = asyncio.run(_run())

        assert result == "done"
        # The tool launch itself is surfaced.
        assert any(evt == "progress" and "pytest -q" in detail for evt, detail in progress)
        # A keepalive heartbeat fired during the silent wait, stamped with elapsed.
        heartbeats = [detail for evt, detail in progress if evt == "tool_running"]
        assert heartbeats, f"expected a tool_running heartbeat, got {progress}"
        assert any("pytest -q" in d and "s)" in d for d in heartbeats)


class TestInactivityTimeoutMessage:
    """When the subprocess goes silent past the inactivity budget, the raised
    error must distinguish a stalled-after-tool-result hang (agent_idle — the
    common upstream CLI/API hang) from a tool that was still running, and name
    the last action so recurrences are triageable. See session.py:968.
    """

    @staticmethod
    def _tool_use(command: str) -> dict:
        return {
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": command}}]},
        }

    @staticmethod
    def _tool_result() -> dict:
        return {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "ok"}]}}

    def test_agent_idle_after_tool_result_names_last_step_and_marks_stall(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()

            async def feed():
                await asyncio.sleep(0.05)
                # Tool runs and returns — then the agent goes silent (the
                # e6bde4d4 scenario): tool_inflight is back to False, so only
                # the flat inactivity budget guards the hang.
                await s._response_queue.put(self._tool_use("ls foo"))
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._tool_result())
                # ...and nothing more.

            feeder = asyncio.create_task(feed())
            err: str | None = None
            try:
                await s.send_message("go", timeout=1)
            except RuntimeError as e:
                err = str(e)
            feeder.cancel()
            return err

        msg = asyncio.run(_run())
        assert msg is not None, "expected a RuntimeError on inactivity timeout"
        assert "No response within 1s" in msg
        # agent_idle hint, naming the last surfaced action.
        assert "stalled" in msg
        assert "ls foo" in msg

    @staticmethod
    def _text(text: str) -> dict:
        return {"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}}

    def test_agent_idle_gap_is_decoupled_from_full_turn_timeout(self):
        """A mid-stream stall (no tool outstanding) must fail at the tighter
        AGENT_IDLE_GAP budget, NOT starve the full per-turn ``timeout``. Mirrors
        the 0b2a4b00 incident: the model streamed a partial reply then froze.
        """
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            # Tighten the idle gap far below the turn timeout so the test is
            # fast AND proves the two budgets are independent.
            s.AGENT_IDLE_GAP_SECONDS = 0.3

            async def feed():
                await asyncio.sleep(0.05)
                # Model starts replying (partial result accumulates) then the
                # stream goes silent — no tool to blame.
                await s._response_queue.put(self._text("Let me check that file"))
                # ...and nothing more.

            feeder = asyncio.create_task(feed())
            err: str | None = None
            started = time.monotonic()
            try:
                # Full turn budget is 10s; the idle gap (0.3s) must win.
                await s.send_message("go", timeout=10)
            except RuntimeError as e:
                err = str(e)
            elapsed = time.monotonic() - started
            feeder.cancel()
            return err, elapsed

        msg, elapsed = asyncio.run(_run())
        assert msg is not None, "expected a RuntimeError on idle-gap timeout"
        # Failed fast at the idle gap, nowhere near the 10s turn budget.
        assert elapsed < 5, f"idle stall should fail at the gap, took {elapsed:.1f}s"
        # Reports the idle-gap budget, not the full per-turn timeout.
        assert "No response within 0.3s" in msg
        assert "10s" not in msg
        # Partial output was seen → the "started replying then went silent" wording.
        assert "stalled" in msg
        assert "had started replying" in msg
