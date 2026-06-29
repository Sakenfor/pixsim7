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
    from pixsim7.client.session import AgentCmdSession, _EOF_SENTINEL

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


class TestCodexExtractTurnId:
    """extract_turn_id pulls the live turn id from turn/start acks and turn/*
    notifications so the session can target turn/steer + turn/interrupt."""

    def test_from_turn_start_ack(self):
        p = CodexAppServerProtocol()
        ack = {"id": 30, "result": {"turn": {"id": "turn_456", "status": "inProgress"}}}
        assert p.extract_turn_id(ack) == "turn_456"

    def test_from_turn_started_notification(self):
        p = CodexAppServerProtocol()
        note = {"method": "turn/started", "params": {"turn": {"id": "turn_789"}}}
        assert p.extract_turn_id(note) == "turn_789"

    def test_returns_none_for_unrelated_events(self):
        p = CodexAppServerProtocol()
        assert p.extract_turn_id({"method": "item/started", "params": {"item": {}}}) is None
        assert p.extract_turn_id({"method": "item/agentMessage/delta", "params": {"delta": "x"}}) is None
        assert p.extract_turn_id("not-a-dict") is None


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
    def _tool_call(cmd: str) -> dict:
        # Codex surfaces a shell command as a `commandExecution` item; the beat
        # fires on item/started (while it runs), not on completed. commandActions
        # carries the cleaned inner command (no shell wrapper).
        return {"method": "item/started", "params": {"item": {
            "type": "commandExecution",
            "command": cmd,
            "commandActions": [{"command": cmd}],
            "status": "inProgress",
        }}}

    def test_completed_agent_messages_are_not_forwarded_but_tool_calls_are(self):
        events = [
            self._agent_message("You're asking whether prompt tools should preview..."),
            self._tool_call("rg shell_command src/"),
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
        # Tool-call progress is still surfaced (as a "Running: ..." beat).
        assert any("shell_command" in d for d in forwarded)

    def test_reasoning_summary_is_forwarded_as_a_thinking_beat(self):
        # A reasoning item with a populated summary streams as a beat; an empty
        # one (reasoning summaries disabled) does NOT, so the bubble isn't spammed.
        events = [
            {"method": "item/completed", "params": {"item": {
                "type": "reasoning", "summary": [], "content": [],
            }}},
            {"method": "item/completed", "params": {"item": {
                "type": "reasoning",
                "summary": [{"type": "summary_text", "text": "Checking the flag wiring first."}],
                "content": [],
            }}},
            self._agent_message("done"),
            {"method": "turn/completed", "params": {}},
        ]
        _, progress = self._drive(events)
        forwarded = [detail for _, detail in progress]
        assert any("Checking the flag wiring first." in d for d in forwarded)
        # Exactly one reasoning beat — the empty item produced nothing.
        assert sum("Checking the flag" in d for d in forwarded) == 1


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
            # Fast pulse so a re-arm fires quickly; keep the turn budget
            # generous (timeout=10) since `timeout` is now an ABSOLUTE turn cap
            # — shrinking it to drive the pulse cadence would also cut the turn.
            s.AGENT_PULSE_SLICE_SECONDS = 0.3

            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                await asyncio.sleep(0.05)
                # Tool starts → opens the silent window (tool_inflight=True).
                await s._response_queue.put(self._tool_use("pytest -q"))
                # Stay silent past the pulse cadence (≥2 re-arms), well under
                # the 10s turn budget, then finish the turn.
                await asyncio.sleep(0.7)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            result = await s.send_message("go", timeout=10, on_progress=on_progress)
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


class TestProcessExitMidTurn:
    """The dominant real-world disconnect: the agent subprocess exits mid-turn
    (the bridge logs showed 179/180 stops at exit_code=1, ~half with
    received=0). The stdout reader hits EOF and pushes ``_EOF_SENTINEL`` so the
    turn fails immediately with the real exit reason — instead of stalling
    until the next ~30s liveness poll and mislabelling the dead process as
    "a tool was still running". See session.py _read_stdout /
    _build_process_exit_error.
    """

    @staticmethod
    def _tool_use(command: str) -> dict:
        return {
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": command}}]},
        }

    def test_eof_sentinel_fails_turn_fast_with_exit_reason(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            s._stderr_tail = ["fatal: connection reset by peer"]

            async def feed():
                await asyncio.sleep(0.05)
                # A tool is "running" (tool_inflight=True) — the exact regime
                # that used to mislabel the exit as "a tool was still running".
                await s._response_queue.put(self._tool_use("pnpm tsc -b"))
                await asyncio.sleep(0.05)
                # Process dies: reader hits EOF → sentinel. Flip returncode so
                # is_alive goes False and the error can name the exit code.
                s._process.returncode = 1
                await s._response_queue.put(_EOF_SENTINEL)

            feeder = asyncio.create_task(feed())
            started = time.monotonic()
            err: str | None = None
            try:
                # Generous turn budget — the point is we fail in ~0.1s, not 30s.
                await s.send_message("go", timeout=30)
            except RuntimeError as e:
                err = str(e)
            elapsed = time.monotonic() - started
            await feeder
            return err, elapsed

        msg, elapsed = asyncio.run(_run())
        assert msg is not None, "expected a RuntimeError on subprocess exit"
        # Honest, specific message — not the old "a tool was still running".
        assert "Agent process exited" in msg
        assert "code 1" in msg
        assert "connection reset" in msg
        assert "tool was still running" not in msg
        # Failed promptly off the sentinel, nowhere near the 30s budget.
        assert elapsed < 5, f"expected fast failure, took {elapsed:.1f}s"


class TestActivityTrackingForStuckBusyWatchdog:
    """The pool's stuck-busy watchdog (agent_pool._maybe_recover_stuck_busy)
    force-restarts a session when ``now - stats.last_activity`` exceeds
    STUCK_BUSY_SECONDS. last_activity used to be stamped only at turn-start and
    final-result, so a long turn actively streaming tool calls froze it and got
    killed mid-flight (the real stuck_secs=609 kill on session e5ab1e11). Every
    real mid-turn event must refresh it. See session.py send_message.
    """

    @staticmethod
    def _tool_use(command: str) -> dict:
        return {
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": command}}]},
        }

    def test_midturn_tool_event_refreshes_last_activity(self):
        from datetime import datetime, timezone

        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            captured: dict = {}
            marker: list = []

            def on_progress(evt: str, detail: str) -> None:
                if evt == "progress" and "git grep" in detail:
                    captured["at_tool"] = s.stats.last_activity

            async def feed():
                await asyncio.sleep(0.1)  # let turn-start stamp last_activity first
                marker.append(datetime.now(timezone.utc))
                await s._response_queue.put(self._tool_use("git grep -nE rollSeed"))
                await asyncio.sleep(0.05)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            result = await s.send_message("go", timeout=5, on_progress=on_progress)
            await feeder
            return result, captured, marker

        result, captured, marker = asyncio.run(_run())
        assert result == "done"
        assert captured.get("at_tool") is not None, "expected a git grep progress event"
        # last_activity advanced to at least the moment the tool event landed —
        # so a streaming turn keeps reading as "alive" to the stuck-busy watchdog
        # instead of looking frozen at turn-start.
        assert captured["at_tool"] >= marker[0]


class TestReasoningGapDoesNotKillHealthyTurn:
    """The model going quiet *after* a tool result — extended thinking, slow
    first token on a big resumed context — is NOT a hang. The no-tool reasoning
    gap must re-arm in pulse slices (like a running tool) up to the generous
    AGENT_IDLE_GAP budget instead of single-shot killing the turn. Guards the
    ced3c3d5 incident (healthy turn killed mid-reasoning by the old tight gap).
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

    def test_post_tool_reasoning_gap_pulses_thinking_and_survives(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            # Generous cap, fast pulse → exercise multiple re-arms quickly.
            s.AGENT_IDLE_GAP_SECONDS = 5
            s.AGENT_PULSE_SLICE_SECONDS = 0.3

            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._tool_use("ls foo"))
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._tool_result())
                # Model is quiet for ~1s (thinking) — longer than the pulse
                # cadence but well under the 5s reasoning budget — then replies.
                await asyncio.sleep(1.0)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            result = await s.send_message("go", timeout=10, on_progress=on_progress)
            await feeder
            return result, progress

        result, progress = asyncio.run(_run())
        # Turn survived the reasoning gap instead of timing out.
        assert result == "done"
        # The quiet gap pulsed "thinking" heartbeats (not "tool_running" — no
        # tool was outstanding) with an elapsed stamp.
        thinking = [d for evt, d in progress if evt == "thinking"]
        assert thinking, f"expected a 'thinking' pulse during the gap, got {progress}"
        assert any("s)" in d for d in thinking)

    def test_reasoning_gap_still_fails_when_budget_exhausted(self):
        """A real stall (quiet past the reasoning budget) must still fail —
        pulsed re-arm makes the gap generous, not infinite."""
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            s.AGENT_IDLE_GAP_SECONDS = 0.6
            s.AGENT_PULSE_SLICE_SECONDS = 0.2

            async def feed():
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._tool_use("ls foo"))
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._tool_result())
                # ...silence forever.

            feeder = asyncio.create_task(feed())
            err: str | None = None
            started = time.monotonic()
            try:
                await s.send_message("go", timeout=10)
            except RuntimeError as e:
                err = str(e)
            elapsed = time.monotonic() - started
            feeder.cancel()
            return err, elapsed

        msg, elapsed = asyncio.run(_run())
        assert msg is not None, "expected a RuntimeError when the budget is exhausted"
        # Reports the reasoning-gap budget, decoupled from the 10s turn timeout.
        assert "No response within 0.6s" in msg
        assert "10s" not in msg
        assert "stalled" in msg
        assert elapsed < 5, f"should fail near the gap, took {elapsed:.1f}s"

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


class TestTurnBudgetBoundsToolInflight:
    """Consolidation: with the pool stuck-busy watchdog no longer restarting
    in-flight turns, `send_message` is the single place a turn is bounded. A
    tool that never returns (process still alive) must be cut at the absolute
    turn `timeout` — previously the `tool_inflight` regime was unbounded and
    only the 600s watchdog (which killed healthy turns) stopped it.
    """

    @staticmethod
    def _tool_use(command: str) -> dict:
        return {
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": command}}]},
        }

    def test_never_returning_tool_is_cut_at_turn_timeout(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()  # stays alive (returncode stays None)

            async def feed():
                await asyncio.sleep(0.05)
                # Tool starts and never produces a result; process stays alive.
                await s._response_queue.put(self._tool_use("sleep 999999"))

            feeder = asyncio.create_task(feed())
            started = time.monotonic()
            err: str | None = None
            try:
                await s.send_message("go", timeout=1)
            except RuntimeError as e:
                err = str(e)
            elapsed = time.monotonic() - started
            feeder.cancel()
            return err, elapsed

        msg, elapsed = asyncio.run(_run())
        assert msg is not None, "a never-returning tool must be cut at the turn budget"
        assert "No response within 1s" in msg
        # tool_inflight regime → honest "tool was still running" message, now
        # truthful because the turn really did run its full budget.
        assert "tool was still running" in msg
        # Bounded near the 1s budget — not unbounded (would hang the test).
        assert 0.8 <= elapsed < 5, f"expected ~1s cap, got {elapsed:.1f}s"


class TestStuckBusyWatchdogGate:
    """The pool stuck-busy watchdog must skip a session whose turn is still
    in-flight (send_message owns it) and only recover a genuinely orphaned BUSY
    session. The old time-only check force-restarted live turns mid-flight (the
    stuck_secs=609 kill on e5ab1e11). See agent_pool._maybe_recover_stuck_busy.
    """

    def test_skips_inflight_turn_but_recovers_orphan(self):
        from datetime import datetime, timezone, timedelta
        from pixsim7.client.agent_pool import AgentPool, STUCK_BUSY_SECONDS
        from pixsim7.client.session import SessionState

        async def _run():
            pool = AgentPool(pool_size=1, engines=["claude"])
            pool._update_index = lambda sess: None  # isolate watchdog logic

            s = AgentCmdSession("sess-1", command="claude")
            s.state = SessionState.BUSY
            # last_activity stale well past the watchdog threshold.
            s.stats.last_activity = (
                datetime.now(timezone.utc) - timedelta(seconds=STUCK_BUSY_SECONDS + 60)
            )
            restarts: list[bool] = []

            async def fake_restart():
                restarts.append(True)
                return True

            s.restart = fake_restart
            pool._sessions[s.session_id] = s

            # Turn in-flight → must NOT restart despite stale last_activity.
            pool._inflight_turns[s.session_id] = 1
            r_inflight = await pool._maybe_recover_stuck_busy(s)

            # Orphaned BUSY (no in-flight turn) → watchdog recovers it.
            pool._inflight_turns.pop(s.session_id, None)
            r_orphan = await pool._maybe_recover_stuck_busy(s)
            return r_inflight, r_orphan, restarts

        r_inflight, r_orphan, restarts = asyncio.run(_run())
        assert r_inflight is False, "watchdog must not restart a session with an in-flight turn"
        assert r_orphan is True, "watchdog must recover an orphaned BUSY session"
        assert len(restarts) == 1, "exactly one restart — only the orphan case"


class TestManagedProcessDetection:
    """The session surfaces agent-managed sub-processes (subagents via the
    Task/Agent tool, background `Bash run_in_background`) as typed
    `managed_proc_started` / `managed_proc_done` heartbeats so the AI Assistant
    panel can show a per-session list. Detection scans ALL content blocks (not
    just block 0), so a tool_use preceded by text/thinking is still caught.
    See session.py send_message.
    """

    @staticmethod
    def _assistant(blocks):
        return {"type": "assistant", "message": {"content": blocks}}

    @staticmethod
    def _tool_result(tuid):
        return {"type": "user", "message": {"role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tuid, "content": "ok"}]}}

    def test_subagent_after_text_block_started_then_done_full_id_match(self):
        # Realistic ids: every Claude tool_use id shares the "toolu_01" prefix,
        # so an UNRELATED tool_result must NOT close the subagent — only a
        # full-id match does. (A truncated key would close it on the first
        # unrelated result, surfacing as "instantly done".)
        sub_id = "toolu_01SUBAGENTaaaaaaaaaaaa"
        other_id = "toolu_01OTHERbbbbbbbbbbbbbbb"

        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                await asyncio.sleep(0.05)
                # tool_use is block[1], after a text block — the old block-0-only
                # scan would have missed it.
                await s._response_queue.put(self._assistant([
                    {"type": "text", "text": "Let me delegate this"},
                    {"type": "tool_use", "id": sub_id, "name": "Task",
                     "input": {"description": "reviewing primitives", "subagent_type": "Explore"}},
                ]))
                await asyncio.sleep(0.05)
                # Unrelated tool_result, SAME toolu_01 prefix, different full id —
                # must not close the subagent.
                await s._response_queue.put(self._tool_result(other_id))
                await asyncio.sleep(0.05)
                # The subagent's real result closes it.
                await s._response_queue.put(self._tool_result(sub_id))
                await asyncio.sleep(0.05)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            result = await s.send_message("go", timeout=10, on_progress=on_progress)
            await feeder
            return result, progress

        result, progress = asyncio.run(_run())
        assert result == "done"
        started = [d for e, d in progress if e == "managed_proc_started"]
        done = [d for e, d in progress if e == "managed_proc_done"]
        assert any(d == f"subagent\t{sub_id}\treviewing primitives" for d in started), started
        # Closed exactly once, by the subagent's own id — never by the unrelated one.
        assert done == [sub_id], done

    def test_background_bash_started_and_not_closed_by_launch_ack(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._assistant([
                    {"type": "tool_use", "id": "toolu_01BGbbbbbbbbbbbbbbbb", "name": "Bash",
                     "input": {"command": "pytest -q", "run_in_background": True}},
                ]))
                await asyncio.sleep(0.05)
                # background bash acks its tool_result immediately while still
                # running — must NOT be marked done here.
                await s._response_queue.put(self._tool_result("toolu_01BGbbbbbbbbbbbbbbbb"))
                await asyncio.sleep(0.05)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            result = await s.send_message("go", timeout=10, on_progress=on_progress)
            await feeder
            return result, progress

        result, progress = asyncio.run(_run())
        assert result == "done"
        started = [d for e, d in progress if e == "managed_proc_started"]
        done = [d for e, d in progress if e == "managed_proc_done"]
        assert any(d == "background_task\ttoolu_01BGbbbbbbbbbbbbbbbb\tpytest -q" for d in started), started
        assert done == [], f"background task must not be closed by its launch ack: {done}"

    def test_plain_bash_is_not_a_managed_process(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()
            progress: list[tuple[str, str]] = []

            def on_progress(evt: str, detail: str) -> None:
                progress.append((evt, detail))

            async def feed():
                await asyncio.sleep(0.05)
                await s._response_queue.put(self._assistant([
                    {"type": "tool_use", "id": "toolu_PLAIN1", "name": "Bash",
                     "input": {"command": "ls"}},
                ]))
                await asyncio.sleep(0.05)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            result = await s.send_message("go", timeout=10, on_progress=on_progress)
            await feeder
            return result, progress

        result, progress = asyncio.run(_run())
        assert result == "done"
        assert not [e for e, _ in progress if e.startswith("managed_proc")], progress


class TestActiveTurnSurvivesWallClock:
    """A turn that keeps streaming events must NOT be cut just for running
    longer than `timeout` — the bound is INACTIVITY (silence since the last
    event), not total wall-clock. Regression for the 900s kill of a 15-min turn
    of continuous edits (mislabelled "agent went silent / 420s"). See
    session.py send_message.
    """

    def test_streaming_turn_runs_past_timeout_without_being_cut(self):
        async def _run():
            s = AgentCmdSession("test-session", command="claude")
            s._process = _FakeProc()

            async def feed():
                await asyncio.sleep(0.05)
                # Stream a tool_use every 0.25s for ~1.75s — well past the 1s
                # turn timeout, but each gap is far under it. A wall-clock budget
                # would cut this at 1s; an inactivity bound must not.
                for i in range(7):
                    await s._response_queue.put({
                        "type": "assistant",
                        "message": {"content": [
                            {"type": "tool_use", "id": f"toolu_01READ{i:016d}",
                             "name": "Read", "input": {"file_path": f"/f{i}.ts"}},
                        ]},
                    })
                    await asyncio.sleep(0.25)
                await s._response_queue.put({"type": "result", "result": "done"})

            feeder = asyncio.create_task(feed())
            started = time.monotonic()
            result = await s.send_message("go", timeout=1)
            elapsed = time.monotonic() - started
            await feeder
            return result, elapsed

        result, elapsed = asyncio.run(_run())
        assert result == "done", "an actively-streaming turn must not be cut at the wall-clock timeout"
        assert elapsed > 1.0, f"test must actually run past the 1s timeout to prove it (was {elapsed:.2f}s)"
