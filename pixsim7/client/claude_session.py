"""
Agent command session manager.

Manages a local agent process (Claude Code, Codex, etc.) via stream-json
stdin/stdout protocol. The process stays alive between messages — each
message is a turn in an ongoing conversation.

Stream-json protocol (shared across compatible agents):
  - Init event: {"type": "system", "session_id": "...", "model": "..."}
  - Input:      {"type": "user", "message": {"role": "user", "content": [...]}}
  - Output:     {"type": "result", "result": "...", "session_id": "..."}
  - Progress:   {"type": "assistant", "message": {"content": [...]}}
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


class AgentCmdSession:
    """Manages a single agent process with stream-json I/O.

    Works with any agent command that speaks the stream-json protocol
    (Claude Code, Codex, etc.). The process stays alive between messages.
    """

    def __init__(
        self,
        session_id: str,
        extra_args: list[str] | None = None,
        command: str = "claude",
        system_prompt: str | None = None,
        mcp_config_path: str | None = None,
        resume_session_id: str | None = None,
    ):
        from pixsim7.client.protocols import get_protocol
        self.session_id = session_id
        self._extra_args = extra_args or []
        self._command = command
        self._protocol = get_protocol(command)
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
        self.cli_session_id: Optional[str] = None   # conversation UUID from init event
        self.cli_model: Optional[str] = None         # model reported by CLI
        self._pending_restart: bool = False

    # ── Backward-compat aliases ────────────────────────────────────
    @property
    def claude_session_id(self) -> Optional[str]:
        return self.cli_session_id

    @claude_session_id.setter
    def claude_session_id(self, value: Optional[str]) -> None:
        self.cli_session_id = value

    @property
    def claude_model(self) -> Optional[str]:
        return self.cli_model

    @claude_model.setter
    def claude_model(self, value: Optional[str]) -> None:
        self.cli_model = value

    # ── Properties ─────────────────────────────────────────────────

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
        """Start the CLI process. Returns True if successful."""
        if self.is_alive:
            return True

        import shutil
        self.state = SessionState.STARTING

        # Resolve full path — needed on Windows where .CMD wrappers (npm)
        # aren't found by asyncio.create_subprocess_exec with bare names
        resolved_command = shutil.which(self._command) or self._command

        cmd = self._protocol.build_start_cmd(
            resolved_command,
            resume_session_id=self._resume_session_id,
            system_prompt=self._system_prompt,
            mcp_config_path=self._mcp_config_path,
            extra_args=self._extra_args,
        )

        client_log(f"[{self.session_id}] Starting: {' '.join(cmd)}")

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            self._last_error = f"Command not found: {self._command}"
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

        client_log(f"[{self.session_id}] Started (PID: {self._process.pid})")
        return True

    async def stop(self) -> None:
        """Stop the CLI process gracefully."""
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
        """Stop and restart the session, preserving conversation via --resume."""
        if self.cli_session_id and not self._resume_session_id:
            self._resume_session_id = self.cli_session_id
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

        For long-running protocols (Claude): sends via stdin to existing process.
        For single-turn protocols (Codex): restarts the process with --resume.
        """
        # Single-turn protocol: restart process per message (with resume)
        if not self._protocol.is_long_running() and self.cli_session_id:
            self._resume_session_id = self.cli_session_id
            await self.stop()
            await asyncio.sleep(0.5)
            if not await self.start():
                raise RuntimeError(f"Session {self.session_id} failed to restart for new turn")

        if not self.is_alive or not self._process or not self._process.stdin:
            raise RuntimeError(f"Session {self.session_id} is not running")

        self.state = SessionState.BUSY

        # Clear stale responses
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Build and send payload via protocol adapter
        payload = self._protocol.build_message_payload(message, images)
        if payload:
            self._process.stdin.write(payload.encode())
            await self._process.stdin.drain()
        # Single-turn protocols: close stdin to signal end of input
        if not self._protocol.is_long_running():
            self._process.stdin.close()
        self.stats.messages_sent += 1
        self.stats.last_activity = datetime.now(timezone.utc)

        result_text = ""
        try:
            while True:
                event_raw = await asyncio.wait_for(
                    self._response_queue.get(),
                    timeout=timeout,
                )

                parsed = self._protocol.parse_event(event_raw)

                if parsed.kind == "init":
                    if parsed.session_id:
                        self.cli_session_id = parsed.session_id
                    if parsed.model:
                        self.cli_model = parsed.model
                    client_log(f"[{self.session_id}] Session: {self.cli_session_id} model: {self.cli_model}")

                elif parsed.kind == "result":
                    if parsed.text:
                        result_text = parsed.text
                    if parsed.session_id:
                        self.cli_session_id = parsed.session_id
                    self.stats.messages_received += 1
                    self.stats.total_duration_ms += parsed.duration_ms
                    self.stats.last_activity = datetime.now(timezone.utc)

                    # For single-turn protocols, process exits after result → we're done
                    if not self._protocol.is_long_running():
                        self.state = SessionState.READY
                        return result_text or "(empty response)"

                    # For long-running, "result" is the final event
                    self.state = SessionState.READY
                    if self._pending_restart:
                        self._pending_restart = False
                        client_log(f"[{self.session_id}] Applying deferred restart")
                        asyncio.ensure_future(self.restart())
                    return result_text or "(empty response)"

                elif parsed.kind == "error":
                    self.stats.errors += 1
                    self.state = SessionState.READY
                    raise RuntimeError(f"Agent error: {parsed.text}")

                elif parsed.kind == "progress":
                    # For single-turn protocols, agent_message text arrives as progress
                    # before the final turn.completed result event
                    if parsed.raw and parsed.raw.get("type") == "item.completed":
                        item = parsed.raw.get("item", {})
                        if item.get("type") == "agent_message" and item.get("text"):
                            result_text = item["text"]
                    if on_progress and parsed.text:
                        on_progress("progress", parsed.text)

                # "other" events are silently skipped

        except asyncio.TimeoutError:
            self.stats.errors += 1
            self.state = SessionState.READY
            raise RuntimeError(f"No response within {timeout}s")

    async def _read_stdout(self) -> None:
        """Read stdout, parse JSON events into the response queue."""
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
                    # Capture session ID from init event (protocol-agnostic)
                    parsed = self._protocol.parse_event(event)
                    if parsed.kind == "init" and parsed.session_id:
                        self.cli_session_id = parsed.session_id
                        self.cli_model = parsed.model
                        client_log(f"[{self.session_id}] Session: {self.cli_session_id}")
                    await self._response_queue.put(event)
                except json.JSONDecodeError:
                    client_log(f"[{self.session_id}] [stdout] {text}")
        except asyncio.CancelledError:
            return

    async def _read_stderr(self) -> None:
        """Read stderr for debug/error output."""
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
            "cli_session_id": self.cli_session_id,
            "cli_model": self.cli_model,
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


# Backward-compat aliases
ClaudeSession = AgentCmdSession
CliSession = AgentCmdSession
