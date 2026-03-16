"""
WebSocket bridge — connects the agent pool to the pixsim backend.

Handles:
- WebSocket connection lifecycle with auto-reconnect
- Task dispatch from backend to agent pool
- MCP config generation for Claude tool access
- Heartbeat reporting for observability
- Bridge status for local display
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
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
        self._mcp_config_path: Optional[str] = None
        self._token_file_path: Optional[str] = None

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

            # Determine scope: user-scoped bridge vs shared/dev bridge
            user_id = welcome.get("user_id")
            scope = "user" if user_id else "dev"
            service_token = welcome.get("service_token", "")

            # Extract system prompt and generate MCP config
            server_system_prompt = welcome.get("system_prompt")
            mcp_config_path = self._ensure_mcp_config(scope=scope, token=service_token)

            if server_system_prompt or mcp_config_path:
                await self._pool.configure(
                    system_prompt=server_system_prompt,
                    mcp_config_path=mcp_config_path,
                )
                if server_system_prompt:
                    client_log(f"System prompt: {len(server_system_prompt)} chars")
                if mcp_config_path:
                    client_log(f"MCP config: {mcp_config_path}")

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

    def _ensure_mcp_config(self, scope: str = "dev", token: str = "") -> Optional[str]:
        """Generate MCP config file pointing to the pixsim MCP server."""
        if self._mcp_config_path and os.path.exists(self._mcp_config_path):
            return self._mcp_config_path

        # Derive HTTP base URL from WebSocket URL
        api_url = self._url
        for ws_scheme, http_scheme in [("wss://", "https://"), ("ws://", "http://")]:
            if api_url.startswith(ws_scheme):
                api_url = http_scheme + api_url[len(ws_scheme):]
                break
        # Strip path to get base URL (e.g. http://localhost:8000)
        api_base = api_url.split("/api/")[0] if "/api/" in api_url else api_url

        # Path to the MCP server script
        mcp_server_script = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "mcp_server.py"
        )

        # Create a token file that the bridge updates per-request
        # and the MCP server reads on each API call (fresh auth)
        token_fd, token_file = tempfile.mkstemp(suffix=".token", prefix="pixsim-mcp-")
        with os.fdopen(token_fd, "w") as f:
            f.write(token)  # Seed with the bridge service token
        self._token_file_path = token_file

        config = {
            "mcpServers": {
                "pixsim": {
                    "command": sys.executable,
                    "args": [mcp_server_script],
                    "env": {
                        "PIXSIM_API_URL": api_base,
                        "PIXSIM_API_TOKEN": token,
                        "PIXSIM_TOKEN_FILE": token_file,
                        "PIXSIM_SCOPE": scope,
                    },
                }
            }
        }

        # Write to temp file (persists for process lifetime)
        fd, path = tempfile.mkstemp(suffix=".json", prefix="pixsim-mcp-")
        with os.fdopen(fd, "w") as f:
            json.dump(config, f, indent=2)

        self._mcp_config_path = path
        return path

    async def _handle_task(self, ws, msg: dict) -> None:
        """Handle an incoming task from the backend."""
        task_id = msg.get("task_id", "?")
        task_type = msg.get("task", "unknown")
        prompt = msg.get("instruction") or msg.get("prompt", "")

        client_log(f"[task:{task_id[:8]}] {task_type}: {prompt[:80]}...")

        # Write per-request user token so MCP server uses fresh auth
        user_token = msg.get("user_token")
        if user_token and self._token_file_path:
            try:
                with open(self._token_file_path, "w") as f:
                    f.write(user_token)
            except OSError:
                pass

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
