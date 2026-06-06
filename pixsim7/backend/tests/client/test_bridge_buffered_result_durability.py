"""Tests for the bridge's disk-backed undelivered-result buffer.

Plan: ``launcher-health-probe-stability`` /
checkpoint ``buffered-result-lost-on-bridge-restart``.

Background: when the WS to the backend is dead at the moment a task
completes, the bridge holds the result in ``_buffered_results`` and replays
it on reconnect. That in-memory buffer does not survive a bridge *process*
restart — and the completed reply exists nowhere else once the CLI session
is gone, so a restart in the dead-WS window silently lost the turn
server-side. These tests cover the disk mirror that makes the buffered
result survive a restart.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-bridge-buffered-result-durability",
    "label": "Bridge buffered-result durability (survives process restart)",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/bridge.py",
    ],
    "order": 19.1,
}

import json
import os
from unittest.mock import AsyncMock

import pytest

from pixsim7.client.bridge import Bridge
from pixsim7.client.agent_pool import AgentPool


def _make_bridge() -> Bridge:
    pool = AgentPool(command="claude")
    return Bridge(pool=pool, url="ws://localhost:8000/api/v1/ws/agent-cmd")


@pytest.fixture(autouse=True)
def _isolated_buffer_dir(tmp_path, monkeypatch):
    """Point the disk buffer at tmp_path so tests never touch real ~/.pixsim."""
    monkeypatch.setenv("PIXSIM_BRIDGE_BUFFER_DIR", str(tmp_path / "buffered_results"))
    yield


def test_persisted_result_survives_process_restart():
    """A buffered result written by one bridge is reloaded by the next."""
    b1 = _make_bridge()
    result_msg = {
        "type": "result",
        "task_id": "task-abc123",
        "edited_prompt": "the recovered 2373-char reply",
        "bridge_session_id": "claude-cli-session-7",
    }
    b1._buffered_results[result_msg["task_id"]] = result_msg
    b1._persist_buffered_result(result_msg["task_id"], result_msg)

    # Simulate a process restart: a fresh Bridge reads the same dir on init.
    b2 = _make_bridge()
    assert "task-abc123" in b2._buffered_results
    assert b2._buffered_results["task-abc123"]["edited_prompt"] == (
        "the recovered 2373-char reply"
    )
    assert b2._buffered_results["task-abc123"]["bridge_session_id"] == (
        "claude-cli-session-7"
    )


def test_error_result_is_also_persisted():
    b1 = _make_bridge()
    err = {"type": "error", "task_id": "task-err", "error": "boom"}
    b1._persist_buffered_result("task-err", err)

    b2 = _make_bridge()
    assert b2._buffered_results.get("task-err", {}).get("type") == "error"


def test_drop_removes_disk_copy():
    """Once replayed, the on-disk copy is removed so it isn't re-sent."""
    b1 = _make_bridge()
    b1._persist_buffered_result("task-x", {"type": "result", "task_id": "task-x"})
    b1._drop_persisted_buffered_result("task-x")

    b2 = _make_bridge()
    assert "task-x" not in b2._buffered_results


def test_stale_buffered_results_are_pruned_on_load():
    """Files older than the TTL are dropped (and not reloaded) at startup."""
    b1 = _make_bridge()
    b1._persist_buffered_result("task-old", {"type": "result", "task_id": "task-old"})
    path = b1._buffered_results_dir / "task-old.json"
    assert path.exists()

    # Backdate the file well past the TTL.
    old = os.stat(path).st_mtime - (Bridge._BUFFERED_RESULT_TTL_SECONDS + 3600)
    os.utime(path, (old, old))

    b2 = _make_bridge()
    assert "task-old" not in b2._buffered_results
    assert not path.exists()  # pruned from disk too


def test_load_tolerates_corrupt_files(tmp_path):
    """A garbage file in the buffer dir is skipped, not fatal."""
    b1 = _make_bridge()
    b1._buffered_results_dir.mkdir(parents=True, exist_ok=True)
    (b1._buffered_results_dir / "garbage.json").write_text("{not json", encoding="utf-8")
    b1._persist_buffered_result("task-good", {"type": "result", "task_id": "task-good"})

    b2 = _make_bridge()
    assert "task-good" in b2._buffered_results


def test_missing_buffer_dir_loads_empty():
    """No dir yet → empty buffer, no error."""
    # autouse fixture points at a tmp subdir that doesn't exist until written
    b = _make_bridge()
    assert b._buffered_results == {}


def test_persist_is_atomic_no_tmp_left_behind():
    b1 = _make_bridge()
    b1._persist_buffered_result("task-atomic", {"type": "result", "task_id": "task-atomic"})
    leftovers = list(b1._buffered_results_dir.glob(".*.tmp"))
    assert leftovers == []
    assert (b1._buffered_results_dir / "task-atomic.json").exists()


# ── Replay-on-reconnect ──────────────────────────────────────────
# The disk buffer above is only useful if it's actually re-sent and then
# cleared when the WS comes back. These cover _replay_buffered_results, the
# loop run() invokes right after a (re)connect.


def _buffer(bridge: Bridge, task_id: str) -> None:
    """Add an in-memory + on-disk buffered result for a task."""
    msg = {"type": "result", "task_id": task_id, "response": f"reply-{task_id}"}
    bridge._buffered_results[task_id] = msg
    bridge._persist_buffered_result(task_id, msg)


@pytest.mark.asyncio
async def test_replay_sends_all_and_clears_memory_and_disk():
    bridge = _make_bridge()
    _buffer(bridge, "task-a")
    _buffer(bridge, "task-b")
    ws = AsyncMock()

    await bridge._replay_buffered_results(ws)

    # Both replayed over the WS...
    assert ws.send.await_count == 2
    sent_task_ids = {json.loads(c.args[0])["task_id"] for c in ws.send.await_args_list}
    assert sent_task_ids == {"task-a", "task-b"}
    # ...and cleared from memory + disk so they aren't re-sent next reconnect.
    assert bridge._buffered_results == {}
    assert list(bridge._buffered_results_dir.glob("*.json")) == []


@pytest.mark.asyncio
async def test_replay_empty_buffer_is_noop():
    bridge = _make_bridge()
    ws = AsyncMock()

    await bridge._replay_buffered_results(ws)

    ws.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_replay_stops_on_send_failure_keeping_remaining():
    # WS breaks again mid-replay: the first result lands, the rest stay buffered
    # (memory + disk) for the next reconnect instead of being lost.
    bridge = _make_bridge()
    _buffer(bridge, "task-a")
    _buffer(bridge, "task-b")
    ws = AsyncMock()
    ws.send.side_effect = [None, ConnectionError("ws died again")]

    await bridge._replay_buffered_results(ws)

    assert "task-a" not in bridge._buffered_results
    assert not (bridge._buffered_results_dir / "task-a.json").exists()
    # task-b survives for a later retry.
    assert "task-b" in bridge._buffered_results
    assert (bridge._buffered_results_dir / "task-b.json").exists()


@pytest.mark.asyncio
async def test_replay_first_failure_keeps_everything():
    bridge = _make_bridge()
    _buffer(bridge, "task-a")
    _buffer(bridge, "task-b")
    ws = AsyncMock()
    ws.send.side_effect = ConnectionError("ws dead on arrival")

    await bridge._replay_buffered_results(ws)

    # Nothing acknowledged → nothing dropped.
    assert set(bridge._buffered_results) == {"task-a", "task-b"}
    assert {p.stem for p in bridge._buffered_results_dir.glob("*.json")} == {"task-a", "task-b"}
