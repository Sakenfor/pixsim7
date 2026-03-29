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

from pixsim7.client.agent_pool import AgentPool
from pixsim7.client.claude_session import SessionState
from pixsim7.client.log import client_log
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
    ):
        self._pool = pool
        self._url = url
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
        self._repo_root: Path = Path(__file__).resolve().parents[2]

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
            client_log("Missing dependency: websockets", error=True)
            client_log("Install with: pip install websockets", error=True)
            return

        self._shutdown_requested = False
        consecutive_failures = 0
        while not self._shutdown_requested:
            try:
                await self._connect_and_serve()
                consecutive_failures = 0  # reset on clean disconnect
            except KeyboardInterrupt:
                break
            except Exception as e:
                self._connected = False
                if self._shutdown_requested:
                    client_log("Shutdown requested, not reconnecting.")
                    break
                consecutive_failures += 1
                delay = min(5 * consecutive_failures, 30)  # 5s, 10s, 15s... max 30s
                client_log(f"Connection error: {e}", error=True)
                client_log(f"Reconnecting in {delay}s (attempt {consecutive_failures})...")
                await asyncio.sleep(delay)

    async def _connect_and_serve(self) -> None:
        """Single connection session."""
        ws_url = f"{self._url}?agent_type={self._agent_type}"
        # Reconnect with same identity so backend maps back to the same bridge client
        if self._bridge_client_id:
            ws_url += f"&bridge_client_id={self._bridge_client_id}"
        # Send model info if known from any pool session
        pool_model = next(
            (s.cli_model for s in self._pool.sessions if s.cli_model), None
        )
        if pool_model:
            ws_url += f"&model={pool_model}"

        client_log(f"Connecting to {self._url}...")

        async with ws_connect(ws_url) as ws:
            # Welcome message
            welcome = json.loads(await ws.recv())
            connected_bridge_client_id = str(welcome.get("bridge_client_id") or "").strip()
            if not connected_bridge_client_id:
                connected_bridge_client_id = f"{self._agent_type}-{uuid.uuid4().hex[:8]}"
            if connected_bridge_client_id != self._bridge_client_id:
                self._persist_bridge_client_id(connected_bridge_client_id)
            self._bridge_client_id = connected_bridge_client_id
            self._connected = True

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
                    client_log(f"System prompt: {len(server_system_prompt)} chars")
                if mcp_config_path:
                    client_log(f"MCP config: {mcp_config_path}")

            # Report pool capacity to backend
            await self._send_pool_status(ws)

            # Report available models from pool sessions (if any)
            await self._report_models(ws)

            client_log(f"Connected as {self._bridge_client_id}")
            client_log(f"Pool: {self._pool.ready_count} ready, {self._pool.busy_count} busy, max {self._pool._max_sessions}")

            # Replay any buffered results from tasks that completed while WS was dead
            if self._buffered_results:
                client_log(f"Replaying {len(self._buffered_results)} buffered result(s)...")
                for task_id, result_msg in list(self._buffered_results.items()):
                    try:
                        await ws.send(json.dumps(result_msg))
                        self._buffered_results.pop(task_id, None)
                        client_log(f"[task:{task_id[:8]}] Replayed buffered result")
                    except Exception as e:
                        client_log(f"[task:{task_id[:8]}] Failed to replay result: {e}", error=True)
                        break  # WS already broken again — stop trying

            client_log("Waiting for tasks...\n")

            # Background task: send idle heartbeats for alive sessions
            idle_hb_task = asyncio.create_task(self._idle_heartbeat_loop(ws))
            try:
                while True:
                    raw = await ws.recv()
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")

                    if msg_type == "shutdown":
                        client_log("Shutdown requested by server.")
                        self._shutdown_requested = True
                        return

                    if msg_type == "task":
                        # Fire-and-forget — don't block the message loop
                        # so concurrent tasks can be dispatched to different pool sessions
                        asyncio.ensure_future(self._handle_task(ws, msg))

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
                    if not session.is_alive or not session.bridge_session_id:
                        continue
                    if session.state == SessionState.BUSY:
                        continue  # active tasks send their own heartbeats
                    try:
                        await ws.send(json.dumps({
                            "type": "heartbeat",
                            "status": "active",
                            "action": "cli_session",
                            "detail": "idle",
                            "bridge_session_id": session.bridge_session_id,
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
        for engine in self._pool._engines:
            engine_name = engine.split("/")[-1].split("\\")[-1]
            models = await self._probe_models(engine)
            if models:
                await ws.send(json.dumps({
                    "type": "models_available",
                    "agent_type": engine_name,
                    "models": models,
                }))
                client_log(f"Reported {len(models)} models for '{engine_name}'")

    async def _probe_models(self, engine: str) -> list[dict]:
        """Lightweight model probe — initialize + model/list, no thread or MCP."""
        try:
            return await asyncio.wait_for(self._probe_models_impl(engine), timeout=15)
        except asyncio.TimeoutError:
            client_log(f"Model probe for '{engine}' timed out", error=True)
            return []
        except Exception as e:
            client_log(f"Model probe for '{engine}' failed: {e}", error=True)
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
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=3)
            except asyncio.TimeoutError:
                proc.kill()

    def _ensure_mcp_config(
        self,
        scope: str = "dev",
        token: str = "",
        focus: list[str] | None = None,
    ) -> Optional[str]:
        """Generate MCP config file pointing to the pixsim MCP server.

        If ``focus`` is provided (list of contract IDs), generates a scoped
        config that only exposes those contracts.  Focused configs are cached
        by contract-set so repeated calls with the same focus reuse the file.
        """
        # Focused config: check cache first
        if focus:
            cache_key = frozenset(focus)
            cached = self._mcp_config_cache.get(cache_key)
            if cached and os.path.exists(cached):
                return cached

        # Default (unfocused) config: reuse if already generated
        if not focus and self._mcp_config_path and os.path.exists(self._mcp_config_path):
            return self._mcp_config_path

        api_base = self._ws_url_to_http_base()
        mcp_server_script = self._mcp_server_script_path()
        if not self._mcp_python_runtime:
            self._mcp_python_runtime = self._resolve_mcp_python()
        mcp_python_cmd, mcp_python_prefix = self._mcp_python_runtime

        # Shared token file — created once, reused across configs
        if not self._token_file:
            self._token_file = TokenFile.create(seed_token=token, prefix="pixsim-mcp")
        mcp_scope = ",".join(focus) if focus else scope

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
            client_log(f"MCP config (focused {mcp_scope}): {path}")
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
        client_log(
            "Could not find a Python runtime with mcp/httpx installed; "
            f"falling back to {sys.executable}",
            error=True,
        )
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
                    client_log(
                        f"Failed to fetch contracts for Codex focus: HTTP {resp.status}",
                        error=True,
                    )
                    return None
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            client_log(f"Failed to fetch contracts for Codex focus: {e}", error=True)
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
            client_log(f"Prepared Codex project MCP config: {config_path}")
            self._codex_workdir_cache[cache_key] = str(workdir)
            return str(workdir)
        except Exception as e:
            client_log(f"Failed to prepare Codex MCP project config: {e}", error=True)
            return None

    @staticmethod
    def _extract_task_meta(msg: dict) -> dict:
        """Extract routing and heartbeat metadata from a task payload.

        Centralises the scattered msg.get() calls so adding new fields
        means one touch-point instead of five.
        """
        _str = lambda key: str(msg.get(key) or "").strip() or None  # noqa: E731

        ctx = msg.get("context") or {}
        scope_key = _str("scope_key")
        plan_id = ctx.get("plan_id") if isinstance(ctx, dict) else None
        if not plan_id and scope_key and scope_key.startswith("plan:"):
            plan_id = scope_key[5:]

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

    async def _handle_task(self, ws, msg: dict) -> None:
        """Handle an incoming task from the backend."""
        task_id = msg.get("task_id", "?")
        task_type = msg.get("task", "unknown")
        prompt = msg.get("instruction") or msg.get("prompt", "")

        meta = self._extract_task_meta(msg)
        client_log(f"[task:{task_id[:8]}] {task_type}: engine={meta['engine']} model={meta['model']} prompt={prompt[:60]}...")

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

        # On first message of a new conversation, inject system context + persona.
        # Resumed conversations already have these in history.
        if not meta["bridge_session_id"]:
            preamble_parts: list[str] = []
            if self._system_prompt:
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
                bridge_session_id = session.bridge_session_id if session else None

                preview = response[:120].replace('\n', ' ')
                client_log(f"[task:{task_id[:8]}] Done via {session_id} ({len(response)} chars): {preview}")

                result_msg: dict = {
                    "type": "result",
                    "task_id": task_id,
                    "edited_prompt": response,
                }
                if bridge_session_id:
                    result_msg["bridge_session_id"] = bridge_session_id
                try:
                    await ws.send(json.dumps(result_msg))
                except Exception:
                    # WS dead — buffer result for replay on reconnect
                    self._buffered_results[task_id] = result_msg
                    client_log(f"[task:{task_id[:8]}] WS dead, buffered result for replay ({len(response)} chars)")
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
            client_log(f"[task:{task_id[:8]}] Error: {e}", error=True)
            error_msg = {
                "type": "error",
                "task_id": task_id,
                "error": str(e),
            }
            try:
                await ws.send(json.dumps(error_msg))
            except Exception:
                # WS dead — buffer error for replay on reconnect
                self._buffered_results[task_id] = error_msg
                client_log(f"[task:{task_id[:8]}] WS dead, buffered error for replay")

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

    def status(self) -> dict:
        """Bridge status summary."""
        return {
            "connected": self._connected,
            "bridge_client_id": self._bridge_client_id,
            "tasks_handled": self._tasks_handled,
            "pool": self._pool.status(),
        }
