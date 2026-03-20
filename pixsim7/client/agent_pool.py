"""
Agent pool — manages multiple agent command sessions.

Handles session lifecycle, health monitoring, and task routing.
Supports session-affinity: messages targeting a specific conversation
are routed to the matching session, or a new session is spawned with --resume.

Works with any agent command that speaks the stream-json protocol
(Claude Code, Codex, etc.).
"""
from __future__ import annotations

import asyncio
from typing import Callable, Dict, List, Optional

from pixsim7.client.claude_session import AgentCmdSession, SessionState
from pixsim7.client.log import client_log

MAX_SESSIONS = 10
IDLE_EVICT_SECONDS = 30 * 60  # 30 minutes


class AgentPool:
    """Manages a pool of agent command sessions with automatic health recovery."""

    def __init__(
        self,
        pool_size: int = 1,
        extra_args: list[str] | None = None,
        command: str = "claude",
        auto_restart: bool = True,
        max_sessions: int = MAX_SESSIONS,
    ):
        self._pool_size = pool_size
        self._extra_args = extra_args or []
        self._command = command
        self._prefix = command.split("/")[-1].split("\\")[-1]  # e.g. "claude", "codex"
        self._auto_restart = auto_restart
        self._max_sessions = max_sessions
        self._system_prompt: Optional[str] = None
        self._mcp_config_path: Optional[str] = None
        self._resume_session_id: Optional[str] = None
        self._sessions: Dict[str, AgentCmdSession] = {}
        self._health_task: Optional[asyncio.Task] = None
        # Index: cli_session_id -> pool session key (for affinity routing)
        self._session_id_index: Dict[str, str] = {}
        self._next_dynamic_id = 0

    @property
    def sessions(self) -> List[AgentCmdSession]:
        return list(self._sessions.values())

    @property
    def ready_count(self) -> int:
        return sum(1 for s in self._sessions.values() if s.state == SessionState.READY)

    @property
    def busy_count(self) -> int:
        return sum(1 for s in self._sessions.values() if s.state == SessionState.BUSY)

    def get_available(self, command: str | None = None) -> Optional[AgentCmdSession]:
        """Get a ready session for task dispatch, optionally matching a command."""
        for session in self._sessions.values():
            if session.state == SessionState.READY:
                if command and session._command != command:
                    continue
                return session
        return None

    def _find_by_session_id(self, claude_session_id: str) -> Optional[AgentCmdSession]:
        """Find a session by its Claude conversation UUID."""
        # Fast path: index
        pool_key = self._session_id_index.get(claude_session_id)
        if pool_key and pool_key in self._sessions:
            return self._sessions[pool_key]
        # Slow path: scan (index may be stale)
        for session in self._sessions.values():
            if session.claude_session_id == claude_session_id:
                self._session_id_index[claude_session_id] = session.session_id
                return session
        return None

    def _update_index(self, session: AgentCmdSession) -> None:
        """Update the claude_session_id -> pool key index."""
        if session.claude_session_id:
            self._session_id_index[session.claude_session_id] = session.session_id

    async def _evict_oldest_idle(self) -> bool:
        """Stop the oldest idle on-demand session to make room. Returns True if one was evicted."""
        idle = [
            s for s in self._sessions.values()
            if s.state == SessionState.READY
            and s.session_id.startswith(f"{self._prefix}-r-")  # only evict dynamic sessions
        ]
        if not idle:
            return False
        oldest = min(idle, key=lambda s: s.stats.last_activity or s.stats.started_at or s.stats.last_activity)
        client_log(f"[pool] Evicting idle session {oldest.session_id} (claude: {oldest.claude_session_id})")
        await oldest.stop()
        # Remove from pool but remember the mapping
        self._sessions.pop(oldest.session_id, None)
        return True

    async def _spawn_session(self, command: str, resume_session_id: str | None = None) -> AgentCmdSession:
        """Spawn a new on-demand session (for a non-default engine or resume)."""
        if len(self._sessions) >= self._max_sessions:
            if not await self._evict_oldest_idle():
                raise RuntimeError("Max sessions reached and no idle sessions to evict")

        cmd_name = command.split("/")[-1].split("\\")[-1]
        self._next_dynamic_id += 1
        if resume_session_id:
            pool_key = f"{cmd_name}-r-{resume_session_id[:8]}"
        else:
            pool_key = f"{cmd_name}-{self._next_dynamic_id}"
        if pool_key in self._sessions:
            pool_key = f"{pool_key}-{self._next_dynamic_id}"

        session = AgentCmdSession(
            session_id=pool_key,
            extra_args=self._extra_args,
            command=command,
            system_prompt=self._system_prompt,
            mcp_config_path=self._mcp_config_path,
            resume_session_id=resume_session_id,
        )
        self._sessions[pool_key] = session

        client_log(f"[pool] Spawning {pool_key} ({command})")
        if not await session.start():
            err = session.last_error or "unknown error"
            self._sessions.pop(pool_key, None)
            raise RuntimeError(f"Failed to start session {pool_key}: {err}")

        if resume_session_id:
            self._session_id_index[resume_session_id] = pool_key

        return session

    async def _get_or_create_for_session_id(
        self, claude_session_id: str, command: str | None = None,
    ) -> AgentCmdSession:
        """Find the session with this conversation, or spawn a new one with --resume."""
        existing = self._find_by_session_id(claude_session_id)
        if existing and existing.state == SessionState.READY:
            return existing
        if existing and existing.state == SessionState.BUSY:
            raise RuntimeError(
                f"Session for conversation {claude_session_id[:8]} is busy"
            )

        return await self._spawn_session(
            command=command or self._command,
            resume_session_id=claude_session_id,
        )

    async def configure(
        self,
        system_prompt: str | None = None,
        mcp_config_path: str | None = None,
        resume_session_id: str | None = None,
    ) -> None:
        """Update pool configuration and restart sessions if anything changed."""
        changed = False

        if system_prompt and system_prompt != self._system_prompt:
            self._system_prompt = system_prompt
            changed = True
        if mcp_config_path and mcp_config_path != self._mcp_config_path:
            self._mcp_config_path = mcp_config_path
            changed = True
        if resume_session_id is not None and resume_session_id != self._resume_session_id:
            self._resume_session_id = resume_session_id or None
            changed = True

        if not changed:
            return

        # Propagate config to sessions — restart idle ones now, defer busy ones
        for session in self._sessions.values():
            session._system_prompt = self._system_prompt
            session._mcp_config_path = self._mcp_config_path
            if session.is_alive:
                if session.state == SessionState.BUSY:
                    session._pending_restart = True
                    client_log(f"[{session.session_id}] Config updated, will restart when idle")
                else:
                    client_log(f"[{session.session_id}] Restarting with updated config")
                    await session.restart()
                    self._update_index(session)

    async def start(self) -> int:
        """Start all sessions in the pool. Returns number of successfully started sessions."""
        started = 0
        for i in range(self._pool_size):
            session_id = f"{self._prefix}-{i}" if self._pool_size > 1 else self._prefix
            session = AgentCmdSession(
                session_id=session_id,
                extra_args=self._extra_args,
                command=self._command,
                system_prompt=self._system_prompt,
                mcp_config_path=self._mcp_config_path,
                resume_session_id=self._resume_session_id,
            )
            self._sessions[session_id] = session

            if await session.start():
                started += 1
                self._update_index(session)
            else:
                client_log(f"Failed to start session {session_id}", error=True)

        # Start health monitor
        if self._auto_restart:
            self._health_task = asyncio.create_task(self._health_monitor())

        client_log(f"Pool started: {started}/{self._pool_size} sessions ready")
        return started

    async def stop(self) -> None:
        """Stop all sessions and the health monitor."""
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass

        for session in self._sessions.values():
            await session.stop()

        client_log("Pool stopped")

    async def send_message(
        self,
        message: str,
        timeout: int = 120,
        images: list[dict] | None = None,
        on_progress: "Callable[[str, str], None] | None" = None,
        claude_session_id: str | None = None,
        engine: str | None = None,
    ) -> tuple[str, str]:
        """
        Route a message to a session.

        If claude_session_id is provided, routes to the matching session
        (or spawns one with --resume). Otherwise picks any available session.
        Engine overrides which command to use (e.g. "codex" instead of default "claude").
        Returns (session_id, response).
        """
        command = engine or self._command
        if claude_session_id:
            session = await self._get_or_create_for_session_id(claude_session_id, command=command)
        else:
            # Match engine: prefer a session running the right command
            session = self.get_available(command=command)
            if not session and command != self._command:
                # No session for this engine yet — spawn one
                session = await self._spawn_session(command=command)

        if not session:
            raise RuntimeError(
                f"No available sessions (total: {len(self._sessions)}, "
                f"ready: {self.ready_count}, busy: {self.busy_count})"
            )

        try:
            response = await session.send_message(message, timeout=timeout, images=images, on_progress=on_progress)
            # Update index after first message (session now has its claude_session_id)
            self._update_index(session)
            return session.session_id, response
        except Exception:
            # Ensure session is not stuck in BUSY after an unexpected error
            if session.state == SessionState.BUSY:
                session.state = SessionState.READY
            raise

    async def _health_monitor(self) -> None:
        """Periodically check session health and restart dead sessions."""
        try:
            while True:
                await asyncio.sleep(15)

                for session in list(self._sessions.values()):
                    if session.state in (SessionState.ERRORED, SessionState.STOPPED):
                        if not session.is_alive:
                            client_log(f"[health] Restarting {session.session_id}...")
                            await session.restart()
                            self._update_index(session)
                    elif session.state in (SessionState.READY, SessionState.BUSY) and not session.is_alive:
                        client_log(f"[health] {session.session_id} died (was {session.state.value}), restarting...")
                        await session.restart()
                        self._update_index(session)

                # Evict idle dynamic sessions past timeout
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                for session in list(self._sessions.values()):
                    if (
                        session.session_id.startswith("claude-r-")
                        and session.state == SessionState.READY
                        and session.stats.last_activity
                    ):
                        idle_secs = (now - session.stats.last_activity).total_seconds()
                        if idle_secs > IDLE_EVICT_SECONDS:
                            client_log(f"[health] Evicting idle session {session.session_id} ({idle_secs:.0f}s idle)")
                            await session.stop()
                            self._sessions.pop(session.session_id, None)

        except asyncio.CancelledError:
            return

    def status(self) -> dict:
        """Pool status summary."""
        return {
            "pool_size": self._pool_size,
            "total": len(self._sessions),
            "ready": self.ready_count,
            "busy": self.busy_count,
            "sessions": [s.to_dict() for s in self._sessions.values()],
        }
