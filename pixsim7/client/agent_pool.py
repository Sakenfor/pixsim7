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
from typing import Awaitable, Callable, Dict, List, Optional

from pixsim7.client.session import AgentCmdSession, MCPConfigRegenerator, SessionState
from pixsim7.client.log import get_logger

MAX_SESSIONS = 10
IDLE_EVICT_SECONDS = 30 * 60  # 30 minutes
# A session BUSY while still alive but with no activity for this long is
# treated as stuck (a prior turn that never settled back to READY — Claude
# still streaming after an apparent "done", a hung tool call, or a cancel
# that never landed). Without recovery, every subsequent message to that
# conversation gets a false `conversation_session_busy`. Generous bound so
# legitimately long single turns are never killed mid-flight.
STUCK_BUSY_SECONDS = 10 * 60  # 10 minutes


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

# Maximum wall-clock seconds to wait for a `<engine> --version` probe before
# treating the engine as broken. The probe is intentionally short — long
# enough to absorb cold-start (npm shim, JIT, AV scan on Windows) but short
# enough that a stuck binary doesn't gate the whole bridge from coming up.
ENGINE_PROBE_TIMEOUT_S = 8.0


def detect_engines() -> list[str]:
    """Return list of known engines that are installed and available."""
    return [e for e in KNOWN_ENGINES if shutil.which(e)]


async def probe_engine(command: str, *, timeout: float = ENGINE_PROBE_TIMEOUT_S) -> tuple[bool, str]:
    """Run `<command> --version` as a liveness check on the engine binary.

    `shutil.which` only proves the file is on PATH; it doesn't catch:
      - npm shim that points at a missing native binary,
      - corrupted install where the binary segfaults on launch,
      - permission/quarantine/AV blocks that silently kill the process,
      - PATH-shadowed wrapper that prints help and exits non-zero.

    A 1-shot `--version` call exercises the actual launch path and is
    universally cheap (claude / codex both support it auth-free).

    Returns ``(ok, detail)`` where ``detail`` is the version string on
    success or a short error reason on failure (logged for diagnosis,
    not surfaced to the user).
    """
    # Resolve to the concrete executable path first so the startup probe uses
    # the same launch target as AgentCmdSession.start(). On Windows this avoids
    # bare-name ambiguity when multiple Codex shims/exes are present on PATH.
    resolved_command = shutil.which(command) or command

    try:
        proc = await asyncio.create_subprocess_exec(
            resolved_command, "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return False, "binary_not_found"
    except OSError as e:
        return False, f"spawn_failed:{e.__class__.__name__}"

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        return False, f"timeout_{timeout}s"

    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode("utf-8", errors="replace").strip()
        return False, f"exit_{proc.returncode}:{err[:120]}"
    out = (stdout or b"").decode("utf-8", errors="replace").strip().splitlines()
    return True, out[0] if out else "ok"


class SessionBusyError(RuntimeError):
    """Raised when a request targets a session/scope that is already busy."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str,
        error_details: Optional[dict] = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.error_details = error_details or {}


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
        # Optional callback the bridge wires up to regenerate the pool's base
        # MCP config (e.g. when Windows sweeps the temp file out from under us).
        # See plan: mcp-server-reliability — robust-fix-regenerate-on-missing.
        self._base_mcp_config_regenerator: Optional[MCPConfigRegenerator] = None
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
        # Per-session count of `send_message` calls actively awaiting a turn.
        # The stuck-busy watchdog (`_maybe_recover_stuck_busy`) keys off this:
        # while a turn is in-flight, `send_message` owns the session's lifecycle
        # (it pulses keepalives and enforces the turn timeout), so the watchdog
        # must NOT restart it. The watchdog only recovers a BUSY session that is
        # NOT in-flight — a genuinely orphaned turn that outlived its awaiter.
        # A counter (not a bool) so it's robust to any overlap; cleared in the
        # `send_message` finally.
        self._inflight_turns: Dict[str, int] = {}

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
        """Update the bridge_session_id -> pool key index and CLI ID map.

        ``handle`` is the panel-facing conversation id. For follow-up/resumed
        turns the bridge stamps ``session.bridge_session_id`` explicitly; for a
        brand-new conversation it's not known until Claude's init event, so we
        fall back to ``cli_session_id`` (which the bridge then adopts as the
        handle anyway). Keying by ``cli_session_id`` *unconditionally* — the
        2026-03-31 ``claude_session`` find/replace regression — broke
        conversation→subprocess affinity and left ``_cli_id_map`` permanently
        empty (the guard had degenerated to ``x != x``).
        """
        handle = session.bridge_session_id or session.cli_session_id
        if handle:
            self._session_id_index[handle] = session.session_id
            # Persist the mapping from the panel handle to the CLI's
            # conversation UUID so we can --resume correctly even after eviction
            if session.cli_session_id and session.cli_session_id != handle:
                self._cli_id_map[handle] = session.cli_session_id

    async def _evict_oldest_idle(self) -> bool:
        """Stop the oldest idle on-demand session to make room. Returns True if one was evicted.

        Every READY session is evictable. An earlier version filtered for
        ``"-r-" in session_id`` ("dynamic resume sessions only"), guarding
        against eviction of a pre-warmed start-time pool — but ``start()``
        no longer creates sessions; the pool is fully on-demand. With that
        filter, model-pinned / scoped sessions (keys like ``codex-1``,
        ``claude-2`` — no ``-r-``) accumulated until ``MAX_SESSIONS`` was
        hit, then every subsequent spawn raised "Max sessions reached and
        no idle sessions to evict". Probing 10 (model, effort) variants in
        a 30 min window was enough to brick the pool.

        Cost of dropping the filter: one user tab whose session was the
        oldest idle pays a cold-spawn (~3-5s with thread/resume) on its
        next message. That's the definition of eviction — acceptable.

        TODO(deferred): replace pure-LRU with an LRU keyed on
        ``(engine, model, reasoning_effort)`` so consecutive uses of the
        same param tuple reuse the existing session before considering
        eviction. Not urgent — the current "oldest idle wins" behaviour
        is fine until telemetry shows churn (same params → repeated cold
        respawn). Revisit if users start reporting "switching back to a
        model I just used feels slow".
        """
        idle = [s for s in self._sessions.values() if s.state == SessionState.READY]
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

    def _cleanup_session_files(self, session: AgentCmdSession) -> None:
        """Remove files genuinely private to this session.

        The per-session token file (``clone_token_for_session``) is always a
        fresh temp file and is safe to unlink unconditionally.

        ``session._mcp_config_path`` is NOT always private. In HTTP mode there
        is no per-session clone (identity rides in headers), so every session
        points at the SHARED base config — ``~/.pixsim/mcp/default.json`` (or a
        cached focused config). Deleting that on evict/idle-evict yanks MCP out
        from under every other live session and the bridge's cache, forcing a
        regenerate storm. Only unlink an MCP config that is not the current
        base and not any path the bridge still has cached.
        Plan: mcp-server-reliability / cleanup-must-not-delete-shared-base.
        """
        if session.token_file_path:
            try:
                os.unlink(session.token_file_path)
            except OSError:
                pass

        # Only the private per-session clone is ours to delete. HTTP-mode
        # sessions carry the shared base in _mcp_config_path (and configure()/
        # the regenerator may reassign it to the base too) — never unlink that.
        owned = session._owned_mcp_config_path
        if owned:
            try:
                os.unlink(owned)
            except OSError:
                pass

    def set_base_mcp_config_regenerator(
        self, regenerator: MCPConfigRegenerator | None,
    ) -> None:
        """Wire a bridge-provided callback that returns a fresh base MCP config
        path. The pool calls this when its cached base config has been swept
        (Windows %TEMP% cleanup, etc.). See plan: mcp-server-reliability.
        """
        self._base_mcp_config_regenerator = regenerator

    def _make_session_mcp_regenerator(
        self, pool_key: str,
    ) -> MCPConfigRegenerator:
        """Build a closure that regenerates this pool_key's per-session MCP
        config. Tries `_create_session_mcp_config` first; if the pool's base
        config is also missing, asks the bridge via the base regenerator and
        retries the clone. Returns None on unrecoverable failure (Session
        treats None as fail-loud).
        """
        def _regenerate() -> Optional[str]:
            # Step 1: ensure pool's base config exists; regenerate via bridge if not.
            base = self._mcp_config_path
            if not base or not os.path.exists(base):
                if self._base_mcp_config_regenerator is None:
                    get_logger().error(
                        "mcp_base_config_missing_no_regenerator",
                        pool_key=pool_key,
                        cached_base=base,
                    )
                    return None
                try:
                    fresh_base = self._base_mcp_config_regenerator()
                except Exception as exc:
                    get_logger().error(
                        "mcp_base_config_regeneration_failed",
                        pool_key=pool_key,
                        error=str(exc),
                        error_type=type(exc).__name__,
                    )
                    return None
                if not fresh_base or not os.path.exists(fresh_base):
                    get_logger().error(
                        "mcp_base_config_regeneration_unrecoverable",
                        pool_key=pool_key,
                        returned=fresh_base,
                    )
                    return None
                self._mcp_config_path = fresh_base
            # Step 2: re-clone per-session config from the (now-fresh) base.
            # (Ownership-refresh of the session's owned clone on STDIO regen
            # is tracked under plan checkpoint consolidate-mcp-config-resolution.)
            _, new_path, _ = self._create_session_mcp_config(pool_key)
            if not new_path:
                get_logger().error(
                    "mcp_session_clone_failed",
                    pool_key=pool_key,
                    base=self._mcp_config_path,
                )
            return new_path
        return _regenerate

    def _create_session_mcp_config(
        self, pool_key: str, base_config_path: str | None = None,
    ) -> tuple[str | None, str | None, bool]:
        """Resolve the MCP config path the session should use, plus an
        optional per-session token file and whether the config is a private
        per-session clone this pool created (and therefore owns the lifecycle
        of — see ``_cleanup_session_files``).

        Returns ``(token_file_path, mcp_config_path, owns_private_clone)``:
          - STDIO base: clones the base config, overrides ``PIXSIM_TOKEN_FILE``
            with a fresh per-session token file seeded from the base's service
            token. Returns ``(session_tf.path, cloned_config_path, True)``.
          - HTTP-only base: identity rides in headers, so no per-session
            clone is needed and no per-session token file is created. Returns
            ``(None, base, False)`` — caller uses the SHARED base directly and
            must NOT delete it on session teardown.
          - Failure (base missing/unreadable, clone write failed): returns
            ``(None, None, False)``.

        The HTTP fall-through mirrors the contract documented on
        ``clone_mcp_config_for_session`` in ``token_manager.py``.
        """
        from pixsim7.client.token_manager import (
            TokenFile,
            clone_token_for_session,
            clone_mcp_config_for_session,
            is_http_mcp_config,
        )

        base = base_config_path or self._mcp_config_path
        if not base or not os.path.exists(base):
            return None, None, False

        try:
            with open(base) as f:
                config = json.load(f)
        except (json.JSONDecodeError, OSError):
            return None, None, False

        if is_http_mcp_config(config):
            # HTTP-only base: per-session config is the SHARED base itself.
            # Not owned by this session — teardown must not unlink it.
            return None, base, False

        # STDIO: seed the per-session token file from the base's token.
        seed_source = ""
        for server in config.get("mcpServers", {}).values():
            if "url" in server:
                continue  # HTTP server in a mixed config
            env = server.get("env", {})
            seed_source = env.get("PIXSIM_TOKEN_FILE", "") or env.get("PIXSIM_API_TOKEN", "")
            if seed_source:
                break

        session_tf = clone_token_for_session(seed_source, session_id=pool_key)
        cloned_config = clone_mcp_config_for_session(base, session_tf, session_id=pool_key)
        if not cloned_config:
            session_tf.cleanup()
            return None, None, False

        return session_tf.path, cloned_config, True

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

        # Per-session token file + MCP config (isolates concurrent sessions).
        # owns_clone is True only when a private STDIO clone was created — the
        # one file teardown is allowed to delete. HTTP sessions share the base.
        token_file, session_mcp_config, owns_clone = self._create_session_mcp_config(
            pool_key, base_config_path=mcp_config_path,
        )

        session = AgentCmdSession(
            session_id=pool_key,
            extra_args=self._extra_args,
            command=command,
            system_prompt=self._system_prompt,
            mcp_config_path=session_mcp_config or mcp_config_path or self._mcp_config_path,
            mcp_config_regenerator=self._make_session_mcp_regenerator(pool_key),
            resume_session_id=resume_session_id,
            model=model,
            reasoning_effort=reasoning_effort,
            workdir=workdir,
            token_file_path=token_file,
            owned_mcp_config_path=(session_mcp_config if owns_clone else None),
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
        mcp_config_path: str | None = None,
    ) -> AgentCmdSession:
        """Find the session with this conversation, or spawn a new one with --resume.

        ``mcp_config_path`` is passed through to ``_spawn_session`` so callers
        like the bridge's per-session HTTP MCP path (plan
        ``mcp-http-bridge-session-resolution``) can stamp a session-scoped
        config + JWT into a freshly spawned subprocess. Reused existing
        subprocesses keep their original config — Claude reads the MCP config
        once at spawn and won't reload mid-process.
        """
        existing = self._find_by_session_id(bridge_session_id)
        if existing:
            if existing.state == SessionState.BUSY:
                context = existing.busy_description()
                detail = f" ({context})" if context else ""
                raise SessionBusyError(
                    f"Session for conversation {bridge_session_id[:8]} is busy{detail}. "
                    f"The previous request is still running or cancellation is still settling.",
                    error_code="conversation_session_busy",
                    error_details={
                        "conversation_id": bridge_session_id,
                        **existing.busy_context(),
                    },
                )
            if existing.state == SessionState.READY and existing.is_alive:
                return existing
            # Dead or errored — restart in-place (preserves cli_session_id for proper resume)
            if not existing.is_alive:
                # Refresh MCP config if the temp file was cleaned up
                if existing._mcp_config_path and not os.path.exists(existing._mcp_config_path):
                    existing._mcp_config_path = self._mcp_config_path
                get_logger().info("pool_session_restart", session=existing.session_id, reason="died")
                if await existing.restart():
                    self._update_index(existing)
                    return existing
                # Restart failed — remove and spawn fresh
                self._sessions.pop(existing.session_id, None)
                self._drop_indexes_for_session(existing.session_id)

        # Use the CLI's actual conversation UUID for --resume (not our derived hash).
        #
        # Plan `chat-session-durable-resume` CP-B: the in-memory `_cli_id_map`
        # is empty after a bridge restart. The backend persists the mapping in
        # `ChatSession.cli_session_id`, but the DB-backed lookup used to be
        # gated to `mcp-`/`auto-` ids only — a plain chat UUID fell straight
        # through to the blind `resume_id = bridge_session_id` branch with no
        # recovery, so a restart silently started a fresh conversation. Now
        # the lookup runs on every map miss, regardless of id shape.
        resume_id = self._cli_id_map.get(bridge_session_id)
        if resume_id:
            get_logger().debug("pool_session_mapped", bridge=bridge_session_id[:8], cli=resume_id[:8])
        else:
            looked_up = _lookup_cli_session_id(bridge_session_id)
            if looked_up:
                resume_id = looked_up
                self._cli_id_map[bridge_session_id] = looked_up
                get_logger().debug("pool_session_lookup", bridge=bridge_session_id[:12], cli=resume_id[:8])
            elif bridge_session_id.startswith("mcp-") or bridge_session_id.startswith("auto-"):
                # Derived id Claude won't recognize and no persisted mapping —
                # nothing to resume; spawn fresh (resume_id stays None).
                get_logger().debug("pool_no_mapping", bridge=bridge_session_id[:12])
            else:
                # Looks like a real conversation UUID — try resuming it
                # directly (covers the not-yet-persisted same-process case).
                resume_id = bridge_session_id

        return await self._spawn_session(
            command=command or self._command,
            resume_session_id=resume_id,
            mcp_config_path=mcp_config_path,
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
            context = existing.busy_description()
            detail = f" ({context})" if context else ""
            raise SessionBusyError(
                f"Scoped session '{scope_key}' is busy{detail}. "
                f"Another request for this scope is still active or cancellation is still settling.",
                error_code="scoped_session_busy",
                error_details={
                    "scope_key": scope_key,
                    **existing.busy_context(),
                },
            )

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

        Self-tests every configured engine before advertising any of them
        so the backend never sees a bridge claiming an engine whose binary
        won't actually launch (corrupted install, AV quarantine, npm shim
        pointing at a missing native — `shutil.which` says yes, the spawn
        fails). Failed engines are dropped from ``self._engines``; the
        list of failures is exposed via :attr:`failed_engines` so the
        bridge can include it in pool_status for the frontend pill.

        Returns number of engines that survived the probe.
        """
        # Probe every configured engine in parallel. Cap the total wall
        # clock at the per-probe timeout — failures here are common enough
        # (especially for codex on first install) that a serial pipeline
        # would noticeably slow bridge startup.
        results = await asyncio.gather(
            *(probe_engine(cmd) for cmd in self._engines),
            return_exceptions=True,
        )

        survivors: list[str] = []
        failures: list[tuple[str, str]] = []
        for cmd, result in zip(self._engines, results):
            short = cmd.split("/")[-1].split("\\")[-1]
            if isinstance(result, BaseException):
                failures.append((short, f"probe_raised:{result.__class__.__name__}"))
                continue
            ok, detail = result
            if ok:
                survivors.append(cmd)
                get_logger().debug("engine_probe_ok", engine=short, version=detail)
            else:
                failures.append((short, detail))
                get_logger().warning("engine_probe_failed", engine=short, reason=detail)

        self._engines = survivors
        self._failed_engines = failures

        # Start health monitor
        if self._auto_restart:
            self._health_task = asyncio.create_task(self._health_monitor())

        engines_str = ", ".join(e.split("/")[-1].split("\\")[-1] for e in self._engines) or "(none)"
        if failures:
            failed_str = ", ".join(f"{name}({reason.split(':', 1)[0]})" for name, reason in failures)
            get_logger().warning("pool_ready_with_failures", ok=engines_str, failed=failed_str)
        else:
            get_logger().info("pool_ready", engines=engines_str)
        return len(self._engines)

    @property
    def failed_engines(self) -> list[tuple[str, str]]:
        """Engines that failed the start-up probe, as (short_name, reason).

        Empty until :meth:`start` runs. Surfaced in pool_status so the
        backend / frontend can show "codex install is broken" without
        waiting for a real dispatch to fail.
        """
        return list(getattr(self, "_failed_engines", []))

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
        tool_gate: "Callable[[str, dict], Awaitable[bool]] | None" = None,
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
            session = await self._get_or_create_for_session_id(
                bridge_session_id, command=command, mcp_config_path=mcp_config_path,
            )
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

        # Bind the panel-facing conversation handle so _update_index (called
        # below and after the turn) keys affinity routing by the id the panel
        # actually dispatches with — not Claude's internal resume UUID.
        if bridge_session_id:
            session.bridge_session_id = bridge_session_id

        # Mark this session as having an actively-awaited turn so the stuck-busy
        # watchdog leaves it alone (see `_inflight_turns` + `_turn_inflight`).
        # Cleared in the finally below, covering normal return, cancel, and error.
        sid = session.session_id
        self._inflight_turns[sid] = self._inflight_turns.get(sid, 0) + 1
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
            # Write chat session ID sidecar so MCP server can resolve identity
            # without guessing. The CLI session's cli_session_id is the ChatSession
            # ID for resumed sessions; for new sessions it's set after first response.
            chat_session_id = bridge_session_id or (session.cli_session_id if hasattr(session, 'cli_session_id') else None)
            if chat_session_id and session.token_file_path:
                try:
                    with open(session.token_file_path + ".session", "w") as f:
                        f.write(chat_session_id)
                except OSError:
                    pass
            # Set the in-process dispatch session BEFORE send_message so MCP
            # tool calls made *during* the agent's turn (log_work, anything
            # else hitting the bridge HTTP MCP) resolve to the correct chat
            # session id. Previously this was set only after send_message
            # returned, which meant tool calls during the turn fell back to
            # the auto-registered "mcp-{hash}" session and silently mis-
            # attributed work_summary entries to a parallel orphan row.
            try:
                from pixsim7.client.mcp_server import set_dispatch_session
                # On first turn of a new session, chat_session_id may be None;
                # set it anyway so we explicitly clear any stale id from a
                # previous dispatch (avoids cross-attribution).
                set_dispatch_session(chat_session_id)
            except ImportError:
                pass

            # Live model switch: when the requested model differs from the
            # session's active model, push a `set_model` control_request before
            # the turn so the dropdown takes effect mid-conversation (not just
            # on a fresh session). No-op when unchanged or when the session is
            # reused via bridge_session_id at the same model. Effort has no
            # equivalent live control on modern models, so it stays spawn-time.
            if model:
                try:
                    await session.apply_runtime_model(model)
                except Exception as exc:
                    get_logger().warning("pool_set_model_failed", session=session.session_id, model=model, error=str(exc))

            response = await session.send_message(message, timeout=timeout, images=images, on_progress=on_progress, tool_gate=tool_gate)
            # Update index after first message (session now has its bridge_session_id)
            self._update_index(session)
            # Update sidecar after response — new sessions get cli_session_id on first turn
            post_session_id = session.cli_session_id if hasattr(session, 'cli_session_id') else None
            if post_session_id and session.token_file_path:
                try:
                    with open(session.token_file_path + ".session", "w") as f:
                        f.write(post_session_id)
                except OSError:
                    pass
            # Refresh the in-process dispatch session with the post-turn id
            # in case this was the first turn (cli_session_id only known now)
            # — tools called by *follow-up* turns then see the correct id.
            if post_session_id and post_session_id != chat_session_id:
                try:
                    from pixsim7.client.mcp_server import set_dispatch_session
                    set_dispatch_session(post_session_id)
                except ImportError:
                    pass
            return session.session_id, response
        except asyncio.CancelledError:
            # Cancel/resend races can interrupt a turn mid-flight. Force a restart
            # so the session is never left in an ambiguous BUSY state.
            get_logger().info(
                "pool_send_cancelled",
                session=session.session_id,
                policy=policy,
                scope_key=scope or None,
            )
            try:
                if not ephemeral and session.is_alive:
                    await asyncio.shield(session.restart())
                    self._update_index(session)
            except Exception as restart_error:
                get_logger().warning(
                    "pool_send_cancelled_restart_failed",
                    session=session.session_id,
                    error=str(restart_error),
                )
            finally:
                if session.state == SessionState.BUSY:
                    session.state = SessionState.READY
            raise
        except Exception:
            # Ensure session is not stuck in BUSY after an unexpected error
            if session.state == SessionState.BUSY:
                session.state = SessionState.READY
            raise
        finally:
            # Turn is no longer in-flight — the watchdog may treat the session
            # as orphaned from here if it stays BUSY.
            n = self._inflight_turns.get(sid, 0) - 1
            if n > 0:
                self._inflight_turns[sid] = n
            else:
                self._inflight_turns.pop(sid, None)
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
                    elif session.state == SessionState.BUSY and session.is_alive:
                        await self._maybe_recover_stuck_busy(session)
                    elif session.state == SessionState.READY and not session.is_alive:
                        # Exited while idle — don't restart, just mark stopped.
                        # It will be restarted on-demand when the next message arrives.
                        get_logger().debug("pool_session_exited", session=session.session_id)
                        session.state = SessionState.STOPPED

                # Evict idle sessions past timeout. Every on-demand session
                # is reapable here; see ``_evict_oldest_idle`` for the full
                # rationale on dropping the legacy ``-r-`` filter.
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                for session in list(self._sessions.values()):
                    if session.state == SessionState.READY and session.stats.last_activity:
                        idle_secs = (now - session.stats.last_activity).total_seconds()
                        if idle_secs > IDLE_EVICT_SECONDS:
                            get_logger().debug("pool_idle_evict", session=session.session_id, idle_secs=int(idle_secs))
                            await session.stop()
                            self._cleanup_session_files(session)
                            self._sessions.pop(session.session_id, None)
                            self._drop_indexes_for_session(session.session_id)

        except asyncio.CancelledError:
            return

    def _turn_inflight(self, session_id: str) -> bool:
        """True while a ``send_message`` call is actively awaiting this session's
        turn (see ``_inflight_turns``)."""
        return self._inflight_turns.get(session_id, 0) > 0

    async def _maybe_recover_stuck_busy(self, session) -> bool:
        """Restart a session that is BUSY-but-orphaned while still alive.

        This recovers ONLY a turn that outlived its awaiter: ``send_message``
        already returned/raised (so its except/finally can't reset the state)
        yet the session is still BUSY — left that way it stays BUSY forever and
        every subsequent message gets a false ``conversation_session_busy`` (the
        real-UUID flow that ``45b0582f8``'s derived-id fix explicitly no-ops).

        It must NOT touch a turn that is still in-flight. While ``send_message``
        is awaiting, IT owns the session's lifecycle — it pulses keepalives and
        enforces the turn timeout (``session.py``). The old time-only check
        (``now - last_activity > STUCK_BUSY_SECONDS``) had no way to tell an
        actively-streaming long turn from an orphan, so it force-restarted live
        turns mid-flight (e.g. session ``e5ab1e11`` killed at ``stuck_secs=609``
        while a tool was running). The ``_turn_inflight`` guard is the fix; the
        ``STUCK_BUSY_SECONDS`` threshold now only paces how soon we reclaim a
        genuinely orphaned BUSY session.

        Returns True if the session was restarted.
        """
        from datetime import datetime, timezone

        # Live turn — send_message owns it; never restart underneath it.
        if self._turn_inflight(session.session_id):
            return False

        last = session.stats.last_activity
        if last is None:
            return False
        stuck_secs = (datetime.now(timezone.utc) - last).total_seconds()
        if stuck_secs <= STUCK_BUSY_SECONDS:
            return False
        get_logger().warning(
            "pool_session_stuck_busy",
            session=session.session_id,
            stuck_secs=int(stuck_secs),
        )
        await session.restart()
        self._update_index(session)
        return True

    def status(self) -> dict:
        """Pool status summary."""
        return {
            "pool_size": self._pool_size,
            "total": len(self._sessions),
            "ready": self.ready_count,
            "busy": self.busy_count,
            "sessions": [s.to_dict() for s in self._sessions.values()],
        }
