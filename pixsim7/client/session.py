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
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Awaitable, Callable, Optional

from pixsim7.client.agent_errors import AgentError, generic_agent_error
from pixsim7.client.log import get_logger

# Asyncio stream buffer limit for subprocess stdout/stderr.
# Codex app-server can emit large JSON lines (e.g. mcpServerStatus/list with
# full tool schemas exceeds 200KB). The asyncio default of 64KB is too small.
SUBPROCESS_STREAM_LIMIT = 1024 * 1024  # 1MB


class AgentTaskError(RuntimeError):
    """Typed exception raised when an agent turn ends with an error event.

    Carries the structured :class:`AgentError` so the bridge can map it
    to a per-category error_code, decide whether to retry, and surface
    actionable details to the frontend. Subclasses ``RuntimeError`` for
    backward compatibility with callers that catch broad exception types.
    """

    def __init__(self, err: AgentError) -> None:
        super().__init__(err.message)
        self.err = err


# ── MCP config resolution contract (single source of truth) ──────────
# A regenerator is a zero-arg callable the AgentPool wires in so a session
# can recover when its MCP config file was swept. Every layer
# (session ↔ pool ↔ bridge) speaks exactly this contract:
#   • returns a path string → caller MUST verify it exists on disk
#   • returns None          → unrecoverable; fail loud
#   • raises                → unrecoverable; fail loud (detail preserved)
MCPConfigRegenerator = Callable[[], Optional[str]]


class MCPConfigUnavailable(RuntimeError):
    """The session's MCP config is missing and could not be regenerated.

    Raised by ``AgentCmdSession._resolve_mcp_config``; ``start()`` turns it
    into ``state=STOPPED`` + ``_last_error`` and refuses to launch (rather
    than silently starting an MCP-less agent).
    """


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
    # Context window tracking
    context_window: int = 0           # max tokens (from model info)
    input_tokens: int = 0             # cumulative input tokens
    output_tokens: int = 0            # cumulative output tokens
    cache_read_tokens: int = 0        # cumulative cache read tokens
    cost_usd: float = 0.0             # cumulative cost


# Sentinel pushed onto a session's response queue when its subprocess stdout
# reaches EOF (process exited) or the reader crashes. It wakes the send_message
# wait loop immediately so the turn fails with the real exit reason, instead of
# stalling until the next ~30s liveness poll and mislabelling a dead process as
# "a tool was still running". Deliberate stops (stop()/cancellation) do NOT push
# it. Identity-compared with `is`, so it must never look like a protocol event.
_EOF_SENTINEL = object()


class AgentCmdSession:
    """Manages a single agent process with stream-json I/O.

    Works with any agent command that speaks the stream-json protocol
    (Claude Code, Codex, etc.). The process stays alive between messages.
    """

    # Max silence (seconds) tolerated when NO tool is outstanding — the model is
    # reasoning between stdout lines (post-tool-result thinking, pre-first-token
    # latency on a big resumed context, or extended thinking). This is NOT dead
    # time: Opus-class think gaps after a tool result are legitimately minutes,
    # so the budget is generous and we re-arm it in <=30s pulse slices (like a
    # running tool) so the thinking bubble + bridge keepalive stay alive instead
    # of going dark until the kill. It exists only to catch a genuinely wedged
    # model/CLI stream (partial output then silence, stream never closing), not
    # to police normal think time — the earlier tight 150s value was killing
    # healthy turns mid-reasoning. Still decoupled from (and well under) the full
    # per-turn ``timeout`` so a true hang frees the slot. Engine-agnostic: pure
    # stdout-gap timing in our own reader loop. See plan
    # ``launcher-health-probe-stability`` › ``agent-idle-midstream-token-stall``.
    AGENT_IDLE_GAP_SECONDS = 420

    # Re-arm cadence (seconds) for the silent-gap wait. Every slice we re-check
    # process liveness and pulse a heartbeat (``tool_running`` / ``thinking``)
    # so the UI + bridge keepalive stay alive during a long tool or a long
    # reasoning gap. Bounded below by the turn ``timeout``. Class attr so tests
    # can shrink it to exercise re-arm without real-time waits.
    AGENT_PULSE_SLICE_SECONDS = 30

    def __init__(
        self,
        session_id: str,
        extra_args: list[str] | None = None,
        command: str = "claude",
        system_prompt: str | None = None,
        mcp_config_path: str | None = None,
        mcp_config_regenerator: "MCPConfigRegenerator | None" = None,
        resume_session_id: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        workdir: str | None = None,
        token_file_path: str | None = None,
        owned_mcp_config_path: str | None = None,
    ):
        from pixsim7.client.protocols import get_protocol
        self.session_id = session_id
        self._extra_args = extra_args or []
        self._command = command
        self._protocol = get_protocol(command)
        self._system_prompt = system_prompt
        self._mcp_config_path = mcp_config_path
        # Callable that returns a fresh MCP config path when the cached one is
        # missing (e.g. swept by Windows %TEMP% cleanup). Returns None or
        # raises if regeneration fails — Session uses that to decide whether
        # to fail-loud or fall back. When None, Session preserves legacy
        # silent-fallback behavior for callers (tests / standalone) that
        # construct Session without going through AgentPool.
        # See plan: mcp-server-reliability — robust-fix-regenerate-on-missing.
        self._mcp_config_regenerator = mcp_config_regenerator
        self._resume_session_id = resume_session_id
        self._model = model
        self._reasoning_effort = reasoning_effort
        # Model currently active in the live process. Starts at the spawn model;
        # updated when a `set_model` control_request is applied mid-session so we
        # only push a control frame when the requested model actually changes.
        self._live_model = model
        # Permission mode currently active in the live process. ``None`` until
        # the first `set_permission_mode` control_request lands, so the first
        # explicit request always applies (the spawn default is unknown to us —
        # the CLI's own default, typically "default"). Drives the per-tab plan
        # toggle taking effect mid-conversation without a respawn.
        self._live_permission_mode: str | None = None
        # Monotonic id source for control_request frames.
        self._control_seq = 0
        # JSON-RPC request id + live turn id (Codex app-server). Re-seeded in
        # start(); initialised here so steer/interrupt are safe to call on a
        # session that hasn't spawned yet (returns False rather than raising).
        self._jsonrpc_id = 10
        self._current_turn_id: str | None = None
        self._workdir = workdir
        self.token_file_path = token_file_path
        # Path to the private per-session MCP config clone this pool created
        # (STDIO mode only). None when the session shares the bridge's base
        # config (HTTP mode) — teardown must NOT delete a shared base.
        # Decoupled from _mcp_config_path on purpose: configure()/regenerator
        # reassign _mcp_config_path, but the file we own to clean up does not
        # change. Plan: mcp-server-reliability / cleanup-must-not-delete-shared-base.
        self._owned_mcp_config_path = owned_mcp_config_path
        self._log = get_logger().bind(session=session_id)
        self._process: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._response_queue: asyncio.Queue[dict] = asyncio.Queue()
        self.state = SessionState.IDLE
        self.stats = SessionStats()
        self._last_error: Optional[str] = None
        # Rolling tail of the subprocess's stderr, retained regardless of how
        # many results we received so a mid-turn process exit can report WHY it
        # died (the logs showed last_error=null on every such kill).
        self._stderr_tail: list[str] = []
        self.cli_session_id: Optional[str] = None   # conversation UUID from init event
        # Panel-facing conversation handle this subprocess is currently bound
        # to. Distinct from cli_session_id (Claude's internal resume UUID):
        # the panel addresses a conversation by this id, the pool resumes
        # Claude by cli_session_id. Stamped by AgentPool.send_message on
        # affinity dispatch. Conflating the two broke routing — see the
        # _update_index regression from the 2026-03-31 claude_session rename.
        self.bridge_session_id: Optional[str] = None
        self.cli_model: Optional[str] = None         # model reported by CLI
        self.available_models: list[dict] = []       # models from model/list (JSON-RPC agents)
        self._pending_restart: bool = False
        self._busy_started_at: Optional[datetime] = None
        self._busy_last_action: Optional[str] = None
        self._busy_last_detail: Optional[str] = None

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

    def _mark_busy(self) -> None:
        self.state = SessionState.BUSY
        self._busy_started_at = datetime.now(timezone.utc)
        self._busy_last_action = None
        self._busy_last_detail = None

    def _mark_ready(self) -> None:
        self.state = SessionState.READY
        self._busy_started_at = None
        self._busy_last_action = None
        self._busy_last_detail = None

    def busy_context(self) -> dict:
        """Return structured busy-state metadata for diagnostics/UI."""
        if self.state != SessionState.BUSY:
            return {}
        context: dict[str, object] = {
            "session_id": self.session_id,
            "is_alive": self.is_alive,
        }
        if self._busy_started_at:
            age_s = int((datetime.now(timezone.utc) - self._busy_started_at).total_seconds())
            if age_s >= 0:
                context["busy_for_s"] = age_s
        if self._busy_last_action:
            context["action"] = self._busy_last_action
        if self._busy_last_detail:
            detail = self._busy_last_detail.replace("\n", " ").strip()
            if len(detail) > 200:
                detail = f"{detail[:197]}..."
            if detail:
                context["activity"] = detail
        return context

    def busy_description(self) -> str:
        """Return a concise description of why this session is currently busy."""
        context = self.busy_context()
        if not context:
            return ""
        parts = [f"session={context.get('session_id', self.session_id)}"]
        if isinstance(context.get("busy_for_s"), int):
            parts.append(f"busy_for={context['busy_for_s']}s")
        if isinstance(context.get("activity"), str):
            parts.append(f"activity={context['activity']!r}")
        elif isinstance(context.get("action"), str):
            parts.append(f"action={context['action']}")
        if context.get("is_alive") is False:
            parts.append("process=not_alive")
        return ", ".join(parts)

    def _resolve_mcp_config(self) -> Optional[str]:
        """Resolve the MCP config path to launch with, or fail loud.

        The single home for the regenerate-or-fail decision tree. MCP config
        files can be swept (Windows Storage Sense / AV / our own stale-file
        sweep) — see plan mcp-server-reliability.

          • no configured path, or path still exists → use it as-is
          • path missing, no regenerator wired       → return None (legacy:
            launch WITHOUT MCP rather than refuse — back-compat for tests /
            standalone Session construction without an AgentPool)
          • path missing, regenerator wired (per the MCPConfigRegenerator
            contract):
              – regenerator raises                   → MCPConfigUnavailable
              – returns falsy / non-existent path    → MCPConfigUnavailable
              – returns an existing path             → adopt it and use it
        """
        mcp_config = self._mcp_config_path
        if not mcp_config or os.path.exists(mcp_config):
            return mcp_config

        self._log.warning("mcp_config_missing", path=mcp_config)
        if self._mcp_config_regenerator is None:
            # No regenerator wired — preserve legacy launch-without-MCP.
            return None

        try:
            fresh = self._mcp_config_regenerator()
        except Exception as exc:
            self._log.error(
                "mcp_config_regeneration_failed",
                path=mcp_config,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            raise MCPConfigUnavailable(
                f"MCP config missing at {mcp_config!r} and regeneration "
                f"raised {type(exc).__name__}: {exc}. Refusing to start "
                f"session without MCP."
            ) from exc

        if fresh and os.path.exists(fresh):
            self._mcp_config_path = fresh
            self._log.info("mcp_config_regenerated", path=fresh)
            return fresh

        self._log.error(
            "mcp_config_regeneration_unrecoverable",
            original=mcp_config,
            returned=fresh,
        )
        raise MCPConfigUnavailable(
            f"MCP config missing at {mcp_config!r} and regenerator "
            f"returned {fresh!r}. Refusing to start session without MCP."
        )

    async def start(self) -> bool:
        """Start the CLI process. Returns True if successful."""
        if self.is_alive:
            return True

        import shutil
        self.state = SessionState.STARTING

        # Resolve full path — needed on Windows where .CMD wrappers (npm)
        # aren't found by asyncio.create_subprocess_exec with bare names
        resolved_command = shutil.which(self._command) or self._command

        # Resolve the MCP config (regenerate-or-fail-loud lives in one
        # place — see _resolve_mcp_config and the MCPConfigRegenerator
        # contract). Plan: mcp-server-reliability.
        try:
            mcp_config = self._resolve_mcp_config()
        except MCPConfigUnavailable as exc:
            self.state = SessionState.STOPPED
            self._last_error = str(exc)
            return False

        cmd = self._protocol.build_start_cmd(
            resolved_command,
            resume_session_id=self._resume_session_id,
            system_prompt=self._system_prompt,
            mcp_config_path=mcp_config,
            model=self._model,
            reasoning_effort=self._reasoning_effort,
            extra_args=self._extra_args,
        )

        self._log.debug("session_starting", command=" ".join(cmd))

        try:
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._workdir or None,
                limit=SUBPROCESS_STREAM_LIMIT,
            )
        except FileNotFoundError:
            self._last_error = f"Command not found: {self._command}"
            self.state = SessionState.ERRORED
            self._log.error("session_start_failed", error=self._last_error)
            return False
        except Exception as e:
            self._last_error = str(e)
            self.state = SessionState.ERRORED
            self._log.error("session_start_failed", error=str(e))
            return False

        self._reader_task = asyncio.create_task(self._read_stdout())
        self._stderr_task = asyncio.create_task(self._read_stderr())
        self.state = SessionState.READY
        self.stats.started_at = datetime.now(timezone.utc)
        self._last_error = None
        self._jsonrpc_id = 10  # start IDs above the init sequence
        # Live turn id for JSON-RPC engines (Codex app-server), captured from
        # turn/start acks + turn/* notifications. Targets mid-turn steer /
        # interrupt; None between turns (and for non-JSON-RPC engines).
        self._current_turn_id = None

        self._log.info("session_started", pid=self._process.pid)

        # JSON-RPC protocols (codex app-server) need initialize + thread/start
        if hasattr(self._protocol, 'needs_jsonrpc_init') and self._protocol.needs_jsonrpc_init():
            try:
                await self._jsonrpc_init()
            except Exception as e:
                self._log.error("session_init_failed", error=str(e))
                self._last_error = f"Protocol init failed: {e}"
                await self.stop()
                return False

        return True

    async def _jsonrpc_call(
        self,
        method: str,
        params: dict | None,
        request_id: int,
        timeout: float = 15,
    ) -> dict:
        """Send a JSON-RPC request and wait for its response while handling notifications."""
        if not self._process or not self._process.stdin:
            raise RuntimeError("JSON-RPC call attempted without a running process")

        msg = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": request_id,
        }) + "\n"
        self._process.stdin.write(msg.encode())
        await self._process.stdin.drain()

        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            remaining = max(0.1, deadline - asyncio.get_event_loop().time())
            event = await asyncio.wait_for(self._response_queue.get(), timeout=min(5, remaining))

            if event.get("id") == request_id:
                if "error" in event:
                    err = event["error"]
                    message = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                    raise AgentTaskError(generic_agent_error(message, event))
                return event.get("result", {})

            parsed = self._protocol.parse_event(event)
            if parsed.kind == "error":
                err = parsed.error or generic_agent_error(parsed.text or f"{method} failed", parsed.raw)
                raise AgentTaskError(err)
            if parsed.kind == "progress" and parsed.text:
                self._log.debug("session_init_progress", detail=parsed.text)

        raise RuntimeError(f"Timed out waiting for response to {method} (id={request_id})")

    async def _wait_for_mcp_startup_complete(self, timeout: float = 15) -> None:
        """Wait for MCP startup complete notification when available.

        Handles both legacy (codex/event/mcp_startup_*) and current
        (mcpServer/startupStatus/updated) Codex event names.
        """
        deadline = asyncio.get_event_loop().time() + timeout
        saw_mcp_event = False
        # Track per-server ready/failed status for the new event format
        pending_servers: set[str] = set()
        ready_servers: set[str] = set()

        while asyncio.get_event_loop().time() < deadline:
            remaining = max(0.1, deadline - asyncio.get_event_loop().time())
            try:
                event = await asyncio.wait_for(self._response_queue.get(), timeout=min(2, remaining))
            except asyncio.TimeoutError:
                # If we saw MCP events and all known servers are ready, we're done
                if saw_mcp_event and pending_servers and pending_servers == ready_servers:
                    return
                continue

            method = event.get("method", "")
            parsed = self._protocol.parse_event(event)

            # Legacy format: codex/event/mcp_startup_*
            if method.startswith("codex/event/mcp_startup_"):
                saw_mcp_event = True
                if parsed.kind == "error":
                    err = parsed.error or generic_agent_error(parsed.text or "MCP startup failed", parsed.raw)
                    raise AgentTaskError(err)
                if parsed.kind == "progress" and parsed.text:
                    self._log.debug("session_init_progress", detail=parsed.text)
                if method == "codex/event/mcp_startup_complete":
                    return
                continue

            # Current format (Codex 0.117+): mcpServer/startupStatus/updated
            if method == "mcpServer/startupStatus/updated":
                saw_mcp_event = True
                params = event.get("params", {})
                server_name = params.get("name", "")
                status = params.get("status", "")
                error = params.get("error")
                if server_name:
                    pending_servers.add(server_name)
                if status == "ready":
                    ready_servers.add(server_name)
                    self._log.debug("session_init_progress", detail=f"MCP ready: {server_name}")
                elif status == "starting":
                    self._log.debug("session_init_progress", detail=f"MCP starting: {server_name}")
                elif status == "failed":
                    err_msg = error or "unknown"
                    self._log.warning("mcp_server_failed", server=server_name, error=err_msg)
                    ready_servers.add(server_name)  # count as resolved (don't block)
                # All known servers resolved?
                if pending_servers and pending_servers == ready_servers:
                    return
                continue

            if parsed.kind == "error":
                err = parsed.error or generic_agent_error(parsed.text, parsed.raw)
                raise AgentTaskError(err)
            if parsed.kind == "progress" and parsed.text:
                self._log.debug("session_init_progress", detail=parsed.text)

        if saw_mcp_event and pending_servers != ready_servers:
            self._log.warning("mcp_startup_timeout", timeout_s=int(timeout))

    async def _log_mcp_server_status(self) -> None:
        """Log MCP server/tool counts for observability."""
        try:
            result = await self._jsonrpc_call("mcpServerStatus/list", {}, request_id=2, timeout=10)
        except Exception as e:
            self._log.warning("mcp_status_failed", error=str(e))
            return

        data = result.get("data") if isinstance(result, dict) else None
        if not isinstance(data, list):
            return

        if not data:
            self._log.debug("mcp_no_servers")
            return

        summaries = []
        for server in data:
            if not isinstance(server, dict):
                continue
            name = server.get("name", "unknown")
            tools = server.get("tools") or {}
            tool_count = len(tools) if isinstance(tools, dict) else 0
            summaries.append(f"{name}={tool_count}")

        if summaries:
            self._log.debug("mcp_tool_counts", servers=", ".join(summaries))

    async def _jsonrpc_init(self) -> None:
        """Send JSON-RPC initialize + thread/start for protocols that need it."""
        await self._jsonrpc_call(
            "initialize",
            {
                "clientInfo": {"name": "pixsim", "version": "1.0"},
                "capabilities": {"experimentalApi": True},
            },
            request_id=0,
            timeout=10,
        )

        if self._resume_session_id:
            thread_result = await self._jsonrpc_call(
                "thread/resume",
                {
                    "threadId": self._resume_session_id,
                    "approvalPolicy": "never",
                    "sandbox": "danger-full-access",
                    "persistExtendedHistory": False,
                },
                request_id=1,
                timeout=20,
            )
        else:
            thread_result = await self._jsonrpc_call(
                "thread/start",
                {
                    "approvalPolicy": "never",
                    "sandbox": "danger-full-access",
                    "experimentalRawEvents": False,
                    "persistExtendedHistory": False,
                },
                request_id=1,
                timeout=20,
            )

        thread = thread_result.get("thread", {}) if isinstance(thread_result, dict) else {}
        thread_id = thread.get("id")
        if not thread_id:
            raise RuntimeError("thread/start returned no thread ID")
        self.cli_session_id = thread_id
        self._log.debug("session_thread_id", thread_id=self.cli_session_id)

        await self._wait_for_mcp_startup_complete(timeout=15)
        await self._log_mcp_server_status()

        # Query available models (non-blocking — failure is not fatal)
        await self.query_models()

    async def query_models(self) -> list[dict]:
        """Query available models via model/list JSON-RPC. Returns and caches the list."""
        if not (hasattr(self._protocol, 'needs_jsonrpc_init') and self._protocol.needs_jsonrpc_init()):
            return self.available_models
        if not self.is_alive:
            return self.available_models
        try:
            self._jsonrpc_id += 1
            result = await self._jsonrpc_call("model/list", {"includeHidden": True}, request_id=self._jsonrpc_id, timeout=10)
            raw_models = result.get("data", []) if isinstance(result, dict) else []
            self.available_models = [
                {
                    "id": m.get("id", ""),
                    "model": m.get("model", m.get("id", "")),
                    "label": m.get("displayName", m.get("id", "")),
                    "is_default": m.get("isDefault", False),
                    "hidden": m.get("hidden", False),
                    "input_modalities": m.get("inputModalities", []),
                }
                for m in raw_models
                if isinstance(m, dict)
            ]
            visible = [m for m in self.available_models if not m["hidden"]]
            self._log.debug("session_models", visible=len(visible), total=len(self.available_models))
        except Exception as e:
            self._log.warning("session_models_failed", error=str(e))
        return self.available_models

    async def stop(self) -> None:
        """Stop the CLI process gracefully."""
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._stderr_task:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except (asyncio.CancelledError, Exception):
                pass

        if self._process and self._process.returncode is None:
            # Close stdin first to signal EOF to the child process
            if self._process.stdin:
                try:
                    self._process.stdin.close()
                except Exception:
                    pass
            pid = self._process.pid
            stopped = False
            if os.name == "nt" and pid:
                # Windows doesn't reliably terminate child MCP subprocesses when
                # only the parent CLI process is terminated. Kill the process
                # tree so stale mcp_server.py instances don't accumulate.
                try:
                    killer = await asyncio.create_subprocess_exec(
                        "taskkill", "/PID", str(pid), "/T", "/F",
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await asyncio.wait_for(killer.wait(), timeout=5)
                    await asyncio.wait_for(self._process.wait(), timeout=5)
                    stopped = True
                except (asyncio.TimeoutError, ProcessLookupError, FileNotFoundError):
                    stopped = False
            if not stopped:
                try:
                    self._process.terminate()
                    await asyncio.wait_for(self._process.wait(), timeout=5)
                except (asyncio.TimeoutError, ProcessLookupError):
                    try:
                        self._process.kill()
                    except ProcessLookupError:
                        pass

        # Explicitly close pipe transports to prevent Windows ProactorEventLoop
        # ResourceWarning spam ("unclosed transport" / "I/O operation on closed pipe")
        if self._process:
            for pipe in (self._process.stdin, self._process.stdout, self._process.stderr):
                if pipe is None:
                    continue
                transport = getattr(pipe, '_transport', getattr(pipe, 'transport', None))
                if transport and not getattr(transport, '_closing', False):
                    try:
                        transport.close()
                    except Exception:
                        pass

        self.state = SessionState.STOPPED
        exit_code = self._process.returncode if self._process else None
        self._log.info(
            "session_stopped",
            sent=self.stats.messages_sent,
            received=self.stats.messages_received,
            exit_code=exit_code,
            last_error=self._last_error,
        )

    async def restart(self) -> bool:
        """Stop and restart the session, preserving conversation via --resume."""
        if self.cli_session_id and not self._resume_session_id:
            self._resume_session_id = self.cli_session_id
        await self.stop()
        await asyncio.sleep(1)
        return await self.start()

    async def apply_runtime_model(self, model: str | None, *, timeout: float = 10.0) -> bool:
        """Switch the live process's model mid-session via a ``set_model``
        control_request — no respawn, no ``--resume`` (so no thinking-block
        400). Verified against the Claude CLI: it applies to subsequent turns.

        No-op (returns True) when the protocol has no control channel, the
        requested model is empty, or it already matches the live model. Must be
        called while the session is NOT mid-turn — the pool invokes it right
        before ``send_message``. Returns False if the control round-trip failed
        (the caller proceeds with the current model rather than aborting).
        """
        if not model or not model.strip():
            return True
        model = model.strip()
        if model == self._live_model:
            return True
        if not self._protocol.supports_runtime_control():
            # Engine can't switch live (e.g. Codex). Leave it to spawn-time.
            return False
        if not self.is_alive or not self._process or not self._process.stdin:
            return False

        self._control_seq += 1
        request_id = f"set-model-{self._control_seq}"
        frame = self._protocol.build_control_request(request_id, "set_model", model=model)
        if not frame:
            return False

        ok = await self._exchange_control_request(
            request_id, frame, timeout=timeout,
            log_event="session_set_model", log_fields={"model": model},
        )
        if ok:
            self._live_model = model
            self.cli_model = model
            self._log.info("session_model_switched", model=model)
        return ok

    async def apply_permission_mode(self, mode: str | None, *, timeout: float = 10.0) -> bool:
        """Switch the live process's permission mode mid-session via a
        ``set_permission_mode`` control_request — no respawn, no ``--resume``.
        Drives the per-tab plan toggle: flip the session into ``"plan"`` so the
        model researches and calls ``ExitPlanMode`` (surfacing the approval card
        via the PreToolUse hook), or back to ``"default"`` to resume normally.

        No-op (returns True) when the requested mode is empty, already matches
        the live mode, or the protocol has no control channel (Codex). Must be
        called while the session is NOT mid-turn — the pool invokes it right
        before ``send_message``. Returns False if the round-trip failed (caller
        proceeds at the current mode rather than aborting).
        """
        if not mode or not mode.strip():
            return True
        mode = mode.strip()
        if mode == self._live_permission_mode:
            return True
        if not self._protocol.supports_runtime_control():
            return False
        if not self.is_alive or not self._process or not self._process.stdin:
            return False

        self._control_seq += 1
        request_id = f"set-mode-{self._control_seq}"
        frame = self._protocol.build_control_request(request_id, "set_permission_mode", mode=mode)
        if not frame:
            return False

        ok = await self._exchange_control_request(
            request_id, frame, timeout=timeout,
            log_event="session_set_permission_mode", log_fields={"mode": mode},
        )
        if ok:
            self._live_permission_mode = mode
            self._log.info("session_permission_mode_switched", mode=mode)
        return ok

    async def interrupt(self) -> bool:
        """Abort the in-flight turn (real stop), not just abandon the await.

        Fire-and-forget: we only *write* an ``interrupt`` control_request to
        stdin. The turn-ending ``result``/``error`` event flows through the
        active ``send_message`` loop as usual; the matching ``control_response``
        parses to ``kind="other"`` there and is inert, so there's no contention
        with the loop draining ``_response_queue`` (which is why this does NOT
        reuse ``_exchange_control_request`` — that helper assumes no turn is in
        flight). Falls back to a hard ``stop()`` for protocols without a runtime
        control channel (e.g. Codex), which ends the turn by killing the
        process. Returns True if an interrupt/stop was issued.
        """
        # Claude: stdin control_request channel.
        if self._protocol.supports_runtime_control():
            if not self.is_alive or not self._process or not self._process.stdin:
                return False
            self._control_seq += 1
            request_id = f"interrupt-{self._control_seq}"
            frame = self._protocol.build_control_request(request_id, "interrupt")
            if not frame:
                return False
            try:
                self._process.stdin.write(frame.encode())
                await self._process.stdin.drain()
                self._log.info("session_interrupt_sent", request_id=request_id)
                return True
            except Exception as exc:
                self._log.warning("session_interrupt_failed", error=str(exc))
                return False
        # Codex app-server: a turn/interrupt RPC aborts just the turn and keeps
        # the session alive (no respawn). Falls back to a hard stop if the turn
        # id isn't known yet (interrupt fired in the brief pre-ack window).
        if hasattr(self._protocol, "needs_jsonrpc_init") and self._protocol.needs_jsonrpc_init():
            return await self._interrupt_jsonrpc()
        # No control channel at all (single-turn Codex exec) — hard stop.
        await self.stop()
        return True

    async def _interrupt_jsonrpc(self) -> bool:
        """Abort the live Codex turn via ``turn/interrupt`` (fire-and-forget —
        the turn ends through the normal turn/completed path). Hard-stops if the
        thread/turn id isn't known yet."""
        if not self.cli_session_id or not self._current_turn_id:
            await self.stop()
            return True
        if not self.is_alive or not self._process or not self._process.stdin:
            return False
        self._jsonrpc_id += 1
        frame = json.dumps({
            "jsonrpc": "2.0",
            "method": "turn/interrupt",
            "id": self._jsonrpc_id,
            "params": {"threadId": self.cli_session_id, "turnId": self._current_turn_id},
        }) + "\n"
        try:
            self._process.stdin.write(frame.encode())
            await self._process.stdin.drain()
            self._log.info("session_interrupt_sent_jsonrpc", turn_id=self._current_turn_id)
            return True
        except Exception as exc:
            self._log.warning("session_interrupt_failed", error=str(exc))
            return False

    async def steer(self, message: str, images: list[dict] | None = None) -> bool:
        """Inject an extra user message into the IN-FLIGHT turn (live steering),
        like typing while the CLI works in a terminal.

        Fire-and-forget: we only write the user frame to the persistent stdin —
        the CLI decides *when* the agent picks it up, and the resulting events
        flow through the active ``send_message`` loop as normal (no new turn /
        no new dispatch task). Requires a long-running stream-json input channel
        (Claude). Returns False for engines without one (single-turn Codex exec)
        or JSON-RPC engines (Codex app-server) that need a turn-scoped injection
        we don't model yet — the caller can fall back to queueing it as the next
        turn.
        """
        if not message or not message.strip():
            return False
        if not self._protocol.is_long_running():
            # Single-turn Codex exec: one process per turn, no mid-turn channel.
            return False
        if hasattr(self._protocol, "needs_jsonrpc_init") and self._protocol.needs_jsonrpc_init():
            # Codex app-server: inject via the turn/steer RPC.
            return await self._steer_jsonrpc(message, images)
        if not self.is_alive or not self._process or not self._process.stdin:
            return False
        payload = self._protocol.build_message_payload(message, images)
        if not payload:
            return False
        try:
            self._process.stdin.write(payload.encode())
            await self._process.stdin.drain()
            # Real input is activity — keep the inactivity watchdog from cutting
            # the turn while the agent digests the steer.
            self.stats.last_activity = datetime.now(timezone.utc)
            self._log.info("session_steer_sent", chars=len(message.strip()))
            return True
        except Exception as exc:
            self._log.warning("session_steer_failed", error=str(exc))
            return False

    async def _steer_jsonrpc(self, message: str, images: list[dict] | None = None) -> bool:
        """Inject guidance into the live Codex turn via ``turn/steer`` (no new
        turn, no interrupt). Fire-and-forget — the steer's events flow through
        the active send_message loop. Needs the thread + current turn id; returns
        False if the turn id isn't known yet (steer fired before the turn ack)."""
        if not self.cli_session_id or not self._current_turn_id:
            return False
        if not self.is_alive or not self._process or not self._process.stdin:
            return False
        try:
            input_items = json.loads(self._protocol.build_message_payload(message, images) or "[]")
        except (TypeError, ValueError):
            return False
        if not input_items:
            return False
        self._jsonrpc_id += 1
        frame = json.dumps({
            "jsonrpc": "2.0",
            "method": "turn/steer",
            "id": self._jsonrpc_id,
            "params": {
                "threadId": self.cli_session_id,
                "input": input_items,
                "expectedTurnId": self._current_turn_id,
            },
        }) + "\n"
        try:
            self._process.stdin.write(frame.encode())
            await self._process.stdin.drain()
            self.stats.last_activity = datetime.now(timezone.utc)
            self._log.info(
                "session_steer_sent_jsonrpc",
                turn_id=self._current_turn_id,
                chars=len(message.strip()),
            )
            return True
        except Exception as exc:
            self._log.warning("session_steer_failed", error=str(exc))
            return False

    async def _exchange_control_request(
        self,
        request_id: str,
        frame: str,
        *,
        timeout: float,
        log_event: str,
        log_fields: dict,
    ) -> bool:
        """Write a ``control_request`` frame to stdin and await its matching
        ``control_response``, returning True on a ``success`` ack.

        Shared by ``apply_runtime_model`` / ``apply_permission_mode``. Caller
        guarantees the session is alive and NOT mid-turn. Stray events shouldn't
        arrive here (no turn in flight), but anything that isn't our response is
        re-queued so a late init/etc. isn't swallowed.
        """
        self._process.stdin.write(frame.encode())
        await self._process.stdin.drain()

        deferred: list = []
        ok = False
        try:
            deadline = asyncio.get_event_loop().time() + timeout
            while True:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    break
                event = await asyncio.wait_for(self._response_queue.get(), timeout=remaining)
                if event is _EOF_SENTINEL:
                    self._response_queue.put_nowait(_EOF_SENTINEL)  # let the turn see EOF
                    break
                if isinstance(event, dict) and event.get("type") == "control_response":
                    resp = event.get("response", {})
                    if resp.get("request_id") == request_id:
                        ok = str(resp.get("subtype")) == "success"
                        if not ok:
                            self._log.warning(f"{log_event}_failed", response=resp, **log_fields)
                        break
                    # A different control_response — ignore (not ours).
                    continue
                deferred.append(event)
        except asyncio.TimeoutError:
            self._log.warning(f"{log_event}_timeout", **log_fields)
        finally:
            for ev in deferred:
                self._response_queue.put_nowait(ev)
        return ok

    async def send_message(
        self,
        message: str,
        timeout: int = 120,
        images: list[dict] | None = None,
        on_progress: "Callable[[str, str], None] | None" = None,
        tool_gate: "Callable[[str, dict], Awaitable[bool]] | None" = None,
    ) -> str:
        """Send a message and wait for the complete response.

        For long-running protocols (Claude): sends via stdin to existing process.
        For single-turn protocols (Codex): restarts the process with --resume.

        Args:
            tool_gate: Optional async callback ``(tool_name, tool_input) -> bool``.
                Called before a built-in tool executes. Pauses the stdout reader
                (back-pressuring the CLI) until the callback resolves. Return
                True to allow, False to cancel the session.
        """
        # Single-turn protocol: (re)start process per message
        if not self._protocol.is_long_running():
            if self.cli_session_id:
                self._resume_session_id = self.cli_session_id
            if self.is_alive:
                await self.stop()
                await asyncio.sleep(0.5)
            if not await self.start():
                raise RuntimeError(f"Session {self.session_id} failed to start")

        if not self.is_alive or not self._process or not self._process.stdin:
            raise RuntimeError(f"Session {self.session_id} is not running")

        self._mark_busy()
        # Fresh turn — drop any previous turn id so a steer/interrupt can't
        # target a completed turn (JSON-RPC engines re-capture it below).
        self._current_turn_id = None

        # Clear stale responses
        while not self._response_queue.empty():
            try:
                self._response_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Send message via protocol adapter
        if hasattr(self._protocol, 'needs_jsonrpc_init') and self._protocol.needs_jsonrpc_init():
            # JSON-RPC: send turn/start with the thread ID
            self._jsonrpc_id += 1
            user_input = json.loads(self._protocol.build_message_payload(message, images))
            turn_msg = json.dumps({
                "jsonrpc": "2.0", "method": "turn/start",
                "params": {"threadId": self.cli_session_id, "input": user_input},
                "id": self._jsonrpc_id,
            }) + "\n"
            self._process.stdin.write(turn_msg.encode())
            await self._process.stdin.drain()
        else:
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
        # Path-1 inactivity guard. `timeout` bounds the gap between subprocess
        # stdout lines — but a tool the agent invoked (built-in, Bash, or a
        # *blocking* MCP call such as ask_user / a confirmation) emits zero
        # stdout while it runs. That silence is legitimate, not a hang: we
        # already saw the tool_use line, so the agent is alive and waiting on
        # the tool (often on a human, on mobile). While a tool_use is
        # outstanding and the process is alive, re-arm the wait instead of
        # killing the turn (mirrors the backend heartbeat-extend in
        # remote_cmd_bridge.dispatch_task_streaming).
        tool_inflight = False
        # Human-readable description of the most recent tool call, kept so that
        # when its result lands we can re-stamp the busy markers to point at the
        # *post-tool* model gap rather than leaving them frozen on the (finished)
        # tool — otherwise an idle-timeout reads "went silent after Searching: …"
        # long after the search returned, misdirecting triage at a tool that
        # already completed.
        last_tool_detail: Optional[str] = None
        # Start of the current silent window (no fresh stdout line yet); reset on
        # every line. Both regimes (a running tool, or the model reasoning
        # between lines) re-arm in <=30s pulse slices off this marker.
        silent_since: Optional[datetime] = None
        # Reasoning-gap budget: how long we tolerate quiet when NO tool is
        # outstanding (model thinking after a tool result / before first token).
        # Generous on purpose — see AGENT_IDLE_GAP_SECONDS. A running tool is
        # bounded only by the process staying alive (long Bash/subagent/blocking
        # MCP), so its cap is effectively unbounded within the turn.
        idle_gap = min(timeout, self.AGENT_IDLE_GAP_SECONDS)
        # Inactivity bound — NOT wall-clock. The pool stuck-busy watchdog no
        # longer restarts in-flight turns (it gates on `_inflight_turns`), so
        # send_message is the single authority. But it must bound *silence*, not
        # total turn length: a turn that's actively streaming events (e.g. 15 min
        # of edits) is healthy and must never be cut just for running long — an
        # earlier wall-clock budget here wrongly killed long-but-active turns
        # (same bug class as the old watchdog). We cut only when the agent goes
        # silent past a cap measured since the LAST real event:
        #   • no tool outstanding → the generous reasoning gap (idle_gap)
        #   • a tool is running   → the full `timeout` of pure silence (a tool
        #     that emits nothing for the whole budget is presumed wedged)
        # `silent_since` resets on every real event, so an active turn re-arms
        # indefinitely.
        # Managed-process tracking for this turn: short tool_use id -> kind
        # ("subagent" | "background_task"). Feeds the panel's per-session
        # "managed processes" list via typed `managed_proc_*` heartbeats.
        managed_started: dict[str, str] = {}
        try:
            while True:
                while True:
                    now = datetime.now(timezone.utc)
                    if silent_since is None:
                        silent_since = now
                    silent_elapsed = (now - silent_since).total_seconds()
                    # Max silence tolerated in this regime, measured since the
                    # last real event (NOT turn start): unbounded-feeling for a
                    # running tool (the full budget) vs the tighter reasoning gap.
                    silence_cap = float(timeout) if tool_inflight else float(idle_gap)
                    # Pulse cadence, but never wait past the silence cap so a
                    # genuine stall (and tight test caps) still fails fast.
                    pulse = min(float(self.AGENT_PULSE_SLICE_SECONDS), float(timeout))
                    slice_to = max(0.05, min(pulse, silence_cap - silent_elapsed))
                    try:
                        event_raw = await asyncio.wait_for(
                            self._response_queue.get(),
                            timeout=slice_to,
                        )
                        break
                    except asyncio.TimeoutError:
                        # Process dead, or silent past the cap → give up; the
                        # outer handler classifies tool_inflight vs agent_idle.
                        if not self.is_alive or silent_elapsed + slice_to >= silence_cap:
                            raise
                        # Alive and within budget → pulse + re-arm. Pulsing the
                        # thinking bubble (with an elapsed stamp) lets the user
                        # tell a healthy long wait from a hang and keeps the
                        # bridge keepalive / backend heartbeat-gap fed. A running
                        # tool reads as "still working"; a quiet reasoning gap
                        # (post-tool-result thinking, slow first token) reads as
                        # "thinking" — both legitimate, neither a hang.
                        elapsed_s = int(silent_elapsed + slice_to)
                        if tool_inflight:
                            event_name = "tool_running"
                            self._log.info(
                                "session_tool_inflight_extend",
                                last_action=self._busy_last_action,
                                last_detail=self._busy_last_detail,
                                elapsed_s=elapsed_s,
                            )
                        else:
                            event_name = "thinking"
                            self._log.info(
                                "session_reasoning_extend",
                                last_action=self._busy_last_action,
                                last_detail=self._busy_last_detail,
                                elapsed_s=elapsed_s,
                            )
                        if on_progress:
                            detail = self._busy_last_detail or self._busy_last_action or "Working..."
                            detail = f"{detail} ({elapsed_s}s)"
                            try:
                                on_progress(event_name, detail)
                            except Exception:
                                self._log.debug("inflight_progress_failed", exc_info=True)
                        continue

                # Subprocess exited / stdout closed mid-turn. The reader pushes
                # this sentinel on EOF so we fail NOW with the real exit reason,
                # rather than waiting up to a full pulse slice for the is_alive
                # poll and then blaming a tool that already finished.
                if event_raw is _EOF_SENTINEL:
                    self.stats.errors += 1
                    self._log.warning(
                        "session_process_exited_midturn",
                        returncode=self._process.returncode if self._process else None,
                        last_action=self._busy_last_action,
                        last_detail=self._busy_last_detail,
                        partial_result_len=len(result_text),
                        cli_session=self.cli_session_id,
                    )
                    self._mark_ready()
                    raise RuntimeError(self._build_process_exit_error())

                # Capture the live turn id (JSON-RPC engines) so a concurrent
                # steer/interrupt can target this exact turn. No-op for Claude.
                _turn_id = self._protocol.extract_turn_id(event_raw)
                if _turn_id:
                    self._current_turn_id = _turn_id

                parsed = self._protocol.parse_event(event_raw)
                # Any fresh stdout line ends the silent window. A tool_use
                # block re-opens it (the tool is about to run); every other
                # event means the agent is streaming again.
                tool_inflight = False
                silent_since = None
                # Record real agent output as activity. The pool's stuck-busy
                # watchdog (agent_pool._maybe_recover_stuck_busy) restarts a
                # session when now - stats.last_activity > STUCK_BUSY_SECONDS;
                # without bumping it here, last_activity froze at turn-start and
                # a long turn that was actively streaming tool calls looked
                # "stuck" and got killed mid-flight (the stuck_secs=609 kill).
                # Only REAL events count — not the synthetic keepalive pulses —
                # so the watchdog can still catch a genuinely silent-but-alive
                # session.
                self.stats.last_activity = datetime.now(timezone.utc)

                if parsed.kind == "init":
                    if parsed.session_id:
                        self.cli_session_id = parsed.session_id
                    if parsed.model:
                        self.cli_model = parsed.model
                    self._log.debug("session_identified", cli_session=self.cli_session_id, model=self.cli_model)
                    # Surface the freshly-assigned cli_session_id to the bridge
                    # ASAP via the progress callback. Without this, brand-new
                    # sessions only learn their bridge_session_id when the final
                    # `result` event arrives — meaning a mid-turn HMR/reload
                    # loses the only handle the panel can use to reconcile with
                    # server state. The bridge special-cases this event type to
                    # stamp the id onto every subsequent heartbeat.
                    if on_progress and self.cli_session_id:
                        try:
                            on_progress("session_resolved", self.cli_session_id)
                        except Exception:
                            self._log.debug("session_resolved_progress_failed", exc_info=True)

                    # Plan `chat-session-durable-resume` CP-C: we asked the
                    # CLI to `--resume <X>` but it handed us a *different*
                    # conversation id — the prior conversation was gone, so
                    # this turn has NO model memory. Pre-fix this was silent
                    # and the panel re-skinned the old transcript onto the
                    # fresh session, leaving the user with an amnesiac agent
                    # that looked continuous. Surface it loudly instead.
                    if (
                        on_progress
                        and self._resume_session_id
                        and self.cli_session_id
                        and self.cli_session_id != self._resume_session_id
                    ):
                        try:
                            on_progress(
                                "resume_failed",
                                json.dumps({
                                    "requested": self._resume_session_id,
                                    "actual": self.cli_session_id,
                                }),
                            )
                        except Exception:
                            self._log.debug("resume_failed_progress_failed", exc_info=True)

                elif parsed.kind == "result":
                    if parsed.text:
                        result_text = parsed.text
                    if parsed.session_id:
                        self.cli_session_id = parsed.session_id
                    self.stats.messages_received += 1
                    self.stats.total_duration_ms += parsed.duration_ms
                    self.stats.last_activity = datetime.now(timezone.utc)
                    # Capture token usage from result event (Claude)
                    self._capture_usage(parsed.raw or {})

                    if not result_text:
                        raw_keys = list((parsed.raw or {}).keys())
                        self._log.warning(
                            "session_empty_result",
                            result_event_keys=raw_keys,
                            has_result_field="result" in (parsed.raw or {}),
                            duration_ms=parsed.duration_ms,
                        )

                    # Diagnostic for the "Claude said it'll wait/report, then never
                    # replies again" symptom. A request/response turn cannot pause
                    # and resume itself: if the turn ends while a *background* task
                    # it launched (Bash run_in_background) is still open, nothing
                    # will ever re-invoke the agent when that task finishes — so the
                    # promised follow-up never comes. This is NOT a hang (the turn
                    # completed cleanly); it's the agent over-promising async work.
                    # Subagents are excluded — they're awaited within the turn and
                    # cleared on their tool_result. Grep ``turn_ended_with_open_background_task``
                    # to classify a "never replied" report without watching the spinner.
                    _open_bg = [v for v in managed_started.values() if v == "background_task"]
                    if _open_bg:
                        self._log.warning(
                            "turn_ended_with_open_background_task",
                            count=len(_open_bg),
                            cli_session=self.cli_session_id,
                            partial_result_len=len(result_text),
                        )

                    # For single-turn protocols, process exits after result → we're done
                    if not self._protocol.is_long_running():
                        self._mark_ready()
                        return result_text or ""

                    # For long-running, "result" is the final event
                    self._mark_ready()
                    if self._pending_restart:
                        self._pending_restart = False
                        self._log.debug("session_deferred_restart")
                        asyncio.ensure_future(self.restart())
                    return result_text or ""

                elif parsed.kind == "error":
                    self.stats.errors += 1
                    self._mark_ready()
                    # Protocols that classify (Claude) attach a structured
                    # AgentError; the others (Codex variants now route through
                    # _codex_error_event which also attaches one) — so this
                    # backstop only fires for any future protocol that emits
                    # a kind="error" ParsedEvent without populating .error.
                    err = parsed.error or generic_agent_error(parsed.text, parsed.raw)
                    # Uncategorized errors are a black box in the UI ("unknown
                    # error"). The classifiers extract what they can from the
                    # MESSAGE, but a Codex `systemError` often carries no message
                    # at all — so log the full raw event once here to capture
                    # whatever fields the agent DID send (auth/plan hints,
                    # nested codes). This is the only place the raw payload of an
                    # unknown error is preserved for triage.
                    if err.category == "unknown":
                        try:
                            self._log.warning(
                                "agent_error_uncategorized",
                                message=err.message[:200],
                                raw=json.dumps(parsed.raw)[:1500] if parsed.raw else None,
                                cli_session=self.cli_session_id,
                            )
                        except Exception:
                            self._log.debug("agent_error_uncategorized_log_failed", exc_info=True)
                    raise AgentTaskError(err)

                elif parsed.kind == "progress":
                    # Capture agent message text from completed items (both exec JSONL and app-server JSON-RPC)
                    raw = parsed.raw or {}
                    raw_method = str(raw.get("method", "") or "")
                    raw_method_norm = raw_method.replace(".", "/")
                    raw_type = raw.get("type", "")
                    # Capture context window and token usage from Codex events
                    self._capture_usage(raw)
                    is_delta = raw_method_norm in ("item/agentMessage/delta", "item/agent_message/delta")
                    # Only suppress text-streaming blocks — tool_use and thinking should be forwarded
                    _content = raw.get("message", {}).get("content", [{}]) if raw_type == "assistant" else []
                    _first_block = (_content[0] if isinstance(_content, list) and _content else _content) if _content else {}
                    _block_type = _first_block.get("type", "") if isinstance(_first_block, dict) else ""
                    is_text_block = raw_type == "assistant" and _block_type == "text"
                    # Codex emits completed `agent_message` items as narration between
                    # tool batches, each carrying full reply-like text. Capture them as
                    # the running result, but (like Claude's is_text_block, suppressed
                    # below) do NOT forward them as progress: reply text painted into
                    # the thinking bubble reads as "the answer started over from
                    # scratch" each time a new narration lands. Tool-call item/completed
                    # events stay forwardable (useful "Using tool: …" status).
                    is_agent_message_completed = False
                    if raw_type == "item.completed" or raw_method_norm == "item/completed":
                        item = raw.get("item") or raw.get("params", {}).get("item", {})
                        if item.get("type") in ("agent_message", "agentMessage") and item.get("text"):
                            result_text = item["text"]
                            is_agent_message_completed = True
                    # Also accumulate streaming deltas (app-server agentMessage/delta)
                    elif is_delta:
                        delta = raw.get("params", {}).get("delta", "")
                        if isinstance(delta, str):
                            result_text += delta
                    # Accumulate text from Claude assistant text blocks as fallback
                    # (the result event's text takes precedence if present)
                    elif is_text_block:
                        content = raw.get("message", {}).get("content", [])
                        if isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
                                    # Replace (not append) — each assistant event carries the full text block
                                    result_text = block["text"]
                    # Log all progress events at debug for diagnostics
                    self._log.debug(
                        "session_progress",
                        type=raw_type or raw_method_norm,
                        is_delta=is_delta,
                        is_text=is_text_block,
                        is_agent_message=is_agent_message_completed,
                        forwarded=bool(
                            on_progress
                            and parsed.text
                            and not is_delta
                            and not is_text_block
                            and not is_agent_message_completed
                        ),
                        text_len=len(parsed.text) if parsed.text else 0,
                        result_len=len(result_text),
                    )
                    if raw_type or raw_method_norm:
                        self._busy_last_action = raw_type or raw_method_norm
                    if parsed.text:
                        self._busy_last_detail = parsed.text[:200]
                    # ── Probe: log every tool_use block seen in the stream (temporary diagnostic) ──
                    if _block_type == "tool_use" and isinstance(_first_block, dict):
                        _probe_name = _first_block.get("name", "")
                        _probe_input = _first_block.get("input") or {}
                        _probe_keys = sorted(_probe_input.keys()) if isinstance(_probe_input, dict) else []
                        self._log.info("tool_use_seen", name=_probe_name, input_keys=_probe_keys)
                        # Tool is about to run → reopen the silent-gap window so
                        # the inactivity timeout extends until its result lands.
                        tool_inflight = True
                        # parsed.text here is the _describe_tool_use rendering
                        # ("Searching: …"); remember it to attribute the gap that
                        # follows the tool's result.
                        last_tool_detail = self._busy_last_detail

                    # ── Managed-process detection (subagents / background tasks) ──
                    # Scan ALL content blocks, not just block 0, so a tool_use
                    # preceded by text/thinking in the same assistant message is
                    # still caught. Emits a typed heartbeat the panel folds into a
                    # per-session "managed processes" list. Claude assistant events
                    # only (Codex tool-call shape differs); no-op when _content empty.
                    if on_progress and isinstance(_content, list):
                        for _blk in _content:
                            if not isinstance(_blk, dict) or _blk.get("type") != "tool_use":
                                continue
                            _name = _blk.get("name", "")
                            _inp = _blk.get("input") if isinstance(_blk.get("input"), dict) else {}
                            if _name in ("Task", "Agent"):
                                _kind = "subagent"
                            elif _name == "Bash" and _inp.get("run_in_background"):
                                _kind = "background_task"
                            else:
                                continue
                            # Full tool_use id — NOT a prefix: every Claude id
                            # starts with the same "toolu_01…" prefix, so a
                            # truncated key collides across all tools and the
                            # subagent would be closed by the next unrelated
                            # tool_result.
                            _tuid = str(_blk.get("id") or "")
                            if not _tuid or _tuid in managed_started:
                                continue
                            managed_started[_tuid] = _kind
                            if _kind == "subagent":
                                _label = str(_inp.get("description") or _inp.get("subagent_type") or "subagent")
                            else:
                                _label = str(_inp.get("command") or "background task")
                            _label = _label.replace("\t", " ").replace("\n", " ").strip()[:80]
                            try:
                                on_progress("managed_proc_started", f"{_kind}\t{_tuid}\t{_label}")
                            except Exception:
                                self._log.debug("managed_proc_emit_failed", exc_info=True)

                    # ── Tool gate: pause stdout reader until user approves ──
                    if tool_gate and _block_type == "tool_use" and isinstance(_first_block, dict):
                        gate_name = _first_block.get("name", "")
                        gate_input = _first_block.get("input") or {}
                        approved = await tool_gate(gate_name, gate_input if isinstance(gate_input, dict) else {})
                        if not approved:
                            self._log.info("tool_gate_denied", tool=gate_name)
                            self._mark_ready()
                            raise RuntimeError(f"Tool denied by user: {gate_name}")

                    # Only forward meaningful progress (tool use, thinking, status) —
                    # skip streaming text (Claude deltas/text blocks) and Codex
                    # completed agent_message narration (full reply-like text).
                    if (
                        on_progress
                        and parsed.text
                        and not is_delta
                        and not is_text_block
                        and not is_agent_message_completed
                    ):
                        on_progress("progress", parsed.text)

                else:
                    # "other" events — still capture usage/context info
                    self._capture_usage(parsed.raw or {})
                    # Claude emits tool_result as a type="user" event that falls
                    # through to here. We use it for two things: closing managed
                    # subagents, and re-stamping the busy markers off the finished
                    # tool onto the post-tool model gap.
                    _raw = parsed.raw or {}
                    if _raw.get("type") == "user":
                        _uc = _raw.get("message", {}).get("content", [])
                        if isinstance(_uc, list):
                            _saw_tool_result = False
                            for _b in _uc:
                                if not isinstance(_b, dict) or _b.get("type") != "tool_result":
                                    continue
                                _saw_tool_result = True
                                _rid = str(_b.get("tool_use_id") or "")
                                # Managed-process completion: a tracked tool_use_id
                                # ends a SUBAGENT. Background tasks ack their
                                # tool_result immediately while still running, so
                                # they are NOT closed here — they clear at turn end.
                                if on_progress and managed_started.get(_rid) == "subagent":
                                    managed_started.pop(_rid, None)
                                    try:
                                        on_progress("managed_proc_done", _rid)
                                    except Exception:
                                        self._log.debug("managed_proc_done_emit_failed", exc_info=True)
                            # Re-stamp the busy markers: the tool finished and we
                            # are now waiting on the model. A later idle-timeout
                            # then blames the post-tool gap, not the (done) tool.
                            if _saw_tool_result:
                                self._busy_last_action = "tool_result"
                                self._busy_last_detail = (
                                    f"its last tool result ({last_tool_detail})"
                                    if last_tool_detail
                                    else "its last tool result"
                                )

        except asyncio.TimeoutError:
            self.stats.errors += 1
            # Capture timing/context BEFORE _mark_ready() clears _busy_*.
            elapsed_total_s = (
                int((datetime.now(timezone.utc) - self._busy_started_at).total_seconds())
                if self._busy_started_at is not None
                else None
            )
            last_action = self._busy_last_action
            last_detail = self._busy_last_detail
            # Two regimes collapse to this timeout: a tool was still running
            # (long/blocking tool, bounded only by process liveness), vs. the
            # agent went silent *after* its last tool result and stayed quiet
            # past the (generous, pulsed) reasoning budget — a genuinely wedged
            # model/CLI stream with no tool to blame. Both re-arm with pulses up
            # to their cap; reaching here means the cap was actually exhausted,
            # so flag which regime for triage (they read identically otherwise).
            stall_kind = "tool_inflight" if tool_inflight else "agent_idle"
            # Report the budget that elapsed for this regime: the reasoning gap
            # when no tool was outstanding, else the full turn.
            budget_s = timeout if tool_inflight else idle_gap
            self._log.warning(
                "session_inactivity_timeout",
                timeout_s=budget_s,
                stall_kind=stall_kind,
                last_action=last_action,
                last_detail=last_detail,
                elapsed_total_s=elapsed_total_s,
                partial_result_len=len(result_text),
                cli_session=self.cli_session_id,
            )
            self._mark_ready()
            if tool_inflight:
                hint = (
                    f"a tool was still running ({last_detail or last_action or 'unknown tool'})"
                )
            else:
                # No tool outstanding: the model/CLI stream went quiet mid-turn.
                # `partial_result_len > 0` means it had started replying then
                # froze (classic upstream stream stall); 0 means it never began.
                started = (
                    "had started replying then went silent"
                    if result_text
                    else "no reply tokens received"
                )
                hint = (
                    f"agent went silent after {last_detail or last_action or 'its last step'} "
                    f"— the model/CLI step appears stalled ({started})"
                )
            raise RuntimeError(f"No response within {budget_s}s: {hint}")
        except asyncio.CancelledError:
            self._log.info("session_send_cancelled")
            raise
        finally:
            if self.state == SessionState.BUSY:
                # Cancellation may interrupt before the normal result/error path.
                self._mark_ready()

    def _capture_usage(self, raw: dict) -> None:
        """Extract token usage / context info from any event."""
        # Claude result: {"type": "result", "usage": {"input_tokens": ..., "output_tokens": ...}, "total_cost_usd": ...}
        usage = raw.get("usage")
        if isinstance(usage, dict):
            self.stats.input_tokens += usage.get("input_tokens", 0)
            self.stats.output_tokens += usage.get("output_tokens", 0)
            self.stats.cache_read_tokens += usage.get("cache_read_input_tokens", 0)
        cost = raw.get("total_cost_usd")
        if isinstance(cost, (int, float)):
            self.stats.cost_usd += cost

        # Codex task_started: {"method": "codex/event/task_started", "params": {"msg": {"model_context_window": 258400}}}
        method = str(raw.get("method", "") or "")
        method_norm = method.replace(".", "/")
        params = raw.get("params", {})
        if method_norm == "codex/event/task_started":
            msg = params.get("msg", {})
            ctx = msg.get("model_context_window", 0)
            if ctx:
                self.stats.context_window = ctx

        # Codex token_count: {"method": "codex/event/token_count", "params": {"msg": {"info": {...}}}}
        if method_norm == "codex/event/token_count":
            msg = params.get("msg", {})
            info = msg.get("info")
            if isinstance(info, dict):
                self.stats.input_tokens = info.get("input_tokens", self.stats.input_tokens)
                self.stats.output_tokens = info.get("output_tokens", self.stats.output_tokens)

    def _build_process_exit_error(self) -> str:
        """Human-readable reason for a subprocess that exited mid-turn.

        Pulls the exit code and the stderr tail so the failed turn says
        *why* it died instead of the old misleading "a tool was still
        running" — the logs showed ``last_error=null`` on every such kill.
        """
        code = self._process.returncode if self._process else None
        code_str = f"code {code}" if code is not None else "no exit code yet"
        tail = " | ".join(self._stderr_tail[-5:]).strip()
        if not tail and self._last_error:
            tail = str(self._last_error)
        base = f"Agent process exited ({code_str}) before finishing the turn"
        return f"{base}: {tail}" if tail else base

    async def _read_stdout(self) -> None:
        """Read stdout, parse JSON events into the response queue.

        On EOF (process exit) or an unexpected reader crash — but NOT on
        deliberate cancellation (stop()) — push ``_EOF_SENTINEL`` so a turn
        blocked on the queue wakes immediately and fails with the real reason
        rather than stalling until the next liveness poll.
        """
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
                        self._log.debug("session_identified", cli_session=self.cli_session_id)
                    await self._response_queue.put(event)
                except json.JSONDecodeError:
                    self._log.debug("session_stdout", text=text)
        except asyncio.CancelledError:
            return  # deliberate stop — leave the queue untouched
        except Exception as exc:
            self._log.error("session_reader_crashed", error=str(exc))
            self._last_error = f"stdout reader crashed: {exc}"
        # EOF or reader crash: wake any in-flight waiter so the turn fails now.
        # Unbounded queue → put_nowait can't realistically fail; guard anyway.
        try:
            self._response_queue.put_nowait(_EOF_SENTINEL)
        except asyncio.QueueFull:
            pass

    async def _read_stderr(self) -> None:
        """Read stderr for debug/error output.

        Collects the last few lines so they're available in _last_error
        when the process dies unexpectedly.
        """
        if not self._process or not self._process.stderr:
            return
        recent_lines: list[str] = []
        try:
            while True:
                line = await self._process.stderr.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if text:
                    self._log.debug("session_stderr", text=text)
                    recent_lines.append(text)
                    if len(recent_lines) > 10:
                        recent_lines.pop(0)
                    # Keep the live tail visible to _build_process_exit_error
                    # regardless of received-count, so a mid-turn exit can name
                    # its cause even on a session that answered earlier turns.
                    self._stderr_tail = list(recent_lines[-5:])
            # Process exited — store tail of stderr as last_error for diagnostics
            if recent_lines and self.stats.messages_received == 0:
                self._last_error = " | ".join(recent_lines[-5:])
        except asyncio.CancelledError:
            return

    def to_dict(self) -> dict:
        """Serialize session status for display and persistence."""
        total_tokens = self.stats.input_tokens + self.stats.output_tokens
        context_pct = round(total_tokens / self.stats.context_window * 100, 1) if self.stats.context_window else None
        return {
            "session_id": self.session_id,
            "cli_session_id": self.cli_session_id,
            # The engine binary this session actually runs (e.g. "claude" /
            # "codex"). Per-session — a multi-engine pool registers under a
            # single bridge-level agent_type ("claude-cli"), so consumers that
            # need the true engine of a *specific* session must read this, not
            # the bridge agent_type. See ws_agent_cmd._sync_cli_sessions_from_pool.
            "engine": self._command,
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
            "available_models": self.available_models,
            # Context usage
            "context_window": self.stats.context_window,
            "input_tokens": self.stats.input_tokens,
            "output_tokens": self.stats.output_tokens,
            "cache_read_tokens": self.stats.cache_read_tokens,
            "total_tokens": total_tokens,
            "context_pct": context_pct,
            "cost_usd": round(self.stats.cost_usd, 4) if self.stats.cost_usd else None,
            "workdir": self._workdir,
            "busy_started_at": self._busy_started_at.isoformat() if self._busy_started_at else None,
            "busy_action": self._busy_last_action,
            "busy_detail": self._busy_last_detail,
        }
