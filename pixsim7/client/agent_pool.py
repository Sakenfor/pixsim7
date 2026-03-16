"""
Agent pool — manages multiple Claude sessions.

Handles session lifecycle, health monitoring, and task routing.
Currently Claude-only but designed to support other agent types.
"""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from pixsim7.client.claude_session import ClaudeSession, SessionState
from pixsim7.client.log import client_log


class AgentPool:
    """Manages a pool of Claude sessions with automatic health recovery."""

    def __init__(
        self,
        pool_size: int = 1,
        claude_args: list[str] | None = None,
        claude_command: str = "claude",
        auto_restart: bool = True,
    ):
        self._pool_size = pool_size
        self._claude_args = claude_args or []
        self._claude_command = claude_command
        self._auto_restart = auto_restart
        self._system_prompt: Optional[str] = None
        self._mcp_config_path: Optional[str] = None
        self._resume_session_id: Optional[str] = None
        self._sessions: Dict[str, ClaudeSession] = {}
        self._health_task: Optional[asyncio.Task] = None

    @property
    def sessions(self) -> List[ClaudeSession]:
        return list(self._sessions.values())

    @property
    def ready_count(self) -> int:
        return sum(1 for s in self._sessions.values() if s.state == SessionState.READY)

    @property
    def busy_count(self) -> int:
        return sum(1 for s in self._sessions.values() if s.state == SessionState.BUSY)

    def get_available(self) -> Optional[ClaudeSession]:
        """Get a ready session for task dispatch."""
        for session in self._sessions.values():
            if session.state == SessionState.READY:
                return session
        return None

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

        # Propagate to existing sessions and restart
        for session in self._sessions.values():
            session._system_prompt = self._system_prompt
            session._mcp_config_path = self._mcp_config_path
            session._resume_session_id = self._resume_session_id
            if session.is_alive:
                client_log(f"[{session.session_id}] Restarting with updated config")
                await session.restart()

    async def start(self) -> int:
        """Start all sessions in the pool. Returns number of successfully started sessions."""
        started = 0
        for i in range(self._pool_size):
            session_id = f"claude-{i}" if self._pool_size > 1 else "claude"
            session = ClaudeSession(
                session_id=session_id,
                extra_args=self._claude_args,
                claude_command=self._claude_command,
                system_prompt=self._system_prompt,
                mcp_config_path=self._mcp_config_path,
                resume_session_id=self._resume_session_id,
            )
            self._sessions[session_id] = session

            if await session.start():
                started += 1
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

    async def send_message(self, message: str, timeout: int = 120) -> tuple[str, str]:
        """
        Route a message to an available session.
        Returns (session_id, response).
        """
        session = self.get_available()
        if not session:
            raise RuntimeError(
                f"No available sessions (total: {len(self._sessions)}, "
                f"ready: {self.ready_count}, busy: {self.busy_count})"
            )

        response = await session.send_message(message, timeout=timeout)
        return session.session_id, response

    async def _health_monitor(self) -> None:
        """Periodically check session health and restart dead sessions."""
        try:
            while True:
                await asyncio.sleep(15)

                for session in self._sessions.values():
                    if session.state in (SessionState.ERRORED, SessionState.STOPPED):
                        if not session.is_alive:
                            client_log(f"[health] Restarting {session.session_id}...")
                            await session.restart()
                    elif session.state == SessionState.READY and not session.is_alive:
                        client_log(f"[health] {session.session_id} died, restarting...")
                        await session.restart()
        except asyncio.CancelledError:
            return

    def status(self) -> dict:
        """Pool status summary."""
        return {
            "pool_size": self._pool_size,
            "ready": self.ready_count,
            "busy": self.busy_count,
            "sessions": [s.to_dict() for s in self._sessions.values()],
        }
