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

    def test_multi_engine_bridge_matches_pool_engine(self):
        """A bridge registered as `claude` whose pool also runs `codex`
        (reported in pool_status["engines"]) must match an `agent_type=
        "codex"` request. Regression: matching only on the single
        registered agent_type made codex requests miss this bridge, so the
        WS handler fell back to claude and ran a codex profile's model
        (gpt-5.3-codex) on the claude binary."""
        bridge = RemoteCommandBridge()
        multi = _make_agent(agent_id="multi")
        multi.agent_type = "claude-cli"
        multi.pool_status = {"engines": ["claude", "codex"]}
        bridge._agents["multi"] = multi

        assert bridge.get_available_agent(agent_type="codex") is multi
        assert bridge.get_available_agent(agent_type="claude") is multi
        assert bridge.get_available_agent(agent_type="gemini") is None

    def test_multi_engine_falls_back_to_session_prefixes(self):
        """When pool_status has no explicit `engines` list, engine
        capability is inferred from active pool session-id prefixes
        (`codex-1` → codex), mirroring the status endpoint."""
        bridge = RemoteCommandBridge()
        agent = _make_agent(agent_id="a")
        agent.agent_type = "claude-cli"
        agent.pool_status = {"sessions": [{"session_id": "codex-1"}]}
        bridge._agents["a"] = agent

        assert bridge.get_available_agent(agent_type="codex") is agent

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

class TestHeartbeatGapTimeout:
    """``dispatch_task_streaming`` fails on a heartbeat *gap*, decoupled from
    the per-turn ``timeout`` budget. Regression for the ~900s starvation
    symptom: a silent/stalled bridge must fail fast (at the gap), not after
    the whole turn budget. Plan ``launcher-health-probe-stability`` ›
    ``dispatch-starvation-on-bridge-disconnect``."""

    @staticmethod
    def _agent_with_ws(bridge) -> RemoteAgent:
        agent = RemoteAgent(
            bridge_client_id="a1", websocket=AsyncMock(), agent_type="claude-cli"
        )
        bridge._agents["a1"] = agent
        return agent

    @pytest.mark.asyncio
    async def test_fails_at_gap_not_full_turn_budget(self):
        """Large turn budget, tiny gap, no heartbeats → fails in ~gap, not 900s."""
        bridge = RemoteCommandBridge()
        bridge.HEARTBEAT_GAP_TIMEOUT_S = 0.3  # shrink the gap for the test
        self._agent_with_ws(bridge)

        gen = bridge.dispatch_task_streaming(
            {"prompt": "hi", "engine": "claude"},
            timeout=900,  # full budget is huge ...
            bridge_client_id="a1",
        )
        first = await asyncio.wait_for(gen.__anext__(), timeout=1)
        assert first["type"] == "task_created"

        start = asyncio.get_event_loop().time()
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(gen.__anext__(), timeout=5)
        elapsed = asyncio.get_event_loop().time() - start
        # ... but it fails near the 0.3s gap, nowhere near the 900s budget.
        assert elapsed < 4, f"expected fast-fail at the gap, took {elapsed:.1f}s"
        await gen.aclose()

    @pytest.mark.asyncio
    async def test_heartbeat_within_gap_keeps_task_alive(self):
        """A heartbeat arriving before the gap expires resets it and is
        yielded — the task is NOT failed."""
        bridge = RemoteCommandBridge()
        bridge.HEARTBEAT_GAP_TIMEOUT_S = 0.6
        agent = self._agent_with_ws(bridge)

        gen = bridge.dispatch_task_streaming(
            {"prompt": "hi", "engine": "claude"}, timeout=900, bridge_client_id="a1"
        )
        first = await asyncio.wait_for(gen.__anext__(), timeout=1)
        assert first["type"] == "task_created"
        task_id = next(iter(agent.current_task_ids))

        async def _beat():
            await asyncio.sleep(0.25)  # well within the 0.6s gap
            bridge.record_heartbeat(
                "a1",
                {"task_id": task_id, "action": "processing_task", "detail": "working"},
            )

        asyncio.ensure_future(_beat())
        evt = await asyncio.wait_for(gen.__anext__(), timeout=2)
        assert evt["type"] == "heartbeat"  # kept alive, not raised
        await gen.aclose()

    @pytest.mark.asyncio
    async def test_small_timeout_still_bounds_via_min(self):
        """A deliberately small `timeout` still bounds the wait (min(timeout,
        gap)) even though the default gap is large — preserves tight-bound
        callers."""
        bridge = RemoteCommandBridge()  # default gap = 90
        self._agent_with_ws(bridge)

        gen = bridge.dispatch_task_streaming(
            {"prompt": "hi", "engine": "claude"}, timeout=0.3, bridge_client_id="a1"
        )
        first = await asyncio.wait_for(gen.__anext__(), timeout=1)
        assert first["type"] == "task_created"

        start = asyncio.get_event_loop().time()
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(gen.__anext__(), timeout=5)
        assert asyncio.get_event_loop().time() - start < 4
        await gen.aclose()

    @pytest.mark.asyncio
    async def test_blind_keepalives_do_not_mask_a_stalled_agent(self):
        """A hung-but-connected agent emits blind keepalives (``keepalive: True``)
        forever. Those keep the *connectivity* watchdog satisfied but must NOT
        reset the *no-progress* watchdog — otherwise the panel receives
        heartbeats indefinitely, never goes stale, and freezes with no result.
        Regression for the 'frozen, reply never comes' vitest symptom."""
        bridge = RemoteCommandBridge()
        bridge.HEARTBEAT_GAP_TIMEOUT_S = 5.0   # connectivity stays satisfied ...
        bridge.NO_PROGRESS_TIMEOUT_S = 0.5     # ... but no real progress fails fast
        agent = self._agent_with_ws(bridge)

        gen = bridge.dispatch_task_streaming(
            {"prompt": "hi", "engine": "claude"}, timeout=900, bridge_client_id="a1"
        )
        first = await asyncio.wait_for(gen.__anext__(), timeout=1)
        assert first["type"] == "task_created"
        task_id = next(iter(agent.current_task_ids))

        stop = asyncio.Event()

        async def _flood_keepalives():
            # Blind keepalives well within the connectivity gap, but never any
            # real progress — exactly what bridge.send_keepalive does on a hung turn.
            while not stop.is_set():
                bridge.record_heartbeat(
                    "a1",
                    {"task_id": task_id, "action": "processing_task",
                     "detail": "working", "keepalive": True},
                )
                await asyncio.sleep(0.1)

        ka = asyncio.ensure_future(_flood_keepalives())
        try:
            start = asyncio.get_event_loop().time()
            with pytest.raises(TimeoutError) as excinfo:
                # Keepalive heartbeats are still yielded; drain them until the
                # no-progress watchdog fires despite the steady keepalive stream.
                while True:
                    evt = await asyncio.wait_for(gen.__anext__(), timeout=5)
                    assert evt["type"] == "heartbeat"
            elapsed = asyncio.get_event_loop().time() - start
            assert "no progress" in str(excinfo.value).lower()
            assert elapsed < 4, f"stall watchdog should fire ~0.5s, took {elapsed:.1f}s"
        finally:
            stop.set()
            await ka
            await gen.aclose()

    @pytest.mark.asyncio
    async def test_real_progress_resets_the_no_progress_watchdog(self):
        """Genuine progress events (no ``keepalive`` flag) reset the stall
        watchdog, so a turn making steady real progress is never failed."""
        bridge = RemoteCommandBridge()
        bridge.HEARTBEAT_GAP_TIMEOUT_S = 5.0
        bridge.NO_PROGRESS_TIMEOUT_S = 0.6
        agent = self._agent_with_ws(bridge)

        gen = bridge.dispatch_task_streaming(
            {"prompt": "hi", "engine": "claude"}, timeout=900, bridge_client_id="a1"
        )
        first = await asyncio.wait_for(gen.__anext__(), timeout=1)
        assert first["type"] == "task_created"
        task_id = next(iter(agent.current_task_ids))

        # Two real progress beats spaced past a single no-progress window; if the
        # watchdog weren't reset by real progress it would have fired between them.
        async def _real_beats():
            for _ in range(2):
                await asyncio.sleep(0.4)  # < 0.6 window, but 0.8 total > window
                bridge.record_heartbeat(
                    "a1",
                    {"task_id": task_id, "action": "tool_use", "detail": "Edit"},
                )

        beats = asyncio.ensure_future(_real_beats())
        try:
            for _ in range(2):
                evt = await asyncio.wait_for(gen.__anext__(), timeout=2)
                assert evt["type"] == "heartbeat"  # alive, not raised
        finally:
            beats.cancel()
            await gen.aclose()

    @pytest.mark.asyncio
    async def test_nonstreaming_dispatch_keepalives_do_not_mask_stall(self):
        """The non-streaming dispatch path (``_dispatch_to_agent``, used by
        background plan execution) shares the same watchdog: blind keepalives
        keep connectivity fresh but must NOT reset the no-progress deadline, so
        a hung agent is failed instead of extending the deadline forever.
        Regression for the masking bug the streaming path had."""
        bridge = RemoteCommandBridge()
        bridge.HEARTBEAT_GAP_TIMEOUT_S = 5.0   # connectivity stays satisfied ...
        bridge.NO_PROGRESS_TIMEOUT_S = 0.5     # ... but no real progress fails fast
        agent = self._agent_with_ws(bridge)

        dispatch = asyncio.ensure_future(
            bridge._dispatch_to_agent(
                agent=agent,
                task_payload={"prompt": "hi", "engine": "claude"},
                timeout=900,
            )
        )
        # The task registers its id synchronously at dispatch start.
        for _ in range(50):
            if agent.current_task_ids:
                break
            await asyncio.sleep(0.01)
        task_id = next(iter(agent.current_task_ids))

        stop = asyncio.Event()

        async def _flood_keepalives():
            while not stop.is_set():
                bridge.record_heartbeat(
                    "a1",
                    {"task_id": task_id, "action": "processing_task",
                     "detail": "working", "keepalive": True},
                )
                await asyncio.sleep(0.1)

        ka = asyncio.ensure_future(_flood_keepalives())
        try:
            with pytest.raises(TimeoutError) as excinfo:
                await asyncio.wait_for(dispatch, timeout=5)
            assert "no progress" in str(excinfo.value).lower()
        finally:
            stop.set()
            await ka


class TestResolveTaskPersistenceDispatchStash:
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


class TestPoolStatusHandshakeRebuild:
    """update_bridge_pool_status rebuilds _active_tasks on bridge reconnect.

    This is the server side of the restart-recovery chain: after a backend
    restart wipes _active_tasks, a reconnecting bridge re-reports its in-flight
    task_ids via the pool_status handshake, and we rebuild the dispatch state so
    _handle_reconnect (and its bridge-return grace wait) can stream the eventual
    result. Plan: launcher-health-probe-stability.
    """

    def _status(self, *tasks: dict) -> dict:
        return {"ready": 1, "busy": 1, "active_tasks": list(tasks)}

    def test_rebuilds_active_task_from_pool_status(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent(user_id=7, bridge_id="bridge-xyz")
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", self._status(
            {"task_id": "task-live", "bridge_session_id": "sess-1",
             "action": "tool_use", "detail": "Reading"},
        ))

        assert "task-live" in bridge._active_tasks
        row = bridge._active_tasks["task-live"]
        assert row["bridge_id"] == "bridge-xyz"
        assert row["bridge_client_id"] == "test-agent"
        assert row["user_id"] == 7
        assert row["action"] == "tool_use"
        assert row["detail"] == "Reading"
        # Handshake-replayed tasks carry no prompt — resolve_task falls back to
        # a placeholder user_message rather than dropping the row.
        assert row["prompt"] == ""
        assert "task-live" in agent.current_task_ids
        # pool_status is stored verbatim for the frontend pill.
        assert agent.pool_status["active_tasks"][0]["task_id"] == "task-live"

    @pytest.mark.asyncio
    async def test_creates_pending_future_so_resolve_can_wake_reconnect(self):
        # Under a running loop the rebuild creates a pending future, so a later
        # resolve_task (the bridge's eventual result) wakes a reconnect handler
        # currently awaiting it.
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", self._status(
            {"task_id": "task-live"},
        ))

        assert "task-live" in bridge._pending_tasks
        assert isinstance(bridge._pending_tasks["task-live"], asyncio.Future)

    def test_rebuilds_multiple_tasks(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", self._status(
            {"task_id": "task-a"},
            {"task_id": "task-b"},
        ))

        assert {"task-a", "task-b"} <= set(bridge._active_tasks)
        assert {"task-a", "task-b"} <= agent.current_task_ids

    def test_skips_already_completed_task(self):
        # The bridge will replay a finished task's buffered result; re-registering
        # it as active would strand a future that never resolves.
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent
        bridge._completed_results["task-done"] = ({"response": "done"}, 0.0)

        bridge.update_bridge_pool_status("test-agent", self._status(
            {"task_id": "task-done"},
        ))

        assert "task-done" not in bridge._active_tasks

    def test_tracks_max_sessions_as_concurrency_cap(self):
        # The bridge's reported session ceiling (driven by the ai-client "Max
        # Sessions" setting) becomes the server-side concurrency gate, so a
        # bridge that can run 10 sessions isn't capped at the hardcoded default.
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        assert agent.max_concurrent == 4  # dataclass default before any report
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", {"max_sessions": 10, "ready": 1})

        assert agent.max_concurrent == 10

    def test_ignores_invalid_max_sessions(self):
        # A missing / non-positive max_sessions leaves the existing cap intact.
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", {"max_sessions": 0, "ready": 1})
        assert agent.max_concurrent == 4
        bridge.update_bridge_pool_status("test-agent", {"ready": 1})
        assert agent.max_concurrent == 4

    def test_does_not_clobber_already_tracked_task(self):
        # A task still alive from this backend instance keeps its richer row
        # (real prompt, live heartbeat ts) — the handshake must not overwrite it.
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent
        original = {
            "_ts": datetime.now(timezone.utc),
            "prompt": "original prompt",
            "action": "thinking",
        }
        bridge._active_tasks["task-live"] = original

        bridge.update_bridge_pool_status("test-agent", self._status(
            {"task_id": "task-live", "action": "tool_use"},
        ))

        assert bridge._active_tasks["task-live"] is original
        assert bridge._active_tasks["task-live"]["prompt"] == "original prompt"

    def test_unknown_agent_is_noop(self):
        bridge = RemoteCommandBridge()
        bridge.update_bridge_pool_status("ghost-agent", self._status(
            {"task_id": "task-x"},
        ))
        assert bridge._active_tasks == {}

    def test_malformed_entries_are_ignored(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", {
            "active_tasks": [
                "not-a-dict",
                {"no_task_id": True},
                {"task_id": ""},
                {"task_id": "   "},
                {"task_id": "task-good"},
            ],
        })

        assert list(bridge._active_tasks) == ["task-good"]

    def test_missing_active_tasks_key_is_noop(self):
        bridge = RemoteCommandBridge()
        agent = _make_agent()
        bridge._agents["test-agent"] = agent

        bridge.update_bridge_pool_status("test-agent", {"ready": 2, "busy": 0})

        assert bridge._active_tasks == {}
        assert agent.pool_status == {"ready": 2, "busy": 0}
