"""
WebSocket bridge — connects the agent pool to the pixsim backend.

Handles:
- WebSocket connection lifecycle with auto-reconnect
- Task dispatch from backend to agent pool
- Heartbeat reporting for observability
- Bridge status for local display
"""
from __future__ import annotations

import asyncio
import json
from typing import Optional

try:
    import websockets
    from websockets.asyncio.client import connect as ws_connect
except ImportError:
    websockets = None  # type: ignore
    ws_connect = None  # type: ignore

from pixsim7.client.agent_pool import AgentPool
from pixsim7.client.log import client_log


class Bridge:
    """WebSocket bridge between local agent pool and pixsim backend."""

    def __init__(
        self,
        pool: AgentPool,
        url: str = "ws://localhost:8000/api/v1/ws/agent-cmd",
        agent_type: str = "claude-cli",
    ):
        self._pool = pool
        self._url = url
        self._agent_type = agent_type
        self._agent_id: Optional[str] = None
        self._connected = False
        self._tasks_handled = 0

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def agent_id(self) -> Optional[str]:
        return self._agent_id

    async def run(self) -> None:
        """Main loop — connect, handle tasks, reconnect on failure."""
        if websockets is None:
            client_log("Missing dependency: websockets", error=True)
            client_log("Install with: pip install websockets", error=True)
            return

        while True:
            try:
                await self._connect_and_serve()
            except KeyboardInterrupt:
                break
            except Exception as e:
                self._connected = False
                client_log(f"Connection error: {e}", error=True)
                client_log("Reconnecting in 5s...")
                await asyncio.sleep(5)

    async def _connect_and_serve(self) -> None:
        """Single connection session."""
        ws_url = f"{self._url}?agent_type={self._agent_type}"

        client_log(f"Connecting to {self._url}...")

        async with ws_connect(ws_url) as ws:
            # Welcome message
            welcome = json.loads(await ws.recv())
            self._agent_id = welcome.get("agent_id", "unknown")
            self._connected = True

            # If server sent a system prompt, apply it to pool sessions
            server_system_prompt = welcome.get("system_prompt")
            if server_system_prompt:
                self._pool.set_system_prompt(server_system_prompt)
                client_log(f"Received system prompt ({len(server_system_prompt)} chars)")

            client_log(f"Connected as {self._agent_id}")
            client_log(f"Pool: {self._pool.ready_count} ready, {self._pool.busy_count} busy")
            client_log("Waiting for tasks...\n")

            while True:
                raw = await ws.recv()
                msg = json.loads(raw)
                msg_type = msg.get("type", "")

                if msg_type == "task":
                    await self._handle_task(ws, msg)

                elif msg_type == "ping":
                    await ws.send(json.dumps({"type": "pong"}))

    async def _handle_task(self, ws, msg: dict) -> None:
        """Handle an incoming task from the backend."""
        task_id = msg.get("task_id", "?")
        task_type = msg.get("task", "unknown")
        prompt = msg.get("instruction") or msg.get("prompt", "")

        client_log(f"[task:{task_id[:8]}] {task_type}: {prompt[:80]}...")

        # Report busy
        await ws.send(json.dumps({
            "type": "heartbeat",
            "status": "active",
            "action": "processing_task",
            "detail": prompt[:100],
        }))

        try:
            session_id, response = await self._pool.send_message(prompt)
            self._tasks_handled += 1

            preview = response[:120].replace('\n', ' ')
            client_log(f"[task:{task_id[:8]}] Done via {session_id} ({len(response)} chars): {preview}")

            await ws.send(json.dumps({
                "type": "result",
                "task_id": task_id,
                "edited_prompt": response,
            }))

        except Exception as e:
            client_log(f"[task:{task_id[:8]}] Error: {e}", error=True)
            await ws.send(json.dumps({
                "type": "error",
                "task_id": task_id,
                "error": str(e),
            }))

    def status(self) -> dict:
        """Bridge status summary."""
        return {
            "connected": self._connected,
            "agent_id": self._agent_id,
            "tasks_handled": self._tasks_handled,
            "pool": self._pool.status(),
        }
