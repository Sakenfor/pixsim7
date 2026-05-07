"""Tests for RemoteCommandBridge — heartbeat tracking, task lifecycle, stale cleanup."""
from __future__ import annotations

TEST_SUITE = {
    "id": "remote-cmd-bridge",
    "label": "Remote Command Bridge",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "agent-bridge",
    "covers": [
        "pixsim7/backend/main/services/llm/remote_cmd_bridge.py",
    ],
    "order": 31,
}

import asyncio
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

try:
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import (
        RemoteCommandBridge,
        RemoteAgent,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


def _make_agent(
    agent_id: str = "test-agent",
    busy: bool = False,
    task_id: str | None = None,
    user_id: int | None = None,
    bridge_id: str | None = None,
) -> RemoteAgent:
    ws = AsyncMock()
    agent = RemoteAgent(
        bridge_client_id=agent_id,
        websocket=ws,
        bridge_id=bridge_id,
        agent_type="claude-cli",
        user_id=user_id,
    )
    agent.active_tasks = 1 if busy else 0
    if task_id:
        agent.current_task_ids.add(task_id)
    return agent


class TestHeartbeatTracking:
    """Heartbeat recording and staleness detection."""

    def test_record_heartbeat_populates_active_tasks(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        bridge.record_heartbeat("test-agent", {"action": "tool_use", "detail": "Using tool: Read"})

        assert "task-1" in bridge._active_tasks
        assert bridge._active_tasks["task-1"]["action"] == "tool_use"
        assert bridge._active_tasks["task-1"]["detail"] == "Using tool: Read"
        assert "_ts" in bridge._active_tasks["task-1"]

    def test_record_heartbeat_ignored_without_task_id(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent(task_id=None)
        bridge._agents["test-agent"] = agent

        bridge.record_heartbeat("test-agent", {"action": "tool_use", "detail": "test"})

        assert len(bridge._active_tasks) == 0

    def test_record_heartbeat_ignored_for_unknown_agent(self):
        bridge = RemoteCommandBridge()

        bridge.record_heartbeat("unknown-agent", {"action": "tool_use", "detail": "test"})

        assert len(bridge._active_tasks) == 0

    def test_heartbeat_updates_timestamp(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        bridge.record_heartbeat("test-agent", {"action": "thinking", "detail": "first"})
        ts1 = bridge._active_tasks["task-1"]["_ts"]

        bridge.record_heartbeat("test-agent", {"action": "tool_use", "detail": "second"})
        ts2 = bridge._active_tasks["task-1"]["_ts"]

        assert ts2 >= ts1
        assert bridge._active_tasks["task-1"]["detail"] == "second"


class TestActiveTaskDetection:
    """get_active_task_for_user — primary dispatch state + heartbeat fallback."""

    def test_returns_none_when_idle(self):
        bridge = RemoteCommandBridge()
        assert bridge.get_active_task_for_user() is None

    def test_returns_busy_agent_task(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent(busy=True, task_id="task-1")
        bridge._agents["test-agent"] = agent
        bridge._active_tasks["task-1"] = {"action": "thinking", "detail": "...", "_ts": datetime.now(timezone.utc)}

        result = bridge.get_active_task_for_user()
        assert result is not None
        assert result["task_id"] == "task-1"
        assert result["status"] == "active"
        assert result["action"] == "thinking"

    def test_fallback_to_recent_heartbeat(self):
        """After SSE drops, agent.busy=False but heartbeats still tracked."""
        bridge = RemoteCommandBridge()
        agent = _make_agent(busy=False, task_id="task-1")
        bridge._agents["test-agent"] = agent
        bridge._active_tasks["task-1"] = {
            "action": "tool_use",
            "detail": "Using tool: Read",
            "_ts": datetime.now(timezone.utc),
        }

        result = bridge.get_active_task_for_user()
        assert result is not None
        assert result["task_id"] == "task-1"

    def test_stale_heartbeat_ignored(self):
        """Heartbeats older than 30s are considered stale."""
        bridge = RemoteCommandBridge()
        bridge._active_tasks["old-task"] = {
            "action": "generating",
            "detail": "stuck",
            "_ts": datetime.now(timezone.utc) - timedelta(seconds=60),
        }

        result = bridge.get_active_task_for_user()
        assert result is None
        # Stale entry should be cleaned up
        assert "old-task" not in bridge._active_tasks

    def test_user_scoping(self):
        """User-scoped query only returns matching or shared agents."""
        bridge = RemoteCommandBridge()
        # User 1's agent
        agent1 = _make_agent(agent_id="user-1-agent", busy=True, task_id="task-1", user_id=1)
        bridge._agents["user-1-agent"] = agent1
        # Shared agent
        agent2 = _make_agent(agent_id="shared-agent", busy=True, task_id="task-2", user_id=None)
        bridge._agents["shared-agent"] = agent2

        # User 1 sees their own task
        result = bridge.get_active_task_for_user(user_id=1)
        assert result["task_id"] == "task-1"

        # User 2 only sees shared task
        result = bridge.get_active_task_for_user(user_id=2)
        assert result["task_id"] == "task-2"


class TestTaskLifecycle:
    """resolve_task and fail_task — result caching, cleanup."""

    @pytest.mark.asyncio
    async def test_resolve_caches_result(self):
        bridge = RemoteCommandBridge()
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        bridge._pending_tasks["task-1"] = future
        bridge._active_tasks["task-1"] = {"action": "done", "detail": "", "_ts": datetime.now(timezone.utc)}

        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {"edited_prompt": "hello", "bridge_session_id": "sess-123"}
        resolved = bridge.resolve_task("task-1", result)

        assert resolved is True
        assert future.done()
        assert future.result() == result
        # Cached for reconnect
        assert "task-1" in bridge._completed_results
        # Active task cleaned up
        assert "task-1" not in bridge._active_tasks
        # Agent task_id cleaned up
        assert "task-1" not in agent.current_task_ids

    @pytest.mark.asyncio
    async def test_fail_caches_error(self):
        bridge = RemoteCommandBridge()
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        bridge._pending_tasks["task-1"] = future

        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        failed = bridge.fail_task("task-1", "timeout")

        assert failed is True
        assert future.done()
        assert "task-1" in bridge._completed_results
        cached = bridge.get_completed_result("task-1")
        assert cached is not None
        assert cached["error"] == "timeout"
        assert "task-1" not in agent.current_task_ids

    def test_pop_completed_result(self):
        import time
        bridge = RemoteCommandBridge()
        bridge._completed_results["task-1"] = ({"edited_prompt": "hi"}, time.monotonic())

        result = bridge.pop_completed_result("task-1")
        assert result is not None
        assert result["edited_prompt"] == "hi"
        # Gone after pop
        assert bridge.pop_completed_result("task-1") is None

    def test_gc_completed_caps_at_200_and_ttl(self):
        import time as _time
        bridge = RemoteCommandBridge()
        now = _time.monotonic()
        for i in range(210):
            bridge._completed_results[f"task-{i}"] = ({"result": i}, now + i * 0.001)
        bridge._gc_completed()

        assert len(bridge._completed_results) == 200
        # Oldest removed
        assert "task-0" not in bridge._completed_results
        # Newest kept
        assert "task-209" in bridge._completed_results

    def test_gc_completed_evicts_expired(self):
        import time as _time
        bridge = RemoteCommandBridge()
        old = _time.monotonic() - bridge._COMPLETED_TTL_S - 10
        bridge._completed_results["old-task"] = ({"result": "old"}, old)
        bridge._completed_results["fresh-task"] = ({"result": "fresh"}, _time.monotonic())
        bridge._gc_completed()

        assert "old-task" not in bridge._completed_results
        assert "fresh-task" in bridge._completed_results


class TestAgentRouting:
    """get_available_agent — user priority, shared fallback."""

    def test_returns_none_when_empty(self):
        bridge = RemoteCommandBridge()
        assert bridge.get_available_agent() is None

    def test_returns_non_busy_agent(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent

        result = bridge.get_available_agent()
        assert result is agent

    def test_skips_busy_agents(self):
        bridge = RemoteCommandBridge()
        busy = _make_agent(agent_id="busy", busy=True)
        idle = _make_agent(agent_id="idle")
        bridge._agents["busy"] = busy
        bridge._agents["idle"] = idle

        result = bridge.get_available_agent()
        assert result is idle

    def test_user_agent_preferred_over_shared(self):
        bridge = RemoteCommandBridge()
        shared = _make_agent(agent_id="shared", user_id=None)
        user_agent = _make_agent(agent_id="user", user_id=1)
        bridge._agents["shared"] = shared
        bridge._agents["user"] = user_agent

        result = bridge.get_available_agent(user_id=1)
        assert result is user_agent

    def test_shared_fallback_when_no_user_agent(self):
        bridge = RemoteCommandBridge()
        shared = _make_agent(agent_id="shared", user_id=None)
        bridge._agents["shared"] = shared

        result = bridge.get_available_agent(user_id=99)
        assert result is shared

    def test_get_agent_by_bridge_id(self):
        bridge = RemoteCommandBridge()
        user_agent = _make_agent(agent_id="user", user_id=1, bridge_id="bridge-user")
        shared_agent = _make_agent(agent_id="shared", user_id=None, bridge_id="bridge-shared")
        bridge._agents["user"] = user_agent
        bridge._agents["shared"] = shared_agent

        assert bridge.get_agent_by_bridge_id("bridge-user", user_id=1) is user_agent
        assert bridge.get_agent_by_bridge_id("bridge-user", user_id=2) is None
        assert bridge.get_agent_by_bridge_id("bridge-shared", user_id=2) is shared_agent

    def test_agent_type_filter_matches(self):
        """When `agent_type='codex'`, only codex bridges are returned.
        Bridges register as `claude-cli` / `codex-cli`; the filter normalizes
        the `-cli` suffix so the user-facing form matches."""
        bridge = RemoteCommandBridge()
        claude = _make_agent(agent_id="claude")
        claude.agent_type = "claude-cli"
        codex = _make_agent(agent_id="codex")
        codex.agent_type = "codex-cli"
        bridge._agents["claude"] = claude
        bridge._agents["codex"] = codex

        assert bridge.get_available_agent(agent_type="codex") is codex
        assert bridge.get_available_agent(agent_type="claude") is claude

    def test_agent_type_filter_returns_none_when_unmatched(self):
        """Codex requested but only Claude connected — must NOT silently
        fall back. The WS handler decides whether to surface a structured
        error or downgrade; the bridge just refuses to mismatch."""
        bridge = RemoteCommandBridge()
        claude = _make_agent(agent_id="claude")
        claude.agent_type = "claude-cli"
        bridge._agents["claude"] = claude

        assert bridge.get_available_agent(agent_type="codex") is None
        # Without filter, the existing claude agent is fine.
        assert bridge.get_available_agent() is claude

    def test_agent_type_none_keeps_legacy_behavior(self):
        """`agent_type=None` (default) means any-engine, preserving the
        pre-filter behavior so callers that don't care still work."""
        bridge = RemoteCommandBridge()
        claude = _make_agent(agent_id="claude")
        claude.agent_type = "claude-cli"
        bridge._agents["claude"] = claude

        assert bridge.get_available_agent() is claude
        assert bridge.get_available_agent(agent_type=None) is claude

    def test_agent_type_filter_case_insensitive(self):
        """Engine names are normalized to lowercase on both sides."""
        bridge = RemoteCommandBridge()
        agent = _make_agent(agent_id="a")
        agent.agent_type = "Codex-CLI"  # mixed-case stored
        bridge._agents["a"] = agent

        assert bridge.get_available_agent(agent_type="codex") is agent
        assert bridge.get_available_agent(agent_type="CODEX") is agent

    def test_agent_type_filter_handles_no_suffix(self):
        """Bridges that report bare engine names (no `-cli` suffix) still
        match — the suffix strip is permissive in both directions."""
        bridge = RemoteCommandBridge()
        agent = _make_agent(agent_id="a")
        agent.agent_type = "claude"  # bare, not "claude-cli"
        bridge._agents["a"] = agent

        assert bridge.get_available_agent(agent_type="claude") is agent
        assert bridge.get_available_agent(agent_type="claude-cli") is agent


class TestDisconnect:
    """Agent disconnect — cleanup and pending task failure."""

    @pytest.mark.asyncio
    async def test_disconnect_removes_agent(self):
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        agent = await bridge.connect(ws, bridge_client_id="a1")
        assert "a1" in bridge._agents

        bridge.disconnect("a1", grace=False)
        assert "a1" not in bridge._agents

    @pytest.mark.asyncio
    async def test_disconnect_fails_pending_task(self):
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        agent = await bridge.connect(ws, bridge_client_id="a1")
        agent.current_task_ids.add("task-1")

        loop = asyncio.get_event_loop()
        future = loop.create_future()
        bridge._pending_tasks["task-1"] = future

        bridge.disconnect("a1", grace=False)

        assert future.done()
        with pytest.raises(ConnectionError):
            future.result()

    @pytest.mark.asyncio
    async def test_disconnect_caches_error_for_reconnect(self):
        """Disconnected task errors must be cached so frontend reconnect can find them."""
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        agent = await bridge.connect(ws, bridge_client_id="a1")
        agent.current_task_ids.add("task-1")

        loop = asyncio.get_event_loop()
        future = loop.create_future()
        bridge._pending_tasks["task-1"] = future
        bridge._active_tasks["task-1"] = {"_ts": datetime.now(timezone.utc)}

        bridge.disconnect("a1", grace=False)

        # Error should be cached for reconnect
        cached = bridge.get_completed_result("task-1")
        assert cached is not None
        assert cached["ok"] is False
        assert "disconnected" in cached["error"].lower()
        # Active task should be cleaned up
        assert "task-1" not in bridge._active_tasks

    @pytest.mark.asyncio
    async def test_disconnect_caches_multiple_tasks(self):
        """All in-flight tasks should be cached when a bridge disconnects."""
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        agent = await bridge.connect(ws, bridge_client_id="a1")
        agent.current_task_ids.update({"task-1", "task-2"})

        loop = asyncio.get_event_loop()
        for tid in ("task-1", "task-2"):
            future = loop.create_future()
            bridge._pending_tasks[tid] = future

        bridge.disconnect("a1", grace=False)

        for tid in ("task-1", "task-2"):
            cached = bridge.get_completed_result(tid)
            assert cached is not None
            assert cached["ok"] is False

    @pytest.mark.asyncio
    async def test_disconnect_ignores_stale_websocket(self):
        bridge = RemoteCommandBridge()
        ws_old = AsyncMock()
        ws_new = AsyncMock()

        await bridge.connect(ws_old, bridge_client_id="a1")
        await bridge.connect(ws_new, bridge_client_id="a1")
        assert bridge._agents["a1"].websocket is ws_new

        bridge.disconnect("a1", websocket=ws_old)
        assert "a1" in bridge._agents

        bridge.disconnect("a1", websocket=ws_new)
        assert "a1" not in bridge._agents


class TestBridgeTargeting:
    """Bridge-ID dispatch and routing behavior."""

    @pytest.mark.asyncio
    async def test_dispatch_task_to_bridge_routes_to_matching_agent(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent(agent_id="a1", user_id=1, bridge_id="bridge-1")
        bridge._agents["a1"] = agent

        bridge._dispatch_to_agent = AsyncMock(return_value={"ok": True})  # type: ignore[method-assign]
        result = await bridge.dispatch_task_to_bridge(
            "bridge-1",
            {"task": "noop"},
            user_id=1,
        )

        assert result["ok"] is True
        bridge._dispatch_to_agent.assert_awaited_once()


# ── bridge:status_changed event publishing ───────────────────────


class TestBridgeStatusEvents:
    """connect/disconnect should publish bridge:status_changed so the
    frontend bridgeStatusStore can skip its 15s polling heartbeat."""

    @pytest.mark.asyncio
    async def test_connect_publishes_status_changed_for_new_agent(self):
        bridge = RemoteCommandBridge()
        ws = AsyncMock()

        with patch(
            "pixsim7.backend.main.services.llm.remote_cmd_bridge.event_bus.publish",
            new=AsyncMock(),
        ) as publish:
            await bridge.connect(ws, bridge_client_id="a1")
            # ensure_future runs the publish on the event loop
            await asyncio.sleep(0)

        publish.assert_awaited()
        call = publish.await_args
        assert call.args[0] == "bridge:status_changed"
        assert call.args[1]["connected"] == 1
        assert call.args[1]["reason"] == "agent_connected"

    @pytest.mark.asyncio
    async def test_reconnect_of_existing_agent_does_not_republish(self):
        """Reconnecting the same client_id doesn't change connected_count,
        so we shouldn't fire the event again."""
        bridge = RemoteCommandBridge()
        ws1 = AsyncMock()
        await bridge.connect(ws1, bridge_client_id="a1")
        await asyncio.sleep(0)

        with patch(
            "pixsim7.backend.main.services.llm.remote_cmd_bridge.event_bus.publish",
            new=AsyncMock(),
        ) as publish:
            ws2 = AsyncMock()
            await bridge.connect(ws2, bridge_client_id="a1")  # reconnect
            await asyncio.sleep(0)

        publish.assert_not_called()

    @pytest.mark.asyncio
    async def test_disconnect_publishes_status_changed(self):
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        await bridge.connect(ws, bridge_client_id="a1")
        await asyncio.sleep(0)

        with patch(
            "pixsim7.backend.main.services.llm.remote_cmd_bridge.event_bus.publish",
            new=AsyncMock(),
        ) as publish:
            bridge.disconnect("a1", grace=False)
            await asyncio.sleep(0)

        publish.assert_awaited()
        call = publish.await_args
        assert call.args[0] == "bridge:status_changed"
        assert call.args[1]["connected"] == 0
        assert call.args[1]["reason"] == "agent_disconnected"


# ── Bridge-side ChatSession persistence (resolve_task) ───────────


class TestResolveTaskPersistence:
    """``resolve_task`` schedules ``_store_session_response`` so the agent's
    reply lands in ChatSession the moment the bridge has it — regardless of
    whether the originating WS handler is still alive.

    These tests verify the *scheduling* side (correct args, skip conditions);
    the actual DB write is exercised in test_store_session_response.py.
    """

    @pytest.mark.asyncio
    async def test_persists_when_result_has_session_id(self):
        bridge = RemoteCommandBridge()
        bridge._active_tasks["task-1"] = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "What is 2+2?",
            "user_id": 1,
        }
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {
            "ok": True,
            "response": "Four.",
            "bridge_session_id": "sess-abc",
            "duration_ms": 250,
        }

        with patch(
            "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
            new=AsyncMock(),
        ) as store_mock:
            bridge.resolve_task("task-1", result)
            # Let the scheduled task run.
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        store_mock.assert_awaited_once()
        kwargs = store_mock.await_args.kwargs
        assert kwargs["session_id"] == "sess-abc"
        assert kwargs["user_message"] == "What is 2+2?"
        assert kwargs["assistant_response"] == "Four."
        assert kwargs["duration_ms"] == 250

    @pytest.mark.asyncio
    async def test_skips_persistence_without_session_id(self):
        bridge = RemoteCommandBridge()
        bridge._active_tasks["task-1"] = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "anything",
        }
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {"ok": True, "response": "Hi"}  # no bridge_session_id

        with patch(
            "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
            new=AsyncMock(),
        ) as store_mock:
            bridge.resolve_task("task-1", result)
            await asyncio.sleep(0)

        store_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_persistence_on_error_result(self):
        bridge = RemoteCommandBridge()
        bridge._active_tasks["task-1"] = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "Hello",
        }
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {
            "ok": False,
            "error": "agent crashed",
            "bridge_session_id": "sess-abc",
        }

        with patch(
            "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
            new=AsyncMock(),
        ) as store_mock:
            bridge.resolve_task("task-1", result)
            await asyncio.sleep(0)

        store_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_persistence_when_response_text_empty(self):
        bridge = RemoteCommandBridge()
        bridge._active_tasks["task-1"] = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "Hello",
        }
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {"ok": True, "response": "   ", "bridge_session_id": "sess-abc"}

        with patch(
            "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
            new=AsyncMock(),
        ) as store_mock:
            bridge.resolve_task("task-1", result)
            await asyncio.sleep(0)

        store_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_persists_even_when_no_ws_handler_awaiting(self):
        """The whole point: no future, no _handle_message task, but the
        result still reaches ChatSession via the bridge-side schedule."""
        bridge = RemoteCommandBridge()
        bridge._active_tasks["task-1"] = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "Hello",
        }
        # NB: no entry in _pending_tasks — simulates _handle_message having died
        # before the result arrived (HMR / WS drop / backend restart).
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {"ok": True, "response": "Hi", "bridge_session_id": "sess-abc"}

        with patch(
            "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
            new=AsyncMock(),
        ) as store_mock:
            resolved = bridge.resolve_task("task-1", result)
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        # No future to resolve, so the return is False — but persistence still
        # ran. That's the whole fix.
        assert resolved is False
        store_mock.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_persists_with_empty_prompt_for_handshake_replay(self):
        """Tasks rebuilt from `pool_status` after backend restart have no
        prompt (the bridge handshake doesn't carry it). The assistant text
        still needs to land — `_store_session_response` skips the user-turn
        append when prompt is empty."""
        bridge = RemoteCommandBridge()
        bridge._active_tasks["task-1"] = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "",  # handshake-replayed
        }
        agent = _make_agent(task_id="task-1")
        bridge._agents["test-agent"] = agent

        result = {"ok": True, "response": "Hi", "bridge_session_id": "sess-abc"}

        with patch(
            "pixsim7.backend.main.api.v1.meta_contracts._store_session_response",
            new=AsyncMock(),
        ) as store_mock:
            bridge.resolve_task("task-1", result)
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        store_mock.assert_awaited_once()
        assert store_mock.await_args.kwargs["user_message"] == ""
        assert store_mock.await_args.kwargs["assistant_response"] == "Hi"

    @pytest.mark.asyncio
    async def test_dispatch_streaming_stashes_prompt(self):
        """``dispatch_task_streaming`` must put the prompt into ``_active_tasks``
        so ``resolve_task`` can recover it without plumbing through WS."""
        bridge = RemoteCommandBridge()
        ws = AsyncMock()
        agent = RemoteAgent(
            bridge_client_id="a1",
            websocket=ws,
            agent_type="claude-cli",
        )
        bridge._agents["a1"] = agent

        # Drive the generator just far enough to register the active task.
        gen = bridge.dispatch_task_streaming(
            {"prompt": "Hello world", "engine": "claude"},
            timeout=5,
            bridge_client_id="a1",
        )
        try:
            # First step: send_json + register task. We don't need to await
            # full completion — we just need the registration side-effect.
            await asyncio.wait_for(gen.__anext__(), timeout=1)
        except (StopAsyncIteration, asyncio.TimeoutError):
            pass
        finally:
            await gen.aclose()

        # Exactly one active task was registered, with the prompt stashed.
        assert len(bridge._active_tasks) == 1
        (task_info,) = bridge._active_tasks.values()
        assert task_info["prompt"] == "Hello world"
