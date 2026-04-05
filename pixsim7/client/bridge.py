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
import hashlib
import json
import os
import shutil
import subprocess as sp
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Optional
from urllib import parse as urlparse
from urllib import request as urlrequest

try:
    import websockets
    from websockets.asyncio.client import connect as ws_connect
except ImportError:
    websockets = None  # type: ignore
    ws_connect = None  # type: ignore

from pixsim7.client.agent_pool import AgentPool, SessionBusyError
from pixsim7.client.session import SessionState
from pixsim7.client.log import get_logger, redact_url
from pixsim7.client.token_manager import (
    TokenFile,
    build_mcp_env,
    write_claude_mcp_config,
    write_codex_mcp_config,
)


class Bridge:
    """WebSocket bridge between local agent pool and pixsim backend."""

    def __init__(
        self,
        pool: AgentPool,
        url: str = "ws://localhost:8000/api/v1/ws/agent-cmd",
        agent_type: str | None = None,
        shared: bool = False,
        hook_port: int = 0,
    ):
        self._pool = pool
        self._url = url
        self._shared = shared
        # Derive agent_type from pool command name (e.g. "claude", "codex")
        self._agent_type = agent_type or pool._prefix or "claude"
        self._bridge_client_id_file = self._resolve_bridge_client_id_file()
        self._bridge_client_id: Optional[str] = self._load_persistent_bridge_client_id()
        self._connected = False
        self._tasks_handled = 0
        self._buffered_results: dict[str, dict] = {}  # task_id -> result msg (buffer for WS failures)
        self._mcp_config_path: Optional[str] = None
        self._token_file: Optional[TokenFile] = None
        self._system_prompt: Optional[str] = None
        # Cache: frozenset of focus contract IDs -> MCP config temp file path
        self._mcp_config_cache: dict[frozenset[str], str] = {}
        # Per-focus Codex project workdirs with local .codex/config.toml
        self._codex_workdir_cache: dict[tuple[str, tuple[str, ...]], str] = {}
        self._mcp_scope: str = "dev"
        self._mcp_python_runtime: Optional[tuple[str, list[str]]] = None
        self._service_token: str = ""
        # Pending confirmation responses from backend: confirmation_id -> asyncio.Event + result
        self._pending_confirmations: dict[str, asyncio.Event] = {}
        self._confirmation_results: dict[str, dict] = {}  # confirmation_id -> {approved, choice?, text?}
        # Active WebSocket reference for hook server callbacks
        self._active_ws = None
        self._hook_server = None
        self._hook_port = hook_port
        # HTTP MCP server
        self._mcp_server_task: asyncio.Task | None = None
        self._mcp_http_port: int = 9100
        self._mcp_http_url: str | None = None
        self._repo_root: Path = Path(__file__).resolve().parents[2]

    @staticmethod
    def _get_valid_token() -> Optional[str]:
        """Read stored login token, returning None if missing or expired."""
        from pixsim7.client.auth import get_stored_token
        token = get_stored_token()
        if not token:
            return None
        try:
            import base64, json, time
            payload = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
            exp = payload.get("exp", 0)
            if exp and exp < time.time():
                return None
        except Exception:
            pass
        return token

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def bridge_client_id(self) -> Optional[str]:
        return self._bridge_client_id

    @staticmethod
    def _normalize_bridge_id_namespace(raw: str) -> str:
        text = str(raw or "").strip()
        if not text:
            return ""
        normalized = "".join(ch if (ch.isalnum() or ch in "-_") else "_" for ch in text)
        normalized = normalized.strip("_-")
        return normalized[:64]

    def _resolve_bridge_client_id_file(self) -> Path:
        """Resolve persistent bridge-id path (supports namespaced future multi-bridge)."""
        explicit = str(os.environ.get("PIXSIM_BRIDGE_ID_FILE") or "").strip()
        if explicit:
            try:
                return Path(explicit).expanduser()
            except Exception:
                pass

        namespace = self._normalize_bridge_id_namespace(
            os.environ.get("PIXSIM_BRIDGE_ID_NAMESPACE") or ""
        )
        if namespace:
            return Path.home() / ".pixsim" / f"bridge_id_{namespace}"

        return Path.home() / ".pixsim" / "bridge_id"

    def _load_persistent_bridge_client_id(self) -> Optional[str]:
        """Load stable bridge identity from configured bridge-id file if present."""
        path = self._bridge_client_id_file
        try:
            raw = path.read_text(encoding="utf-8").strip()
        except OSError:
            return None
        if not raw:
            return None
        # Keep IDs path/query safe and bounded.
        if len(raw) > 120:
            return None
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_:")
        if any(ch not in allowed for ch in raw):
            return None
        return raw

    def _persist_bridge_client_id(self, bridge_client_id: str) -> None:
        """Persist stable bridge identity for process restarts."""
        if not bridge_client_id:
            return
        try:
            self._bridge_client_id_file.parent.mkdir(parents=True, exist_ok=True)
            self._bridge_client_id_file.write_text(bridge_client_id, encoding="utf-8")
            try:
                os.chmod(str(self._bridge_client_id_file), 0o600)
            except OSError:
                pass
        except OSError:
            return

    async def run(self) -> None:
        """Main loop — connect, handle tasks, reconnect on failure."""
        if websockets is None:
            get_logger().error("missing_dependency", package="websockets", hint="pip install websockets")
            return

        # Start hook HTTP server for Claude Code PreToolUse integration
        from pixsim7.client.hook_server import HookServer
        self._hook_server = HookServer(confirm_fn=self._hook_confirm)
        hook_port = await self._hook_server.start(port=self._hook_port)
        get_logger().info("hook_server_ready", port=hook_port)

        # Start shared HTTP MCP server (replaces per-session STDIO subprocesses)
        self._mcp_server_task = asyncio.create_task(self._start_mcp_http_server())
        # Give it a moment to bind
        await asyncio.sleep(0.3)

        self._shutdown_requested = False
        consecutive_failures = 0
        try:
            while not self._shutdown_requested:
                try:
                    await self._connect_and_serve()
                    consecutive_failures = 0  # reset on clean disconnect
                except KeyboardInterrupt:
                    break
                except Exception as e:
                    self._connected = False
                    if self._shutdown_requested:
                        get_logger().info("shutdown_requested", reason="reconnect_suppressed")
                        break
                    consecutive_failures += 1
                    delay = min(5 * consecutive_failures, 30)  # 5s, 10s, 15s... max 30s
                    get_logger().error("connection_error", error=str(e))
                    get_logger().info("reconnecting", delay_s=delay, attempt=consecutive_failures)
                    await asyncio.sleep(delay)
        finally:
            await self._hook_server.stop()
            if self._mcp_server_task and not self._mcp_server_task.done():
                self._mcp_server_task.cancel()
                try:
                    await self._mcp_server_task
                except (asyncio.CancelledError, Exception):
                    pass

    async def _connect_and_serve(self) -> None:
        """Single connection session."""
        # Append query params — use & if URL already has ? (e.g. ?token=...)
        sep = "&" if "?" in self._url else "?"
        ws_url = f"{self._url}{sep}agent_type={self._agent_type}"
        # User-scoped bridge: include stored login token (unless --shared)
        if not self._shared:
            login_token = self._get_valid_token()
            if login_token:
                ws_url += f"&token={login_token}"
        # Reconnect with same identity so backend maps back to the same bridge client
        if self._bridge_client_id:
            ws_url += f"&bridge_client_id={self._bridge_client_id}"
        # Send model info if known from any pool session
        pool_model = next(
            (s.cli_model for s in self._pool.sessions if s.cli_model), None
        )
        if pool_model:
            ws_url += f"&model={pool_model}"

        get_logger().info("connecting", url=redact_url(self._url))

        async with ws_connect(
            ws_url,
            ping_interval=None,  # disabled — app-level heartbeats handle liveness
            close_timeout=10,
            max_size=5 * 1024 * 1024,  # 5MB — default 1MB is tight when payloads carry base64 images
        ) as ws:
            # Welcome message
            welcome = json.loads(await ws.recv())
            connected_bridge_client_id = str(welcome.get("bridge_client_id") or "").strip()
            if not connected_bridge_client_id:
                connected_bridge_client_id = f"{self._agent_type}-{uuid.uuid4().hex[:8]}"
            if connected_bridge_client_id != self._bridge_client_id:
                if self._bridge_client_id:
                    get_logger().warning(
                        "bridge_id_changed",
                        old=self._bridge_client_id,
                        new=connected_bridge_client_id,
                    )
                self._persist_bridge_client_id(connected_bridge_client_id)
            self._bridge_client_id = connected_bridge_client_id
            self._connected = True
            self._active_ws = ws

            # Determine scope: user-scoped bridge vs shared/dev bridge
            user_id = welcome.get("user_id")
            scope = "user" if user_id else "dev"
            self._mcp_scope = scope
            service_token = welcome.get("service_token", "")
            self._service_token = str(service_token or "")

            # Extract system prompt and generate MCP config
            server_system_prompt = welcome.get("system_prompt")
            mcp_config_path = self._ensure_mcp_config(scope=scope, token=service_token)

            if server_system_prompt:
                self._system_prompt = server_system_prompt
            if server_system_prompt or mcp_config_path:
                await self._pool.configure(
                    system_prompt=server_system_prompt,
                    mcp_config_path=mcp_config_path,
                )
                if server_system_prompt:
                    get_logger().debug("system_prompt_loaded", chars=len(server_system_prompt))
                if mcp_config_path:
                    get_logger().debug("mcp_config_loaded", path=mcp_config_path)

            # Report pool capacity to backend
            await self._send_pool_status(ws)

            # Report available models from pool sessions (if any)
            await self._report_models(ws)

            get_logger().info("connected", bridge_id=self._bridge_client_id)
            get_logger().info("pool_status", ready=self._pool.ready_count, busy=self._pool.busy_count, max=self._pool._max_sessions)

            # Replay any buffered results from tasks that completed while WS was dead
            if self._buffered_results:
                get_logger().info("replaying_buffered", count=len(self._buffered_results))
                for task_id, result_msg in list(self._buffered_results.items()):
                    try:
                        await ws.send(json.dumps(result_msg))
                        self._buffered_results.pop(task_id, None)
                        get_logger().debug("buffered_replayed", task=task_id[:8])
                    except Exception as e:
                        get_logger().error("buffered_replay_failed", task=task_id[:8], error=str(e))
                        break  # WS already broken again — stop trying

            get_logger().info("waiting_for_tasks")

            # Background task: send idle heartbeats for alive sessions
            idle_hb_task = asyncio.create_task(self._idle_heartbeat_loop(ws))
            try:
                while True:
                    raw = await ws.recv()
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")

                    if msg_type == "shutdown":
                        get_logger().info("shutdown_requested")
                        self._shutdown_requested = True
                        return

                    if msg_type == "task":
                        # Fire-and-forget — don't block the message loop
                        # so concurrent tasks can be dispatched to different pool sessions
                        asyncio.ensure_future(self._handle_task(ws, msg))

                    elif msg_type == "confirmation_response":
                        # User responded to a prompt — unblock the waiting task
                        conf_id = msg.get("confirmation_id", "")
                        if conf_id and conf_id in self._pending_confirmations:
                            self._confirmation_results[conf_id] = {
                                "approved": bool(msg.get("approved", False)),
                                "choice": msg.get("choice"),
                                "text": msg.get("text"),
                            }
                            self._pending_confirmations[conf_id].set()

                    elif msg_type == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
            finally:
                idle_hb_task.cancel()
                try:
                    await idle_hb_task
                except asyncio.CancelledError:
                    pass

    async def _send_pool_status(self, ws) -> None:
        """Send current pool session info to backend."""
        await ws.send(json.dumps({
            "type": "pool_status",
            "max_sessions": self._pool._max_sessions,
            "ready": self._pool.ready_count,
            "busy": self._pool.busy_count,
            "total": len(self._pool._sessions),
            "engines": [e.split("/")[-1].split("\\")[-1] for e in self._pool._engines],
            "sessions": [s.to_dict() for s in self._pool.sessions],
        }))

    async def _idle_heartbeat_loop(self, ws) -> None:
        """Send periodic heartbeats for alive idle sessions.

        Keeps sessions visible in the backend's agent_session_registry
        even when no tasks are being processed. Uses ``cli_session`` action
        which is in _KEEPALIVE_ACTIONS — keeps sessions from expiring
        without resetting last_real_activity (so idle detection still works).
        """
        try:
            while True:
                await asyncio.sleep(60)
                for session in self._pool.sessions:
                    if not session.is_alive or not session.cli_session_id:
                        continue
                    if session.state == SessionState.BUSY:
                        continue  # active tasks send their own heartbeats
                    try:
                        await ws.send(json.dumps({
                            "type": "heartbeat",
                            "status": "active",
                            "action": "cli_session",
                            "detail": "idle",
                            "bridge_session_id": session.cli_session_id,
                        }))
                    except Exception:
                        return  # connection lost
        except asyncio.CancelledError:
            return

    async def _report_models(self, ws) -> None:
        """Probe engines for available models and report to backend.

        Uses lightweight probes (initialize + model/list only, no thread/MCP)
        for engines that support it. Sessions are stopped immediately after.
        """
        from pixsim7.client.protocols import get_protocol
        for engine in self._pool._engines:
            engine_name = engine.split("/")[-1].split("\\")[-1]
            models = await self._probe_models(engine)
            # Fallback to static model list for engines that don't support probes
            if not models:
                protocol = get_protocol(engine_name)
                models = protocol.static_models()
            if models:
                await ws.send(json.dumps({
                    "type": "models_available",
                    "agent_type": engine_name,
                    "models": models,
                }))
                get_logger().info("models_reported", engine=engine_name, count=len(models))

    async def _probe_models(self, engine: str) -> list[dict]:
        """Lightweight model probe — initialize + model/list, no thread or MCP."""
        try:
            return await asyncio.wait_for(self._probe_models_impl(engine), timeout=15)
        except asyncio.TimeoutError:
            get_logger().warning("model_probe_timeout", engine=engine)
            return []
        except Exception as e:
            get_logger().warning("model_probe_failed", engine=engine, error=str(e))
            return []

    async def _probe_models_impl(self, engine: str) -> list[dict]:
        if not shutil.which(engine):
            return []

        from pixsim7.client.protocols import get_protocol
        protocol = get_protocol(engine)

        if not (hasattr(protocol, 'needs_jsonrpc_init') and protocol.needs_jsonrpc_init()):
            return []

        resolved = shutil.which(engine) or engine
        cmd = protocol.build_start_cmd(resolved)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )

        import json as _json
        try:
            # Send initialize + model/list back to back
            msgs = _json.dumps({
                "jsonrpc": "2.0", "method": "initialize",
                "params": {"clientInfo": {"name": "pixsim-probe", "version": "1.0"}, "capabilities": {"experimentalApi": True}},
                "id": 0,
            }) + "\n" + _json.dumps({
                "jsonrpc": "2.0", "method": "model/list",
                "params": {"includeHidden": True}, "id": 1,
            }) + "\n"
            proc.stdin.write(msgs.encode())
            await proc.stdin.drain()

            # Read lines until we get model/list response (id=1)
            while True:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=10)
                if not line:
                    break
                try:
                    d = _json.loads(line.decode(errors="replace").strip())
                    if d.get("id") == 1 and "result" in d:
                        raw_models = d["result"].get("data", [])
                        return [
                            {
                                "id": m.get("id", ""),
                                "model": m.get("model", m.get("id", "")),
                                "label": m.get("displayName", m.get("id", "")),
                                "is_default": m.get("isDefault", False),
                                "hidden": m.get("hidden", False),
                                "input_modalities": m.get("inputModalities", []),
                            }
                            for m in raw_models if isinstance(m, dict)
                        ]
                except _json.JSONDecodeError:
                    pass
            return []
        finally:
            if proc.stdin:
                try:
                    proc.stdin.close()
                except Exception:
                    pass
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=3)
            except asyncio.TimeoutError:
                proc.kill()
            # Close pipe transports to prevent Windows ProactorEventLoop
            # ResourceWarning spam on GC
            for pipe in (proc.stdin, proc.stdout, proc.stderr):
                if pipe is None:
                    continue
                transport = getattr(pipe, '_transport', getattr(pipe, 'transport', None))
                if transport and not getattr(transport, '_closing', False):
                    try:
                        transport.close()
                    except Exception:
                        pass

    def _ensure_mcp_config(
        self,
        scope: str = "dev",
        token: str = "",
        focus: list[str] | None = None,
    ) -> Optional[str]:
        """Generate MCP config file pointing to the pixsim MCP server.

        When the HTTP MCP server is running, generates an HTTP-based config
        (url + headers). Falls back to STDIO config (command + args) otherwise.

        If ``focus`` is provided (list of contract IDs), generates a scoped
        config.  Focused configs are cached by contract-set to reuse the file.
        """
        mcp_scope = ",".join(focus) if focus else scope

        # ── HTTP mode: shared MCP server is running ──
        if self._mcp_http_url:
            cache_key = frozenset(focus) if focus else frozenset({"__default__"})
            cached = self._mcp_config_cache.get(cache_key)
            if cached and os.path.exists(cached):
                return cached

            from pixsim7.client.token_manager import write_claude_mcp_http_config
            effective_token = token
            if not effective_token and self._token_file:
                effective_token = self._token_file.read()
            path = write_claude_mcp_http_config(
                mcp_url=self._mcp_http_url,
                api_token=effective_token,
                scope=mcp_scope,
            )
            self._mcp_config_cache[cache_key] = path
            if not focus:
                self._mcp_config_path = path
            return path

        # ── STDIO fallback: spawn MCP server per session ──
        if focus:
            cache_key = frozenset(focus)
            cached = self._mcp_config_cache.get(cache_key)
            if cached and os.path.exists(cached):
                return cached

        if not focus and self._mcp_config_path and os.path.exists(self._mcp_config_path):
            return self._mcp_config_path

        api_base = self._ws_url_to_http_base()
        mcp_server_script = self._mcp_server_script_path()
        if not self._mcp_python_runtime:
            self._mcp_python_runtime = self._resolve_mcp_python()
        mcp_python_cmd, mcp_python_prefix = self._mcp_python_runtime

        if not self._token_file:
            self._token_file = TokenFile.create(seed_token=token, prefix="pixsim-mcp")

        env = build_mcp_env(
            api_base=api_base,
            token_file=self._token_file,
            scope=mcp_scope,
            api_token=token,
        )
        path = write_claude_mcp_config(
            env,
            python_cmd=mcp_python_cmd,
            python_prefix=mcp_python_prefix,
            mcp_server_script=mcp_server_script,
        )

        if focus:
            self._mcp_config_cache[frozenset(focus)] = path
            get_logger().debug("mcp_config_focused", scope=mcp_scope, path=path)
        else:
            self._mcp_config_path = path

        return path

    def _ws_url_to_http_base(self) -> str:
        """Derive HTTP base URL from WebSocket URL."""
        api_url = self._url
        for ws_scheme, http_scheme in [("wss://", "https://"), ("ws://", "http://")]:
            if api_url.startswith(ws_scheme):
                api_url = http_scheme + api_url[len(ws_scheme):]
                break
        return api_url.split("/api/")[0] if "/api/" in api_url else api_url

    @staticmethod
    def _mcp_server_script_path() -> str:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_server.py")

    @staticmethod
    def _resolve_mcp_python() -> tuple[str, list[str]]:
        """Find a Python runtime that can import MCP dependencies.

        Bridge/runtime environments sometimes differ. We probe candidate
        interpreters so Codex MCP config points to one that can run mcp_server.py.
        """
        candidates: list[tuple[str, list[str]]] = []
        seen: set[tuple[str, tuple[str, ...]]] = set()

        def add_candidate(cmd: str | None, prefix: list[str] | None = None) -> None:
            if not cmd:
                return
            key = (cmd, tuple(prefix or []))
            if key in seen:
                return
            seen.add(key)
            candidates.append((cmd, list(prefix or [])))

        # Explicit override for debugging/deploy environments.
        add_candidate(os.environ.get("PIXSIM_MCP_PYTHON"))

        # Prefer current runtime first.
        add_candidate(sys.executable)

        # Then fall back to common Python launchers on PATH.
        add_candidate(shutil.which("python"))
        add_candidate(shutil.which("python3"))
        py_launcher = shutil.which("py")
        if py_launcher:
            add_candidate(py_launcher, ["-3"])
            add_candidate(py_launcher)

        probe_code = "import mcp, httpx"
        for cmd, prefix in candidates:
            try:
                result = sp.run(
                    [cmd, *prefix, "-c", probe_code],
                    capture_output=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    return cmd, prefix
            except Exception:
                continue

        # Keep behavior predictable if probes fail unexpectedly.
        get_logger().warning("mcp_python_fallback", fallback=sys.executable)
        return sys.executable, []

    @staticmethod
    def _normalize_contract_id(value: str) -> str:
        return str(value or "").strip().replace("_", ".").lower()

    def _fetch_contract_tool_names(
        self,
        *,
        api_base: str,
        token: str,
        scope: str,
    ) -> list[dict] | None:
        """Fetch contracts index including precomputed tool names."""
        params: dict[str, str] = {}
        if scope in {"user", "dev"}:
            params["audience"] = scope
        query = f"?{urlparse.urlencode(params)}" if params else ""
        url = f"{api_base.rstrip('/')}/api/v1/meta/contracts{query}"
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urlrequest.Request(url=url, headers=headers, method="GET")
        try:
            with urlrequest.urlopen(req, timeout=8) as resp:
                if resp.status != 200:
                    get_logger().warning("contract_fetch_failed", status=resp.status)
                    return None
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            get_logger().warning("contract_fetch_failed", error=str(e))
            return None

        contracts = payload.get("contracts", [])
        return contracts if isinstance(contracts, list) else None

    def _resolve_codex_enabled_tools(
        self,
        *,
        api_base: str,
        token: str,
        scope: str,
        focus: list[str],
    ) -> list[str] | None:
        """Resolve focused enabled_tools values from contract metadata."""
        contracts = self._fetch_contract_tool_names(api_base=api_base, token=token, scope=scope)
        if contracts is None:
            return None

        include_contract_ids = {
            self._normalize_contract_id(contract_id)
            for contract_id in focus
            if str(contract_id or "").strip()
        }
        include_contract_ids.update({"plans.management", "project.files"})

        seen: set[str] = set()
        enabled: list[str] = []

        def add_tool(name: str) -> None:
            key = str(name or "").strip()
            if not key or key in seen:
                return
            seen.add(key)
            enabled.append(key)

        for builtin in ("register_session", "log_work", "call_api"):
            add_tool(builtin)

        for contract in contracts:
            contract_id = self._normalize_contract_id(contract.get("id", ""))
            if contract_id not in include_contract_ids:
                continue
            for tool_name in contract.get("tool_names", []):
                if isinstance(tool_name, str):
                    add_tool(tool_name)

        return enabled

    def _ensure_codex_project_workdir(
        self,
        mcp_server_script: str,
        api_base: str,
        token: str,
        token_file: str,
        scope: str,
        *,
        mcp_python_cmd: str,
        mcp_python_prefix: list[str],
        focus: list[str] | None = None,
    ) -> str | None:
        """Write focus-scoped .codex/config.toml and return launch workdir.

        This avoids touching global ~/.codex/config.toml. Each focus set gets
        an isolated workdir under the repo with its own project config layer.
        """
        normalized_focus = tuple(
            sorted({
                self._normalize_contract_id(contract_id)
                for contract_id in (focus or [])
                if str(contract_id or "").strip()
            })
        )
        cache_key = (scope, normalized_focus)

        enabled_tools: list[str] | None = None
        if focus is not None:
            enabled_tools = self._resolve_codex_enabled_tools(
                api_base=api_base,
                token=token,
                scope=scope,
                focus=focus,
            )
            if enabled_tools is None:
                return None

        cached_workdir = self._codex_workdir_cache.get(cache_key)
        if cached_workdir:
            config_path = Path(cached_workdir) / ".codex" / "config.toml"
            if config_path.exists():
                return cached_workdir

        try:
            focus_seed = ",".join(normalized_focus) if normalized_focus else "all"
            focus_hash = hashlib.sha1(f"{scope}|{focus_seed}".encode("utf-8")).hexdigest()[:12]
            workdir = self._repo_root / ".pixsim-codex" / f"{scope}-{focus_hash}"

            env = build_mcp_env(
                api_base=api_base,
                token_file=token_file,
                scope=scope,
                api_token=token,
            )
            config_path = write_codex_mcp_config(
                env,
                python_cmd=mcp_python_cmd,
                python_prefix=mcp_python_prefix,
                mcp_server_script=mcp_server_script,
                enabled_tools=enabled_tools,
                workdir=str(workdir),
            )
            get_logger().debug("codex_config_prepared", path=str(config_path))
            self._codex_workdir_cache[cache_key] = str(workdir)
            return str(workdir)
        except Exception as e:
            get_logger().error("codex_config_failed", error=str(e))
            return None

    @staticmethod
    def _extract_task_meta(msg: dict) -> dict:
        """Extract routing and heartbeat metadata from a task payload.

        Centralises the scattered msg.get() calls so adding new fields
        means one touch-point instead of five.
        """
        _str = lambda key: str(msg.get(key) or "").strip() or None  # noqa: E731

        from pixsim7.common.scope_helpers import parse_scope_key

        ctx = msg.get("context") or {}
        scope_key = _str("scope_key")
        plan_id = ctx.get("plan_id") if isinstance(ctx, dict) else None
        if not plan_id:
            parsed_plan, _ = parse_scope_key(scope_key)
            if parsed_plan:
                plan_id = parsed_plan

        focus_raw = msg.get("focus")
        focus = (
            [str(f).strip() for f in focus_raw if str(f).strip()]
            if isinstance(focus_raw, list) and focus_raw
            else None
        )

        model = _str("model")
        if model and model.lower() == "default":
            model = None
        elif model and ":" in model:
            model = model.split(":", 1)[1]  # strip provider prefix

        profile_config = msg.get("profile_config") or {}

        return {
            "bridge_session_id": msg.get("bridge_session_id"),
            "session_policy": _str("session_policy"),
            "scope_key": scope_key,
            "engine": msg.get("engine"),
            "model": model,
            "reasoning_effort": profile_config.get("reasoning_effort"),
            "focus": focus,
            "task_kind": _str("task_kind"),
            "plan_id": plan_id,
            "profile_prompt": msg.get("profile_prompt"),
        }

    @staticmethod
    def _format_task_error(error: BaseException) -> dict:
        """Normalize low-level task errors into actionable structured data."""
        text = str(error or "").strip() or error.__class__.__name__
        if isinstance(error, SessionBusyError):
            return {
                "error": text,
                "error_code": error.error_code,
                "error_details": error.error_details,
            }
        if "Scoped session '" in text and " is busy" in text:
            return {
                "error": (
                    f"{text} Wait for the previous response in this tab to finish, "
                    f"or cancel it and retry."
                ),
                "error_code": "scoped_session_busy",
                "error_details": {},
            }
        return {"error": text, "error_code": "task_error", "error_details": {}}

    async def _handle_task(self, ws, msg: dict) -> None:
        """Handle an incoming task from the backend."""
        task_id = msg.get("task_id", "?")
        task_type = msg.get("task", "unknown")
        prompt = msg.get("instruction") or msg.get("prompt", "")

        meta = self._extract_task_meta(msg)
        get_logger().info("task_received", task=task_id[:8], type=task_type, engine=meta["engine"], model=meta["model"])

        # Per-request user token — passed to pool.send_message() which writes
        # it to the target session's isolated token file (no shared file race)
        user_token = msg.get("user_token")

        # Focus handling:
        # - Claude: per-session temp MCP config
        # - Codex: project-local .codex/config.toml selected by workdir
        mcp_config_override = None
        codex_workdir = None
        if meta["engine"] == "codex":
            if self._token_file:
                api_base = self._ws_url_to_http_base()
                mcp_server_script = self._mcp_server_script_path()
                if not self._mcp_python_runtime:
                    self._mcp_python_runtime = self._resolve_mcp_python()
                mcp_python_cmd, mcp_python_prefix = self._mcp_python_runtime
                codex_workdir = self._ensure_codex_project_workdir(
                    mcp_server_script,
                    api_base,
                    str(user_token or self._service_token or ""),
                    self._token_file.path,
                    self._mcp_scope,
                    mcp_python_cmd=mcp_python_cmd,
                    mcp_python_prefix=mcp_python_prefix,
                    focus=meta["focus"],
                )
        elif meta["focus"]:
            mcp_config_override = self._ensure_mcp_config(focus=meta["focus"])

        # On first message of a new conversation, inject persona + token.
        # Resumed conversations already have these in history.
        if not meta["bridge_session_id"]:
            preamble_parts: list[str] = []
            # System context: Claude gets it via --append-system-prompt (pool-level),
            # so only inject in preamble for engines that lack CLI flag support (Codex).
            engine = meta.get("engine") or ""
            if self._system_prompt and engine not in ("claude", ""):
                preamble_parts.append(f"[System context]\n{self._system_prompt}")
            if meta["profile_prompt"]:
                preamble_parts.append(f"[Persona: {meta['profile_prompt']}]")
            if user_token:
                preamble_parts.append(
                    f"[Agent Token]\n"
                    f"Use this token for PixSim MCP tools. Your MCP tools are already configured with it.\n"
                    f"Token: {user_token}"
                )
            if preamble_parts:
                prompt = "\n\n".join(preamble_parts) + "\n\n" + prompt

        # Write chat session ID to sidecar so the shared HTTP MCP server can
        # attribute log_work and other tools to the correct session.
        if meta["bridge_session_id"]:
            try:
                from pathlib import Path
                sidecar_path = Path.home() / ".pixsim" / "bridge_chat_session"
                sidecar_path.parent.mkdir(parents=True, exist_ok=True)
                sidecar_path.write_text(meta["bridge_session_id"])
            except OSError:
                pass

        # Report busy (use original user text, not persona-prefixed prompt)
        user_text = msg.get("instruction") or msg.get("prompt", "")
        hb_base: dict[str, object] = {"type": "heartbeat", "task_id": task_id, "status": "active"}
        if meta["bridge_session_id"]:
            hb_base["bridge_session_id"] = meta["bridge_session_id"]
        if meta["plan_id"]:
            hb_base["plan_id"] = meta["plan_id"]
        if meta["task_kind"]:
            hb_base["task_kind"] = meta["task_kind"]
        await ws.send(json.dumps({
            **hb_base,
            "action": "processing_task",
            "detail": user_text[:100],
        }))

        try:
            try:
                timeout = int(msg.get("timeout", 120))
            except (TypeError, ValueError):
                timeout = 120
            timeout = max(10, min(timeout, 900))

            # Images: either pre-encoded base64 or local file paths to read
            images = msg.get("images")  # [{media_type, data}] — already base64
            image_paths = msg.get("image_paths")  # [{path, media_type}] — local files

            if image_paths and not images:
                images = self._read_local_images(image_paths)

            # Progress callback - sends heartbeats with live status
            last_detail = user_text[:100] or "Working..."

            async def send_progress(event_type: str, detail: str):
                try:
                    await ws.send(json.dumps({
                        **hb_base,
                        "action": event_type,
                        "detail": detail,
                    }))
                except Exception:
                    pass

            keepalive_done = asyncio.Event()

            async def send_keepalive():
                """Emit periodic heartbeats so backend does not time out on quiet turns."""
                while not keepalive_done.is_set():
                    await asyncio.sleep(15)
                    if keepalive_done.is_set():
                        break
                    try:
                        await ws.send(json.dumps({
                            **hb_base,
                            "action": "processing_task",
                            "detail": last_detail,
                        }))
                    except Exception:
                        pass

            def on_progress(event_type: str, detail: str):
                nonlocal last_detail
                if detail:
                    last_detail = detail[:200]
                asyncio.ensure_future(send_progress(event_type, detail))

            keepalive_task = asyncio.create_task(send_keepalive())
            try:
                session_id, response = await self._pool.send_message(
                    prompt, timeout=timeout, images=images, on_progress=on_progress,
                    bridge_session_id=meta["bridge_session_id"],
                    engine=meta["engine"],
                    model=meta["model"],
                    reasoning_effort=meta["reasoning_effort"],
                    session_policy=meta["session_policy"],
                    scope_key=meta["scope_key"],
                    mcp_config_path=mcp_config_override,
                    workdir=codex_workdir,
                    user_token=user_token,
                )
                self._tasks_handled += 1

                # Get conversation session UUID for resume support
                session = next((s for s in self._pool.sessions if s.session_id == session_id), None)
                bridge_session_id = session.cli_session_id if session else None

                get_logger().info("task_complete", task=task_id[:8], session=session_id, chars=len(response))

                result_msg: dict = {
                    "type": "result",
                    "task_id": task_id,
                    "edited_prompt": response,
                }
                if bridge_session_id:
                    result_msg["bridge_session_id"] = bridge_session_id
                # Include the original session ID from the task for linking
                original_session_id = meta.get("bridge_session_id")
                if original_session_id and original_session_id != bridge_session_id:
                    result_msg["original_session_id"] = original_session_id
                try:
                    await ws.send(json.dumps(result_msg))
                except Exception:
                    # WS dead — buffer result for replay on reconnect
                    self._buffered_results[task_id] = result_msg
                    get_logger().warning("ws_dead_buffered", task=task_id[:8], chars=len(response))
                    return

                # Report updated pool status (new sessions may have spawned)
                await self._send_pool_status(ws)
            finally:
                keepalive_done.set()
                keepalive_task.cancel()
                try:
                    await keepalive_task
                except asyncio.CancelledError:
                    pass

        except Exception as e:
            error_payload = self._format_task_error(e)
            get_logger().error(
                "task_error",
                task=task_id[:8],
                error=error_payload["error"],
                error_code=error_payload["error_code"],
            )
            error_msg = {
                "type": "error",
                "task_id": task_id,
                "error": error_payload["error"],
                "error_code": error_payload["error_code"],
                "error_details": error_payload["error_details"],
            }
            try:
                await ws.send(json.dumps(error_msg))
            except Exception:
                # WS dead — buffer error for replay on reconnect
                self._buffered_results[task_id] = error_msg
                get_logger().warning("ws_dead_buffered_error", task=task_id[:8])

    @staticmethod
    def _read_local_images(image_paths: list[dict]) -> list[dict]:
        """Read local image files and return base64-encoded content blocks."""
        import base64
        from pathlib import Path

        images = []
        for entry in image_paths:
            try:
                path = Path(entry["path"])
                if not path.exists() or path.stat().st_size > 5_000_000:
                    continue
                data = base64.b64encode(path.read_bytes()).decode("ascii")
                images.append({
                    "media_type": entry.get("media_type", "image/png"),
                    "data": data,
                })
            except Exception:
                continue
        return images

    async def _start_mcp_http_server(self) -> None:
        """Start the shared HTTP MCP server in a background task."""
        # Set env vars before importing the MCP server module
        if self._hook_server and self._hook_server.port:
            os.environ["PIXSIM_HOOK_PORT"] = str(self._hook_server.port)
        # Load MCP approval tools from persisted service settings
        try:
            from launcher.core.service_settings import load_persisted
            settings = load_persisted("ai-client")
            approval_tools = settings.get("mcp_approval_tools", [])
            if isinstance(approval_tools, list) and approval_tools:
                os.environ["PIXSIM_MCP_APPROVAL_TOOLS"] = ",".join(approval_tools)
        except Exception:
            pass  # launcher module may not be available in standalone mode

        try:
            import uvicorn
            from pixsim7.client.mcp_server import _build_http_app, _init_tools
        except (ImportError, SystemExit) as e:
            get_logger().warning("mcp_http_server_unavailable", error=str(e),
                                hint="Install missing deps: pip install mcp httpx")
            return

        # Mark as bridge-managed so the MCP server skips auto-registration
        os.environ["PIXSIM_BRIDGE_MANAGED"] = "1"

        # Pre-init tools (fetches contracts from API)
        try:
            await _init_tools()
        except Exception as e:
            get_logger().warning("mcp_init_tools_failed", error=str(e))

        app = _build_http_app()
        config = uvicorn.Config(
            app, host="127.0.0.1", port=self._mcp_http_port,
            log_level="warning",
        )
        server = uvicorn.Server(config)
        self._mcp_http_url = f"http://127.0.0.1:{self._mcp_http_port}/mcp/"
        # Publish port so launcher card can show it
        try:
            from pathlib import Path
            port_file = Path.home() / ".pixsim" / "mcp_port"
            port_file.parent.mkdir(parents=True, exist_ok=True)
            port_file.write_text(str(self._mcp_http_port))
        except Exception:
            pass
        get_logger().info("mcp_http_server_starting", port=self._mcp_http_port, url=self._mcp_http_url)
        await server.serve()

    async def _hook_confirm(self, payload: dict) -> dict:
        """Called by hook_server when /confirm is hit.
        Routes through the WS confirmation flow to the frontend UI.
        Returns full response dict: {approved, choice?, text?}."""
        ws = self._active_ws
        if not ws or not self._connected:
            return {"approved": True}  # auto-approve if bridge not connected (fail-open)
        task_id = payload.get("task_id") or f"hook-{uuid.uuid4().hex[:8]}"
        return await self.request_confirmation(ws, task_id, payload)

    async def request_confirmation(
        self,
        ws,
        task_id: str,
        payload: dict,
    ) -> dict:
        """Send a confirmation/prompt request to the backend and block until the user responds.

        Returns response dict: {approved: bool, choice?: str, text?: str}.
        """
        import uuid as _uuid
        confirmation_id = _uuid.uuid4().hex
        event = asyncio.Event()
        self._pending_confirmations[confirmation_id] = event

        try:
            hb: dict = {
                "type": "heartbeat",
                "task_id": task_id,
                "status": "active",
                "action": "confirmation_request",
                "confirmation_id": confirmation_id,
                "title": payload.get("title", "Agent Prompt"),
                "description": payload.get("description", ""),
                "timeout_s": payload.get("timeout_s", 120),
            }
            # Pass through all optional fields
            for key in ("tool_name", "tool_input", "interaction_type", "choices", "placeholder"):
                if payload.get(key) is not None:
                    hb[key] = payload[key]
            await ws.send(json.dumps(hb))

            timeout_s = int(payload.get("timeout_s", 120))
            try:
                await asyncio.wait_for(event.wait(), timeout=timeout_s)
                return self._confirmation_results.get(confirmation_id, {"approved": False})
            except asyncio.TimeoutError:
                return {"approved": False}
        finally:
            self._pending_confirmations.pop(confirmation_id, None)
            self._confirmation_results.pop(confirmation_id, None)

    def status(self) -> dict:
        """Bridge status summary."""
        return {
            "connected": self._connected,
            "bridge_client_id": self._bridge_client_id,
            "tasks_handled": self._tasks_handled,
            "pool": self._pool.status(),
        }
