"""Tests for the bridge's WS-level keepalive (ping/pong) configuration.

Plan: ``launcher-health-probe-stability`` /
checkpoint ``buffered-result-lost-on-bridge-restart``.

Commit 45d54664f disabled the client websockets ping (``ping_interval=None``),
which left the bridge unable to notice a silently half-open connection — a
turn that completed while the WS was dead was only discovered when its
``result`` failed to send, the window in which a process restart could lose
the buffered reply. The fix re-enabled ping with generous, env-overridable
timing.

Three layers:
  1. ``_resolve_ws_ping_timing`` returns the right defaults / honours env.
  2. ``_connect_and_serve`` actually passes that timing to ``ws_connect``
     (regression guard against a silent re-disable).
  3. End-to-end: with ping enabled, a peer that stops ponging is detected and
     the connection raises within ~interval+timeout (the real half-open
     failure mode, exercised through a black-holing TCP proxy).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-bridge-ws-keepalive",
    "label": "Bridge WS keepalive (half-open detection)",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/bridge.py",
    ],
    "order": 19.2,
}

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.client.bridge import Bridge
from pixsim7.client.agent_pool import AgentPool


def _make_bridge() -> Bridge:
    pool = AgentPool(command="claude")
    return Bridge(pool=pool, url="ws://localhost:8000/api/v1/ws/agent-cmd")


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path, monkeypatch):
    """Isolate disk buffer + clear ping env so defaults are deterministic."""
    monkeypatch.setenv("PIXSIM_BRIDGE_BUFFER_DIR", str(tmp_path / "buffered_results"))
    monkeypatch.delenv("PIXSIM_BRIDGE_PING_INTERVAL", raising=False)
    monkeypatch.delenv("PIXSIM_BRIDGE_PING_TIMEOUT", raising=False)
    yield


# ── Layer 1: timing resolver ─────────────────────────────────────


def test_ping_timing_defaults():
    assert Bridge._resolve_ws_ping_timing() == (20.0, 60.0)


def test_ping_timing_env_override(monkeypatch):
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_INTERVAL", "2.5")
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_TIMEOUT", "4")
    assert Bridge._resolve_ws_ping_timing() == (2.5, 4.0)


def test_ping_timing_invalid_or_nonpositive_falls_back(monkeypatch):
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_INTERVAL", "not-a-number")
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_TIMEOUT", "-3")
    assert Bridge._resolve_ws_ping_timing() == (20.0, 60.0)


# ── Layer 2: wiring guard ────────────────────────────────────────


@pytest.mark.asyncio
async def test_connect_passes_ping_timing_to_ws_connect(monkeypatch):
    """_connect_and_serve must hand the resolved timing to ws_connect.

    Guards against a future change silently dropping ping back to None — the
    exact regression (45d54664f) that caused the buffered-reply loss.
    """
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_INTERVAL", "7")
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_TIMEOUT", "11")
    bridge = _make_bridge()
    bridge._shared = True  # skip token lookup so the URL build stays trivial

    captured: dict = {}

    class _Bail(Exception):
        pass

    def _fake_ws_connect(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(side_effect=_Bail())  # bail before the handshake
        cm.__aexit__ = AsyncMock(return_value=False)
        return cm

    monkeypatch.setattr("pixsim7.client.bridge.ws_connect", _fake_ws_connect)

    with pytest.raises(_Bail):
        await bridge._connect_and_serve()

    assert captured["kwargs"]["ping_interval"] == 7.0
    assert captured["kwargs"]["ping_timeout"] == 11.0


# ── Layer 3: end-to-end half-open detection ──────────────────────


class _BlackholeProxy:
    """127.0.0.1 TCP proxy that can stop forwarding while keeping sockets open.

    Simulates a connection that silently dies mid-stream (peer vanishes with no
    close frame) — which loopback can't otherwise produce, since a real close
    sends a RST. Once ``blackhole()`` is called, bytes in both directions are
    dropped, so the client's WS Pings never reach the upstream and no Pong ever
    comes back → the client's ping_timeout must fire.
    """

    def __init__(self, upstream_host: str, upstream_port: int):
        self._uh = upstream_host
        self._up = upstream_port
        self._server: asyncio.AbstractServer | None = None
        self._blocked = False
        self._conn_tasks: set[asyncio.Task] = set()
        self.port: int | None = None

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._on_client, "127.0.0.1", 0)
        self.port = self._server.sockets[0].getsockname()[1]

    def blackhole(self) -> None:
        self._blocked = True

    async def stop(self) -> None:
        # Connection handlers may be parked (sleep) holding sockets open to keep
        # the peer silent — cancel them so cleanup can't hang on wait_closed().
        for t in list(self._conn_tasks):
            t.cancel()
        if self._server is not None:
            self._server.close()
            try:
                await asyncio.wait_for(self._server.wait_closed(), timeout=2)
            except Exception:
                pass

    async def _on_client(self, creader, cwriter) -> None:
        self._conn_tasks.add(asyncio.current_task())
        try:
            ureader, uwriter = await asyncio.open_connection(self._uh, self._up)
        except Exception:
            cwriter.close()
            return
        try:
            await asyncio.gather(
                self._pump(creader, uwriter),
                self._pump(ureader, cwriter),
                return_exceptions=True,
            )
        except asyncio.CancelledError:
            pass

    async def _pump(self, reader, writer) -> None:
        try:
            while True:
                data = await reader.read(65536)
                if not data:
                    break
                if self._blocked:
                    # Drop this and stop forwarding entirely — keep the socket
                    # open so the peer sees no close, just silence.
                    await asyncio.sleep(3600)
                    return
                writer.write(data)
                await writer.drain()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_ping_detects_silent_peer_and_connection_raises(monkeypatch):
    websockets = pytest.importorskip("websockets")
    from websockets.asyncio.server import serve
    from websockets.exceptions import ConnectionClosed
    from pixsim7.client.bridge import ws_connect

    interval, timeout = 0.3, 0.3
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_INTERVAL", str(interval))
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_TIMEOUT", str(timeout))
    # The bridge resolves the same values the connection will use.
    assert Bridge._resolve_ws_ping_timing() == (interval, timeout)

    async def _handler(server_ws):
        await server_ws.send(json.dumps({"type": "welcome", "bridge_client_id": "t"}))
        try:
            async for _ in server_ws:  # consume; library auto-pongs
                pass
        except Exception:
            pass

    # Server ping disabled so ONLY the client's keepalive is under test.
    server = await serve(_handler, "127.0.0.1", 0, ping_interval=None)
    server_port = server.sockets[0].getsockname()[1]
    proxy = _BlackholeProxy("127.0.0.1", server_port)
    await proxy.start()

    try:
        res_i, res_t = Bridge._resolve_ws_ping_timing()
        # Small close_timeout so the post-ping-timeout close handshake (whose
        # ack the black-hole eats) completes fast instead of waiting the 10s
        # default — keeps the test quick while still proving detection.
        close_timeout = 1.0
        async with ws_connect(
            f"ws://127.0.0.1:{proxy.port}",
            ping_interval=res_i,
            ping_timeout=res_t,
            close_timeout=close_timeout,
        ) as ws:
            welcome = json.loads(await ws.recv())
            assert welcome["type"] == "welcome"

            # Kill the path: pings now vanish, no pong ever returns.
            proxy.blackhole()

            with pytest.raises(ConnectionClosed):
                # Detected via ping_timeout, then closed within close_timeout —
                # must surface in that window, NOT hang for the whole turn.
                await asyncio.wait_for(
                    ws.recv(), timeout=interval + timeout + close_timeout + 4
                )
    finally:
        await proxy.stop()
        server.close()
        try:
            await asyncio.wait_for(server.wait_closed(), timeout=2)
        except Exception:
            pass


@pytest.mark.asyncio
async def test_healthy_peer_is_not_dropped(monkeypatch):
    """Sanity counter-test: with the path open, ping/pong keeps the conn alive."""
    websockets = pytest.importorskip("websockets")
    from websockets.asyncio.server import serve
    from pixsim7.client.bridge import ws_connect

    interval, timeout = 0.3, 0.3
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_INTERVAL", str(interval))
    monkeypatch.setenv("PIXSIM_BRIDGE_PING_TIMEOUT", str(timeout))

    async def _handler(server_ws):
        await server_ws.send(json.dumps({"type": "welcome"}))
        try:
            async for _ in server_ws:
                pass
        except Exception:
            pass

    server = await serve(_handler, "127.0.0.1", 0, ping_interval=None)
    port = server.sockets[0].getsockname()[1]
    try:
        res_i, res_t = Bridge._resolve_ws_ping_timing()
        async with ws_connect(
            f"ws://127.0.0.1:{port}", ping_interval=res_i, ping_timeout=res_t
        ) as ws:
            await ws.recv()  # welcome
            # Stay connected across several ping cycles; recv should just time
            # out waiting for (absent) data, NOT raise a closed-connection.
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(ws.recv(), timeout=(interval + timeout) * 3)
    finally:
        server.close()
        try:
            await asyncio.wait_for(server.wait_closed(), timeout=2)
        except Exception:
            pass
