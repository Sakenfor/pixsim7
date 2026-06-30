"""Unsolicited follow-up capture in AgentCmdSession._read_stdout.

A long-running CLI auto-emits a fresh turn (the report for a completed
run_in_background task) on stdout BETWEEN dispatches. The reader must hand the
terminal `result` of such a between-turn turn to the on_unsolicited callback
instead of queueing it (where the next send_message would flush it away) — but
ONLY when no turn is in flight (state != BUSY). See plan
agent-unsolicited-report-delivery.
"""
from __future__ import annotations

import asyncio
import json
import types

import pytest

try:
    from pixsim7.client.session import (
        AgentCmdSession,
        SessionState,
        _EOF_SENTINEL,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


def _fake_process_with_lines(lines: list[str]) -> types.SimpleNamespace:
    """Build a fake process whose .stdout is an asyncio.StreamReader pre-fed
    with the given JSON lines followed by EOF — exactly what _read_stdout reads.
    """
    reader = asyncio.StreamReader()
    for line in lines:
        reader.feed_data((line + "\n").encode())
    reader.feed_eof()
    return types.SimpleNamespace(stdout=reader, returncode=None)


def _result_line(text: str) -> str:
    return json.dumps({
        "type": "result",
        "subtype": "success",
        "result": text,
        "session_id": "conv-xyz",
    })


@pytest.mark.asyncio
async def test_unsolicited_result_diverted_when_not_busy():
    captured: list[str] = []

    async def _on_unsolicited(text: str) -> None:
        captured.append(text)

    session = AgentCmdSession(session_id="t", on_unsolicited=_on_unsolicited)
    session._process = _fake_process_with_lines([_result_line("the report")])
    session.state = SessionState.READY  # between turns — no dispatch consuming

    await session._read_stdout()
    # _dispatch_unsolicited is ensure_future'd — let it run.
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert captured == ["the report"]
    # The result was diverted, NOT queued; only the EOF sentinel remains.
    assert session._response_queue.qsize() == 1
    assert session._response_queue.get_nowait() is _EOF_SENTINEL


@pytest.mark.asyncio
async def test_in_turn_result_not_diverted_when_busy():
    captured: list[str] = []

    async def _on_unsolicited(text: str) -> None:
        captured.append(text)

    session = AgentCmdSession(session_id="t", on_unsolicited=_on_unsolicited)
    session._process = _fake_process_with_lines([_result_line("in-turn reply")])
    session.state = SessionState.BUSY  # a send_message is consuming the queue

    await session._read_stdout()
    await asyncio.sleep(0)

    # Not diverted: the callback never fired and the event is queued for the
    # in-flight send_message loop to consume.
    assert captured == []
    first = session._response_queue.get_nowait()
    assert isinstance(first, dict) and first.get("type") == "result"
    assert session._response_queue.get_nowait() is _EOF_SENTINEL


@pytest.mark.asyncio
async def test_no_callback_means_legacy_queueing():
    session = AgentCmdSession(session_id="t")  # on_unsolicited not wired
    session._process = _fake_process_with_lines([_result_line("x")])
    session.state = SessionState.READY

    await session._read_stdout()
    await asyncio.sleep(0)

    # With no callback the branch is skipped entirely → event queued as before.
    first = session._response_queue.get_nowait()
    assert isinstance(first, dict) and first.get("type") == "result"
