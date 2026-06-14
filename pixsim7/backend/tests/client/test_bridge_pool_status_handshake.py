"""Tests for the bridge client's pool_status in-flight task reporting.

Plan: ``launcher-health-probe-stability`` / ``ws-drop-root-cause``.

This is the CLIENT side of the restart-recovery handshake. After a backend
restart the bridge reconnects and sends ``pool_status``; surfacing its
``_inflight_tasks`` in the payload's ``active_tasks`` array is what lets the
restarted backend rebuild ``_active_tasks`` and accept the frontend's reconnect
for a still-running task. The server side (``update_bridge_pool_status``
rebuilding from this payload) is covered in ``test_remote_cmd_bridge.py``.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-bridge-pool-status-handshake",
    "label": "Bridge pool_status in-flight task reporting (restart recovery)",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/bridge.py",
    ],
    "order": 19.3,
}

import json
from unittest.mock import AsyncMock

import pytest

from pixsim7.client.bridge import Bridge
from pixsim7.client.agent_pool import AgentPool


def _make_bridge() -> Bridge:
    pool = AgentPool(command="claude")
    return Bridge(pool=pool, url="ws://localhost:8000/api/v1/ws/agent-cmd")


async def _send_and_capture(bridge: Bridge) -> dict:
    ws = AsyncMock()
    await bridge._send_pool_status(ws)
    ws.send.assert_awaited_once()
    return json.loads(ws.send.call_args.args[0])


@pytest.mark.asyncio
async def test_reports_inflight_task_in_active_tasks():
    bridge = _make_bridge()
    bridge._inflight_tasks["task-live"] = {
        "bridge_session_id": "sess-1",
        "tab_id": "tab-abc123",
        "started_at": "2026-06-06T00:00:00Z",
        "action": "tool_use",
        "detail": "Reading code",
    }

    payload = await _send_and_capture(bridge)

    assert payload["type"] == "pool_status"
    active = payload["active_tasks"]
    assert len(active) == 1
    assert active[0]["task_id"] == "task-live"
    assert active[0]["bridge_session_id"] == "sess-1"
    # tab_id rides the handshake so a restarted backend can re-attach the
    # surviving turn to its tab (and logs can name which tab dropped).
    assert active[0]["tab_id"] == "tab-abc123"
    assert active[0]["started_at"] == "2026-06-06T00:00:00Z"
    assert active[0]["action"] == "tool_use"
    assert active[0]["detail"] == "Reading code"


@pytest.mark.asyncio
async def test_reports_all_inflight_tasks():
    bridge = _make_bridge()
    bridge._inflight_tasks["task-a"] = {"bridge_session_id": "sa"}
    bridge._inflight_tasks["task-b"] = {"bridge_session_id": "sb"}

    payload = await _send_and_capture(bridge)

    assert {t["task_id"] for t in payload["active_tasks"]} == {"task-a", "task-b"}


@pytest.mark.asyncio
async def test_empty_inflight_reports_empty_list():
    bridge = _make_bridge()
    assert bridge._inflight_tasks == {}

    payload = await _send_and_capture(bridge)

    assert payload["active_tasks"] == []


@pytest.mark.asyncio
async def test_inflight_task_missing_fields_defaults_gracefully():
    # An inflight record registered before the agent reported a bridge_session_id
    # (or action/detail) must still serialize — those fields default, not crash.
    bridge = _make_bridge()
    bridge._inflight_tasks["task-bare"] = {}

    payload = await _send_and_capture(bridge)

    (entry,) = payload["active_tasks"]
    assert entry["task_id"] == "task-bare"
    assert entry["bridge_session_id"] is None
    assert entry["tab_id"] is None
    assert entry["action"] == ""
    assert entry["detail"] == ""
