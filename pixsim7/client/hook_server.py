"""
Lightweight async HTTP server for Claude Code hook integration.

Serves a single endpoint that PreToolUse hooks call to request user
confirmation via the bridge → backend → frontend chain.

Protocol:
    POST /confirm
    Body: {"task_id": "...", "tool_name": "...", "tool_input": {...}, "title": "...", "description": "..."}
    Response: {"approved": true/false}

    GET /health
    Response: {"status": "ok"}

The server binds to 127.0.0.1 on an ephemeral port and writes the port
number to a well-known file (~/.pixsim/hook_port) so hooks can discover it.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

from pixsim_logging import get_logger

logger = get_logger()

# Well-known file where the hook port is published
HOOK_PORT_FILE = Path.home() / ".pixsim" / "hook_port"

# Type for the confirmation callback.
# Returns a dict with at minimum {"approved": bool}, optionally {"choice": str} or {"text": str}.
ConfirmationCallback = Callable[
    [dict],  # full request payload
    Coroutine[Any, Any, dict],
]


class HookServer:
    """Minimal asyncio HTTP server for Claude Code PreToolUse hooks."""

    def __init__(self, confirm_fn: ConfirmationCallback) -> None:
        self._confirm_fn = confirm_fn
        self._server: Optional[asyncio.AbstractServer] = None
        self._port: int = 0

    @property
    def port(self) -> int:
        return self._port

    async def start(self, port: int = 0) -> int:
        """Start serving on the given port (0 = ephemeral). Returns the actual port."""
        self._server = await asyncio.start_server(
            self._handle_connection, "127.0.0.1", port,
        )
        # Resolve actual port
        sock = self._server.sockets[0]
        self._port = sock.getsockname()[1]
        # Publish port to well-known file
        HOOK_PORT_FILE.parent.mkdir(parents=True, exist_ok=True)
        HOOK_PORT_FILE.write_text(str(self._port))
        logger.info("hook_server_started", port=self._port, port_file=str(HOOK_PORT_FILE))
        return self._port

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        # Clean up port file
        try:
            HOOK_PORT_FILE.unlink(missing_ok=True)
        except Exception:
            pass

    async def _handle_connection(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        """Handle a raw HTTP connection (one request per connection)."""
        try:
            # Read request line + headers
            request_line = await asyncio.wait_for(reader.readline(), timeout=5)
            if not request_line:
                writer.close()
                return

            method, path, _ = request_line.decode().strip().split(" ", 2)
            # Read headers
            content_length = 0
            while True:
                line = await asyncio.wait_for(reader.readline(), timeout=5)
                decoded = line.decode().strip()
                if not decoded:
                    break
                if decoded.lower().startswith("content-length:"):
                    content_length = int(decoded.split(":", 1)[1].strip())

            # Read body
            body = b""
            if content_length > 0:
                body = await asyncio.wait_for(reader.readexactly(content_length), timeout=5)

            # Route
            if path == "/health" and method == "GET":
                self._send_json(writer, 200, {"status": "ok"})
            elif path == "/confirm" and method == "POST":
                await self._handle_confirm(writer, body)
            else:
                self._send_json(writer, 404, {"error": "not found"})

        except Exception as e:
            try:
                self._send_json(writer, 500, {"error": str(e)})
            except Exception:
                pass
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _handle_confirm(self, writer: asyncio.StreamWriter, body: bytes) -> None:
        """Handle POST /confirm — blocks until user responds."""
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_json(writer, 400, {"error": "invalid JSON"})
            return

        try:
            result = await self._confirm_fn(data)
            self._send_json(writer, 200, result)
        except Exception as e:
            logger.warning("hook_confirm_error", error=str(e))
            self._send_json(writer, 200, {"approved": False, "error": str(e)})

    @staticmethod
    def _send_json(writer: asyncio.StreamWriter, status: int, data: dict) -> None:
        body = json.dumps(data).encode()
        reason = "OK" if status == 200 else "Error"
        writer.write(
            f"HTTP/1.1 {status} {reason}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"Connection: close\r\n"
            f"\r\n".encode()
        )
        writer.write(body)
