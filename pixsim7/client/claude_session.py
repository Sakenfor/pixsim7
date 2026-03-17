"""
Claude CLI session manager.

Manages a Claude process in stream-json mode with proper lifecycle,
health monitoring, and message passing.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Optional

from pixsim7.client.log import client_log


class SessionState(str, Enum):
    IDLE = "idle"
    STARTING = "starting"
    READY = "ready"
    BUSY = "busy"
    ERRORED = "errored"
    STOPPED = "stopped"


@dataclass
class SessionStats:
    messages_sent: int = 0
    messages_received: int = 0
    errors: int = 0
    total_duration_ms: int = 0
    started_at: Optional[datetime] = None
    last_activity: Optional[datetime] = None


class ClaudeSession:
    """Manages a single Claude CLI process with stream-json I/O."""

    def __init__(
        self,
        session_id: str,
        extra_args: list[str] | None = None,
        claude_command: str = "claude",
        system_prompt: str | None = None,
        mcp_config_path: str | None = None,
        resume_session_id: str | None = None,
    ):
        self.session_id = session_id
        self._extra_args = extra_args or []
        self._claude_command = claude_command
        self._system_prompt = system_prompt
        self._mcp_config_path = mcp_config_path
        self._resume_session_id = resume_session_id
        self._process: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._response_queue: asyncio.Queue[dict] = asyncio.Queue()
        self.state = SessionState.IDLE
        self.stats = SessionStats()
        self._last_error: Optional[str] = None
        self.claude_session_id: Optional[str] = None  # UUID from Claude's init event
        self.claude_model: Optional[str] = None
        self._pending_restart: bool = False

    @property
    def is_alive(self) -> bool:
        return self._process is not None and self._process.returncode is None

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    @property
    def pid(self) -> Optional[int]:
        return self._process.pid if self._process else None

    async def start(self) -> bool:
        """Start the Claude process. Returns True if successful."""
        if self.is_alive:
            return True

        self.state = SessionState.STARTING
        cmd = [
            self._claude_command,
            "--print",
            "--output-format", "stream-json",
            "--input-format", "stream-json",
            "--verbose",
        ]
        if self._resume_session_id:
            cmd.extend(["--resume", self._resume_session_id])
        if self._system_prompt:
            cmd.extend(["--append-system-prompt", self._system_prompt])
        if self._mcp_config_path:
            cmd.extend(["--mcp-config", self._mcp_config_path])
        cmd.extend(self._extra_args)

        client_log(f"[{self.session_id}] Starting: {' '.join(cmd)}")

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            self._last_error = f"Command not found: {self._claude_command}"
            self.state = SessionState.ERRORED
            client_log(f"[{self.session_id}] {self._last_error}", error=True)
            return False
        except Exception as e:
            self._last_error = str(e)
            self.state = SessionState.ERRORED
            client_log(f"[{self.session_id}] Failed to start: {e}", error=True)
            return False

        self._reader_task = asyncio.create_task(self._read_stdout())
        self._stderr_task = asyncio.create_task(self._read_stderr())
        self.state = SessionState.READY
        self.stats.started_at = datetime.now(timezone.utc)
        self._last_error = None

        client_log(f"[{self.session_id}] Claude started (PID: {self._process.pid})")
        return True

    async def stop(self) -> None:
        """Stop the Claude process gracefully."""
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._stderr_task:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass

        if self._process and self._process.returncode is None:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    self._process.kill()
                except ProcessLookupError:
                    pass

        self.state = SessionState.STOPPED
        client_log(f"[{self.session_id}] Stopped (sent: {self.stats.messages_sent}, received: {self.stats.messages_received})")

    async def restart(self) -> bool:
        """Stop and restart the session."""
        await self.stop()
        await asyncio.sleep(1)
        return await self.start()

    async def send_message(
        self,
        message: str,
        timeout: int = 120,
        images: list[dict] | None = None,
        on_progress: "Callable[[str, str], None] | None" = None,
    ) -> str:
        """Send a message and wait for the complete response.

        Args:
            message: Text message
            timeout: Seconds to wait
            images: Optional list of {"media_type": "image/png", "data": "<base64>"}
            on_progress: Optional callback(event_type, detail) for intermediate events
        """
        if not self.is_alive or not self._process or not self._process.stdin:
            raise RuntimeError(f"Session {self.session_id} is not running")

        self.state = SessionState.BUSY

        # Clear stale responses
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Build content blocks
        content: list[dict] = [{"type": "text", "text": message}]
        for img in (images or []):
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img.get("media_type", "image/png"),
                    "data": img["data"],
                },
            })

        # Claude stream-json input format
        msg = json.dumps({
            "type": "user",
            "message": {
                "role": "user",
                "content": content,
            },
        }) + "\n"

        self._process.stdin.write(msg.encode())
        await self._process.stdin.drain()
        self.stats.messages_sent += 1
        self.stats.last_activity = datetime.now(timezone.utc)

        try:
            while True:
                event = await asyncio.wait_for(
                    self._response_queue.get(),
                    timeout=timeout,
                )

                event_type = event.get("type", "")

                if event_type == "result":
                    result_text = event.get("result", "")
                    duration = event.get("duration_ms", 0)
                    # Capture Claude session ID from result events
                    if event.get("session_id"):
                        self.claude_session_id = event["session_id"]
                    self.stats.messages_received += 1
                    self.stats.total_duration_ms += duration
                    self.stats.last_activity = datetime.now(timezone.utc)
                    self.state = SessionState.READY
                    # Deferred restart: config changed while busy
                    if self._pending_restart:
                        self._pending_restart = False
                        from pixsim7.client.log import client_log
                        client_log(f"[{self.session_id}] Applying deferred restart")
                        asyncio.ensure_future(self.restart())
                    return result_text or "(empty response)"

                elif event_type == "system":
                    # Init event — capture session ID and model
                    if event.get("session_id"):
                        self.claude_session_id = event["session_id"]
                    if event.get("model"):
                        self.claude_model = event["model"]
                    client_log(f"[{self.session_id}] Claude session: {self.claude_session_id} model: {self.claude_model}")

                elif event_type == "error":
                    error_msg = event.get("error", {})
                    if isinstance(error_msg, dict):
                        error_msg = error_msg.get("message", str(error_msg))
                    self.stats.errors += 1
                    self.state = SessionState.READY
                    raise RuntimeError(f"Claude error: {error_msg}")

                elif event_type == "assistant":
                    # Intermediate content — tool calls, thinking, partial text
                    content_block = event.get("message", {}).get("content", [{}])
                    if content_block:
                        block = content_block[0] if isinstance(content_block, list) else content_block
                        block_type = block.get("type", "")
                        if block_type == "tool_use":
                            detail = f"Using tool: {block.get('name', '?')}"
                            if on_progress:
                                on_progress("tool_use", detail)
                        elif block_type == "thinking":
                            if on_progress:
                                on_progress("thinking", "Thinking...")
                        elif block_type == "text":
                            text = block.get("text", "")
                            if on_progress and text:
                                on_progress("streaming", text[:100])

                # Skip other events (rate_limit_event, content_block_delta, etc.)

        except asyncio.TimeoutError:
            self.stats.errors += 1
            self.state = SessionState.READY
            raise RuntimeError(f"No response within {timeout}s")

    async def _read_stdout(self) -> None:
        """Read Claude's stdout, parse JSON events into the response queue."""
        if not self._process or not self._process.stdout:
            return
        try:
            while True:
                line = await self._process.stdout.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if not text:
                    continue
                try:
                    event = json.loads(text)
                    # Capture session ID from system init (comes before any message exchange)
                    if event.get("type") == "system" and event.get("session_id"):
                        self.claude_session_id = event["session_id"]
                        self.claude_model = event.get("model")
                        client_log(f"[{self.session_id}] Claude session: {self.claude_session_id}")
                    await self._response_queue.put(event)
                except json.JSONDecodeError:
                    client_log(f"[{self.session_id}] [stdout] {text}")
        except asyncio.CancelledError:
            return

    async def _read_stderr(self) -> None:
        """Read Claude's stderr for debug/error output."""
        if not self._process or not self._process.stderr:
            return
        try:
            while True:
                line = await self._process.stderr.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if text:
                    client_log(f"[{self.session_id}] [stderr] {text}")
        except asyncio.CancelledError:
            return

    def to_dict(self) -> dict:
        """Serialize session status for display and persistence."""
        return {
            "session_id": self.session_id,
            "claude_session_id": self.claude_session_id,
            "claude_model": self.claude_model,
            "state": self.state.value,
            "pid": self.pid,
            "last_error": self._last_error,
            "messages_sent": self.stats.messages_sent,
            "messages_received": self.stats.messages_received,
            "errors": self.stats.errors,
            "total_duration_ms": self.stats.total_duration_ms,
            "started_at": self.stats.started_at.isoformat() if self.stats.started_at else None,
            "last_activity": self.stats.last_activity.isoformat() if self.stats.last_activity else None,
        }
