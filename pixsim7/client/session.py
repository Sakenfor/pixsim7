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
from typing import Callable, Optional

from pixsim7.client.log import get_logger

# Asyncio stream buffer limit for subprocess stdout/stderr.
# Codex app-server can emit large JSON lines (e.g. mcpServerStatus/list with
# full tool schemas exceeds 200KB). The asyncio default of 64KB is too small.
SUBPROCESS_STREAM_LIMIT = 1024 * 1024  # 1MB


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
        model: str | None = None,
        reasoning_effort: str | None = None,
        workdir: str | None = None,
        token_file_path: str | None = None,
    ):
        from pixsim7.client.protocols import get_protocol
        self.session_id = session_id
        self._extra_args = extra_args or []
        self._command = command
        self._protocol = get_protocol(command)
        self._system_prompt = system_prompt
        self._mcp_config_path = mcp_config_path
        self._resume_session_id = resume_session_id
        self._model = model
        self._reasoning_effort = reasoning_effort
        self._workdir = workdir
        self.token_file_path = token_file_path
        self._log = get_logger().bind(session=session_id)
        self._process: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._response_queue: asyncio.Queue[dict] = asyncio.Queue()
        self.state = SessionState.IDLE
        self.stats = SessionStats()
        self._last_error: Optional[str] = None
        self.cli_session_id: Optional[str] = None   # conversation UUID from init event
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
                    raise RuntimeError(message)
                return event.get("result", {})

            parsed = self._protocol.parse_event(event)
            if parsed.kind == "error":
                raise RuntimeError(parsed.text or f"{method} failed")
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
                    raise RuntimeError(parsed.text or "MCP startup failed")
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
                raise RuntimeError(parsed.text)
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
        self._log.info("session_stopped", sent=self.stats.messages_sent, received=self.stats.messages_received)

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
                    self._log.debug("session_identified", cli_session=self.cli_session_id, model=self.cli_model)

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
                    raise RuntimeError(f"Agent error: {parsed.text}")

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
                    if raw_type == "item.completed" or raw_method_norm == "item/completed":
                        item = raw.get("item") or raw.get("params", {}).get("item", {})
                        if item.get("type") in ("agent_message", "agentMessage") and item.get("text"):
                            result_text = item["text"]
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
                        forwarded=bool(on_progress and parsed.text and not is_delta and not is_text_block),
                        text_len=len(parsed.text) if parsed.text else 0,
                        result_len=len(result_text),
                    )
                    if raw_type or raw_method_norm:
                        self._busy_last_action = raw_type or raw_method_norm
                    if parsed.text:
                        self._busy_last_detail = parsed.text[:200]
                    # Only forward meaningful progress (tool use, thinking, status) — skip streaming text
                    if on_progress and parsed.text and not is_delta and not is_text_block:
                        on_progress("progress", parsed.text)

                else:
                    # "other" events — still capture usage/context info
                    self._capture_usage(parsed.raw or {})

        except asyncio.TimeoutError:
            self.stats.errors += 1
            self._mark_ready()
            raise RuntimeError(f"No response within {timeout}s")
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
                        self._log.debug("session_identified", cli_session=self.cli_session_id)
                    await self._response_queue.put(event)
                except json.JSONDecodeError:
                    self._log.debug("session_stdout", text=text)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            self._log.error("session_reader_crashed", error=str(exc))
            self._last_error = f"stdout reader crashed: {exc}"

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
                    self._log.debug("session_stderr", text=text)
        except asyncio.CancelledError:
            return

    def to_dict(self) -> dict:
        """Serialize session status for display and persistence."""
        total_tokens = self.stats.input_tokens + self.stats.output_tokens
        context_pct = round(total_tokens / self.stats.context_window * 100, 1) if self.stats.context_window else None
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
