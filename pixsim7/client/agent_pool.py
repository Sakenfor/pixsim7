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
import json
import os
import shutil
import tempfile
from typing import Callable, Dict, List, Optional

from pixsim7.client.session import AgentCmdSession, SessionState
from pixsim7.client.log import get_logger

MAX_SESSIONS = 10
IDLE_EVICT_SECONDS = 30 * 60  # 30 minutes


def _lookup_cli_session_id(bridge_session_id: str) -> str | None:
    """Query the backend for the CLI conversation UUID mapped to a session ID.

    Used when _cli_id_map misses after a bridge restart — the mapping
    may have been persisted to the ChatSession.cli_session_id field.
    """
    import urllib.error
    import urllib.request

    token = ""
    try:
        from pathlib import Path
        stored = Path.home() / ".pixsim" / "token"
        token = stored.read_text().strip()
    except (OSError, FileNotFoundError):
        pass

    try:
        url = f"http://localhost:8000/api/v1/meta/agents/chat-sessions/{bridge_session_id}"
        headers: dict[str, str] = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            cli_id = data.get("cli_session_id")
            if cli_id and isinstance(cli_id, str) and cli_id.strip():
                return cli_id.strip()
    except Exception:
        pass
    return None

# Known agent engines — auto-detected on startup
KNOWN_ENGINES = ["claude", "codex"]


def detect_engines() -> list[str]:
    """Return list of known engines that are installed and available."""
    return [e for e in KNOWN_ENGINES if shutil.which(e)]


class AgentPool:
    """Manages a pool of agent command sessions with automatic health recovery."""

    def __init__(
        self,
        pool_size: int = 1,
        extra_args: list[str] | None = None,
        command: str = "claude",
        engines: list[str] | None = None,
        auto_restart: bool = True,
        max_sessions: int = MAX_SESSIONS,
    ):
        self._pool_size = pool_size
        self._extra_args = extra_args or []
        # Engines to start: explicit list, or auto-detect, falling back to command
        self._engines = engines or detect_engines() or [command]
        self._command = command  # backward compat: default engine for unspecified tasks
        self._prefix = command.split("/")[-1].split("\\")[-1]  # e.g. "claude", "codex"
        self._auto_restart = auto_restart
        self._max_sessions = max_sessions
        self._system_prompt: Optional[str] = None
        self._mcp_config_path: Optional[str] = None
        self._resume_session_id: Optional[str] = None
        self._sessions: Dict[str, AgentCmdSession] = {}
        self._health_task: Optional[asyncio.Task] = None
        # Index: bridge_session_id -> pool session key (for affinity routing)
        self._session_id_index: Dict[str, str] = {}
        # Index: scope_key -> pool session key (for scoped routing)
        self._scope_key_index: Dict[str, str] = {}
        # Persistent mapping: bridge_session_id -> CLI conversation UUID
        # Survives session eviction so resume uses the correct ID
        self._cli_id_map: Dict[str, str] = {}
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

    def _find_by_session_id(self, bridge_session_id: str) -> Optional[AgentCmdSession]:
        """Find a session by its bridge conversation UUID."""
        # Fast path: index
        pool_key = self._session_id_index.get(bridge_session_id)
        if pool_key and pool_key in self._sessions:
            return self._sessions[pool_key]
        # Slow path: scan (index may be stale)
        for session in self._sessions.values():
            if session.cli_session_id == bridge_session_id:
                self._session_id_index[bridge_session_id] = session.session_id
                return session
        return None

    def _find_by_scope_key(self, scope_key: str) -> Optional[AgentCmdSession]:
        """Find a session bound to a scoped task key."""
        pool_key = self._scope_key_index.get(scope_key)
        if pool_key and pool_key in self._sessions:
            return self._sessions[pool_key]
        if pool_key:
            self._scope_key_index.pop(scope_key, None)
        return None

    def _drop_indexes_for_session(self, session_id: str) -> None:
        """Remove stale session and scope indexes for a removed session."""
        for key, value in list(self._session_id_index.items()):
            if value == session_id:
                self._session_id_index.pop(key, None)
        for key, value in list(self._scope_key_index.items()):
            if value == session_id:
                self._scope_key_index.pop(key, None)

    def _update_index(self, session: AgentCmdSession) -> None:
        """Update the bridge_session_id -> pool key index and CLI ID map."""
        if session.cli_session_id:
            self._session_id_index[session.cli_session_id] = session.session_id
            # Persist the mapping from our session ID to the CLI's conversation UUID
            # so we can --resume correctly even after eviction
            if session.cli_session_id and session.cli_session_id != session.cli_session_id:
                self._cli_id_map[session.cli_session_id] = session.cli_session_id

    async def _evict_oldest_idle(self) -> bool:
        """Stop the oldest idle on-demand session to make room. Returns True if one was evicted."""
        idle = [
            s for s in self._sessions.values()
            if s.state == SessionState.READY
            and "-r-" in s.session_id  # only evict dynamic (resume) sessions, not initial ones
        ]
        if not idle:
            return False
        oldest = min(idle, key=lambda s: s.stats.last_activity or s.stats.started_at or s.stats.last_activity)
        get_logger().debug("pool_evict", session=oldest.session_id, cli_session=oldest.cli_session_id)
        await oldest.stop()
        self._cleanup_session_files(oldest)
        # Remove from pool and clear stale indexes.
        self._sessions.pop(oldest.session_id, None)
        self._drop_indexes_for_session(oldest.session_id)
        return True

    @staticmethod
    def _cleanup_session_files(session: AgentCmdSession) -> None:
        """Remove per-session temp files (token file + MCP config)."""
        for path in (session.token_file_path, session._mcp_config_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass

    def _create_session_mcp_config(self, pool_key: str, base_config_path: str | None = None) -> tuple[str | None, str | None]:
        """Create a per-session token file + MCP config.

        Clones the base MCP config and overrides PIXSIM_TOKEN_FILE to point
        to a session-specific token file. Seeds the file from the base config's
        token file (service token) so MCP tools work immediately.
        Returns (token_file_path, mcp_config_path).
        If no base config exists, returns (None, None).
        """
        from pixsim7.client.token_manager import TokenFile, clone_token_for_session, clone_mcp_config_for_session

        base = base_config_path or self._mcp_config_path
        if not base or not os.path.exists(base):
            return None, None

        # Seed per-session token file from base config's token file
        seed_source = ""
        try:
            with open(base) as f:
                config = json.load(f)
            for server in config.get("mcpServers", {}).values():
                env = server.get("env", {})
                seed_source = env.get("PIXSIM_TOKEN_FILE", "") or env.get("PIXSIM_API_TOKEN", "")
                if seed_source:
                    break
        except (json.JSONDecodeError, OSError):
            return None, None

        session_tf = clone_token_for_session(seed_source, session_id=pool_key)
        cloned_config = clone_mcp_config_for_session(base, session_tf)
        if not cloned_config:
            session_tf.cleanup()
            return None, None

        return session_tf.path, cloned_config

    async def _spawn_session(
        self,
        command: str,
        resume_session_id: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        mcp_config_path: str | None = None,
        workdir: str | None = None,
    ) -> AgentCmdSession:
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

        # Per-session token file + MCP config (isolates concurrent sessions)
        token_file, session_mcp_config = self._create_session_mcp_config(
            pool_key, base_config_path=mcp_config_path,
        )

        session = AgentCmdSession(
            session_id=pool_key,
            extra_args=self._extra_args,
            command=command,
            system_prompt=self._system_prompt,
            mcp_config_path=session_mcp_config or mcp_config_path or self._mcp_config_path,
            resume_session_id=resume_session_id,
            model=model,
            reasoning_effort=reasoning_effort,
            workdir=workdir,
            token_file_path=token_file,
        )
        self._sessions[pool_key] = session

        get_logger().debug("pool_spawn", session=pool_key, command=command)
        if not await session.start():
            err = session.last_error or "unknown error"
            self._sessions.pop(pool_key, None)
            raise RuntimeError(f"Failed to start session {pool_key}: {err}")

        if resume_session_id:
            self._session_id_index[resume_session_id] = pool_key

        return session

    async def _get_or_create_for_session_id(
        self, bridge_session_id: str, command: str | None = None,
    ) -> AgentCmdSession:
        """Find the session with this conversation, or spawn a new one with --resume."""
        existing = self._find_by_session_id(bridge_session_id)
        if existing:
            if existing.state == SessionState.BUSY:
                raise RuntimeError(
                    f"Session for conversation {bridge_session_id[:8]} is busy"
                )
            if existing.state == SessionState.READY and existing.is_alive:
                return existing
            # Dead or errored — restart in-place (preserves cli_session_id for proper resume)
            if not existing.is_alive:
                get_logger().info("pool_session_restart", session=existing.session_id, reason="died")
                if await existing.restart():
                    self._update_index(existing)
                    return existing
                # Restart failed — remove and spawn fresh
                self._sessions.pop(existing.session_id, None)
                self._drop_indexes_for_session(existing.session_id)

        # Use the CLI's actual conversation UUID for --resume (not our derived hash)
        resume_id = self._cli_id_map.get(bridge_session_id)
        if resume_id:
            get_logger().debug("pool_session_mapped", bridge=bridge_session_id[:8], cli=resume_id[:8])
        elif bridge_session_id.startswith("mcp-") or bridge_session_id.startswith("auto-"):
            # Derived session ID — Claude won't recognize it.
            # Try backend lookup for persisted cli_session_id mapping.
            resume_id = _lookup_cli_session_id(bridge_session_id)
            if resume_id:
                get_logger().debug("pool_session_lookup", bridge=bridge_session_id[:12], cli=resume_id[:8])
                self._cli_id_map[bridge_session_id] = resume_id
            else:
                get_logger().debug("pool_no_mapping", bridge=bridge_session_id[:12])
        else:
            # Looks like a real UUID — try resume directly
            resume_id = bridge_session_id

        return await self._spawn_session(
            command=command or self._command,
            resume_session_id=resume_id,
        )

    async def _get_or_create_for_scope_key(
        self,
        scope_key: str,
        *,
        command: str,
        model: str | None = None,
        reasoning_effort: str | None = None,
        mcp_config_path: str | None = None,
        workdir: str | None = None,
    ) -> AgentCmdSession:
        """Find or create a scoped session bound to ``scope_key``."""
        existing = self._find_by_scope_key(scope_key)
        if existing and existing.state == SessionState.READY and existing._command == command:
            return existing
        if existing and existing.state == SessionState.BUSY:
            raise RuntimeError(f"Scoped session '{scope_key}' is busy")

        session = await self._spawn_session(
            command=command,
            model=model,
            reasoning_effort=reasoning_effort,
            mcp_config_path=mcp_config_path,
            workdir=workdir,
        )
        self._scope_key_index[scope_key] = session.session_id
        return session

    async def _ensure_session_workdir(
        self,
        session: AgentCmdSession,
        *,
        workdir: str | None,
    ) -> None:
        """Apply a workdir override to an existing ready session."""
        if not workdir or session._workdir == workdir:
            return
        if session.state == SessionState.BUSY:
            raise RuntimeError(f"Session {session.session_id} is busy")
        session._workdir = workdir
        if session.is_alive:
            get_logger().debug("pool_workdir_update", session=session.session_id)
            await session.restart()
            self._update_index(session)

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
                    get_logger().debug("pool_config_pending", session=session.session_id)
                else:
                    get_logger().debug("pool_config_restart", session=session.session_id)
                    await session.restart()
                    self._update_index(session)

    async def start(self) -> int:
        """Start the pool (no sessions — they're created on demand).

        Returns number of available engines detected.
        """
        # Start health monitor
        if self._auto_restart:
            self._health_task = asyncio.create_task(self._health_monitor())

        engines_str = ", ".join(e.split("/")[-1].split("\\")[-1] for e in self._engines)
        get_logger().info("pool_ready", engines=engines_str)
        return len(self._engines)

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

        get_logger().info("pool_stopped")

    async def send_message(
        self,
        message: str,
        timeout: int = 120,
        images: list[dict] | None = None,
        on_progress: "Callable[[str, str], None] | None" = None,
        bridge_session_id: str | None = None,
        engine: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        session_policy: str | None = None,
        scope_key: str | None = None,
        mcp_config_path: str | None = None,
        workdir: str | None = None,
        user_token: str | None = None,
    ) -> tuple[str, str]:
        """
        Route a message to a session.

        If bridge_session_id is provided, routes to the matching session
        (or spawns one with --resume). Otherwise picks any available session.
        Engine overrides which command to use (e.g. "codex" instead of default "claude").
        Model overrides the default model for new sessions.
        mcp_config_path overrides the pool-wide MCP config for newly spawned sessions.
        workdir overrides subprocess cwd for session start (used for project-local Codex config layers).
        Returns (session_id, response).
        """
        command = engine or self._command
        policy = (session_policy or "").strip().lower()
        if policy not in {"ephemeral", "scoped", "persistent"}:
            policy = "persistent"
        scope = (scope_key or "").strip()
        ephemeral = False

        if bridge_session_id:
            session = await self._get_or_create_for_session_id(bridge_session_id, command=command)
            await self._ensure_session_workdir(session, workdir=workdir)
        elif policy == "ephemeral":
            session = await self._spawn_session(
                command=command,
                model=model,
                reasoning_effort=reasoning_effort,
                mcp_config_path=mcp_config_path,
                workdir=workdir,
            )
            ephemeral = True
        elif policy == "scoped" and scope:
            session = await self._get_or_create_for_scope_key(
                scope,
                command=command,
                model=model,
                reasoning_effort=reasoning_effort,
                mcp_config_path=mcp_config_path,
                workdir=workdir,
            )
            await self._ensure_session_workdir(session, workdir=workdir)
        else:
            # When a specific model or reasoning effort is requested, spawn a dedicated session
            if model or reasoning_effort:
                session = await self._spawn_session(
                    command=command,
                    model=model,
                    reasoning_effort=reasoning_effort,
                    mcp_config_path=mcp_config_path,
                    workdir=workdir,
                )
            else:
                # Match engine: prefer an existing ready session, otherwise spawn one
                session = self.get_available(command=command)
                if not session:
                    session = await self._spawn_session(command=command, workdir=workdir)
                else:
                    await self._ensure_session_workdir(session, workdir=workdir)

        try:
            # Pre-flight: ensure session process is alive (may have died since routing)
            if not session.is_alive and not ephemeral:
                get_logger().debug("pool_preflight_restart", session=session.session_id)
                if not await session.restart():
                    raise RuntimeError(f"Session {session.session_id} failed to restart")
                self._update_index(session)

            # Write per-request token to this session's token file (isolated from other sessions)
            if user_token and session.token_file_path:
                try:
                    with open(session.token_file_path, "w") as f:
                        f.write(user_token)
                except OSError:
                    pass
            response = await session.send_message(message, timeout=timeout, images=images, on_progress=on_progress)
            # Update index after first message (session now has its bridge_session_id)
            self._update_index(session)
            return session.session_id, response
        except Exception:
            # Ensure session is not stuck in BUSY after an unexpected error
            if session.state == SessionState.BUSY:
                session.state = SessionState.READY
            raise
        finally:
            if ephemeral:
                try:
                    await session.stop()
                finally:
                    self._sessions.pop(session.session_id, None)
                    self._drop_indexes_for_session(session.session_id)

    async def _health_monitor(self) -> None:
        """Periodically check session health and restart dead sessions."""
        try:
            while True:
                await asyncio.sleep(15)

                for session in list(self._sessions.values()):
                    if session.state in (SessionState.ERRORED, SessionState.STOPPED):
                        if not session.is_alive:
                            get_logger().debug("pool_health_restart", session=session.session_id)
                            await session.restart()
                            self._update_index(session)
                    elif session.state == SessionState.BUSY and not session.is_alive:
                        # Died mid-task — restart immediately
                        get_logger().info("pool_session_died", session=session.session_id)
                        await session.restart()
                        self._update_index(session)
                    elif session.state == SessionState.READY and not session.is_alive:
                        # Exited while idle — don't restart, just mark stopped.
                        # It will be restarted on-demand when the next message arrives.
                        get_logger().debug("pool_session_exited", session=session.session_id)
                        session.state = SessionState.STOPPED

                # Evict idle dynamic sessions past timeout
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                for session in list(self._sessions.values()):
                    if (
                        "-r-" in session.session_id  # dynamic (resume) sessions only
                        and session.state == SessionState.READY
                        and session.stats.last_activity
                    ):
                        idle_secs = (now - session.stats.last_activity).total_seconds()
                        if idle_secs > IDLE_EVICT_SECONDS:
                            get_logger().debug("pool_idle_evict", session=session.session_id, idle_secs=int(idle_secs))
                            await session.stop()
                            self._cleanup_session_files(session)
                            self._sessions.pop(session.session_id, None)
                            self._drop_indexes_for_session(session.session_id)

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
