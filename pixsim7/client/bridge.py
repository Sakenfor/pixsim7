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
import random
import shutil
import subprocess as sp
import sys
import tempfile
import time
import traceback
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

from pixsim7.client.agent_errors import wire_error_code
from pixsim7.client.agent_pool import AgentPool, SessionBusyError
from pixsim7.client.session import AgentTaskError, SessionState
from pixsim7.client.log import get_logger, redact_url
from pixsim7.client.token_manager import (
    TokenFile,
    build_mcp_env,
    write_claude_mcp_config,
    write_codex_mcp_config,
)


# ─── Stable MCP config filenames (plan: stable-config-location) ───
# Deterministic, filesystem-safe names so a given (focus) or
# (chat_session, agent, focus) tuple always resolves to the same file
# inside ``pixsim_mcp_config_dir()``. Rewriting the same file is what
# makes ``%TEMP%``-sweep recovery free — no fresh path to invalidate
# any cache against.


def _is_backend_booting_error(e: BaseException) -> bool:
    """True when a reconnect failed because the backend port isn't open yet.

    A full backend restart isn't ready in 0.5s — it refuses connections
    (``ConnectionRefusedError``; WinError 1225 maps here) for the ~5–20s it
    takes to boot its DB pool / workers / WS endpoint. That's distinct from a
    healthy-but-overloaded peer: it means "keep probing tightly until the port
    opens", not "back off to avoid a stampede". We walk the cause/context chain
    because the refusal is often wrapped (e.g. inside an ``OSError`` or a
    websockets handshake error). Plan: launcher-health-probe-stability /
    ws-drop-root-cause.
    """
    seen: set[int] = set()
    cur: BaseException | None = e
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, ConnectionRefusedError):
            return True
        cur = cur.__cause__ or cur.__context__
    return False


def _reconnect_backoff_delay(
    consecutive_failures: int, *, booting: bool = False
) -> float:
    """Delay (seconds) before the next WS reconnect attempt.

    Backend restarts are the common cause of a dropped bridge WS, so the FIRST
    reconnect attempt is near-immediate: the old flat ``5 * consecutive_failures``
    floor meant the browser panel (which reconnects in ~1s) always beat the
    bridge back and the user saw a spurious "Task not found" for any in-flight
    task. Later attempts back off linearly to a 30s cap. Jitter spreads many
    bridges so they don't stampede a still-booting backend in lockstep.

    ``booting=True`` (the last attempt was refused — backend port not open yet)
    overrides the escalation: a restart only *looks* like repeated failures
    while it boots, and the old linear curve would balloon to a 15–30s sleep
    right as the backend finished coming up, stranding in-flight tasks long
    after the WS endpoint was reachable again. Instead we probe at a tight
    ~1s cadence (a small ceiling after many tries guards a truly-dead backend)
    so we reconnect within ~1s of the port reopening. Plan:
    launcher-health-probe-stability / ws-drop-root-cause.
    """
    if booting:
        # Port-not-open-yet: probe tightly until it reopens. Stay near-constant
        # rather than escalating — the failures are one boot, not contention.
        base = 1.0 if consecutive_failures <= 10 else 3.0
        return base + random.uniform(0.0, 0.5)
    if consecutive_failures <= 1:
        # Near-immediate first retry — assume a quick backend restart.
        return 0.5 + random.uniform(0.0, 0.5)
    base = min(5 * (consecutive_failures - 1), 30)  # 5s, 10s, 15s... cap 30s
    return base + random.uniform(0.0, 2.0)


def _sanitize_for_filename(value: str, max_length: int = 40) -> str:
    """Keep filesystem-safe chars only, truncate, never empty."""
    safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in value)
    return (safe[:max_length] or "_")


def _focus_suffix(focus) -> str:
    """Deterministic short suffix for a focus set (empty when no focus)."""
    if not focus:
        return ""
    import hashlib
    canonical = ",".join(sorted(focus))
    return "--focus-" + hashlib.sha256(canonical.encode()).hexdigest()[:8]


def _legacy_mcp_config_name(
    focus, profile_id: str = "", session_id: str = ""
) -> str:
    base = f"focus{_focus_suffix(focus)}" if focus else "default"
    # No identity (startup/base callers) -> legacy name, unchanged. With
    # identity, the file must be per (profile, session) or two agents on
    # the same focus clobber each other's config (and X-Profile-Id).
    pid = _sanitize_for_filename(profile_id) if profile_id else ""
    sid = _sanitize_for_filename(session_id) if session_id else ""
    if pid or sid:
        return f"{base}--{pid or 'na'}-{sid or 'na'}.json"
    return f"{base}.json"


def _per_session_mcp_config_name(
    chat_session_id: str, agent_type: str, focus
) -> str:
    session_part = _sanitize_for_filename(chat_session_id)
    agent_part = _sanitize_for_filename(agent_type)
    return f"session-{session_part}--{agent_part}{_focus_suffix(focus)}.json"


def _describe_tool_for_gate(tool_name: str, tool_input: dict) -> str:
    """Human-readable description for tool gate confirmation dialog."""
    if tool_name == "Bash" and "command" in tool_input:
        cmd = tool_input["command"]
        return f"Run command: {cmd[:200]}" if len(cmd) > 200 else f"Run command: {cmd}"
    if tool_name in ("Write", "Edit") and "file_path" in tool_input:
        return f"{tool_name} file: {tool_input['file_path']}"
    if tool_name == "NotebookEdit" and "file_path" in tool_input:
        return f"Edit notebook: {tool_input['file_path']}"
    return f"{tool_name}({json.dumps(tool_input)[:200]})"


def _extract_token_jti(token: str) -> str:
    """Return the first 8 chars of the JWT's `jti` claim, or "noauth".

    Used to namespace per-token codex workdirs so a token rotation creates
    a fresh workdir + config.toml — the previous one's bearer token never
    gets reused. Falsy/unparseable inputs map to "noauth" so the caller
    still gets a stable namespace for the empty-token case.

    Mirrors the lightweight JWT decode in :py:meth:`Bridge._get_valid_token`
    — we deliberately don't verify the signature here; this is a cache key,
    not an auth check. The signature has already been verified backend-side
    by the time the token reaches us.
    """
    if not token:
        return "noauth"
    try:
        import base64 as _b64
        segments = token.split(".")
        if len(segments) < 2:
            return "noauth"
        payload_b64 = segments[1] + "=" * (-len(segments[1]) % 4)
        claims = json.loads(_b64.urlsafe_b64decode(payload_b64))
        jti = str(claims.get("jti") or "").strip()
        # Strip non-alphanumeric so the jti is safe to slot into a path
        # component (jti is base64url so this should be a no-op, but
        # defensive in case the issuer ever changes encoding).
        safe = "".join(ch for ch in jti if ch.isalnum())[:8]
        return safe or "noauth"
    except Exception:
        return "noauth"


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
        # Disk mirror of `_buffered_results`. The in-memory buffer survives a
        # WS blip (replayed on reconnect in run()), but NOT a bridge process
        # restart — and a completed reply exists nowhere else once the CLI
        # session is gone, so a restart in the dead-WS window silently loses
        # the turn server-side. Mirror to disk at buffer time and reload here
        # so replay survives a restart. Plan
        # `launcher-health-probe-stability` /
        # checkpoint `buffered-result-lost-on-bridge-restart`.
        self._buffered_results_dir = self._resolve_buffered_results_dir()
        self._buffered_results.update(self._load_persisted_buffered_results())
        # In-flight tasks the bridge is currently processing. Reported in
        # pool_status so a restarted backend can rebuild its _active_tasks
        # and let frontend reconnects re-attach to running work.
        self._inflight_tasks: dict[str, dict] = {}  # task_id -> {bridge_session_id, started_at, action, detail}
        self._mcp_config_path: Optional[str] = None
        self._token_file: Optional[TokenFile] = None
        self._system_prompt: Optional[str] = None
        # Cache: frozenset of focus contract IDs -> MCP config temp file path
        self._mcp_config_cache: dict[frozenset[str], str] = {}
        # Per-focus Codex project workdirs with local .codex/config.toml
        self._codex_workdir_cache: dict[tuple[str, tuple[str, ...]], str] = {}
        self._mcp_scope: str = "dev"
        # Latest authenticated user_id from the server's WS welcome message.
        # Stored so Bridge.status() can expose the actual runtime scope
        # rather than forcing the launcher to infer it from the cosmetic
        # `shared-` / `user-N` prefix on `bridge_client_id` (which goes
        # stale across token-presence transitions). Plan:
        # `unified-task-agent-architecture` — bridge UI scope toggle.
        self._user_id: Optional[int] = None
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
        # Loud-signal: when MCP wiring degrades the launcher must SEE it
        # rather than agents silently "going dumb". None = healthy; else
        # {"severity": "warning"|"error", "reason": str, "at": iso8601}.
        # Surfaced via status() → hook /status → launcher service card.
        # Plan: mcp-server-reliability / loud-signal-on-mcp-degradation.
        self._mcp_degradation: Optional[dict] = None
        self._repo_root: Path = Path(__file__).resolve().parents[2]
        # Per-session MCP HTTP config + JWT cache.
        # Plan: mcp-http-bridge-session-resolution. When the
        # PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS flag is on, the bridge mints a
        # chat-session-scoped JWT at dispatch time and writes a per-(session,
        # agent, focus) HTTP MCP config so the MCP server can resolve identity
        # directly from token claims. Cache value: (config_path, jwt, exp_epoch).
        self._per_session_mcp_cache: dict[
            tuple[str, str, frozenset[str]], tuple[str, str, float]
        ] = {}
        # Reverse map: Claude's cli_session_id → our currently-in-flight
        # task_id. Populated by _handle_task at start (for resumed sessions
        # where bridge_session_id IS the cli_session_id) and via on_progress
        # session_resolved (for new sessions). Cleared in finally. Used by
        # _hook_confirm to route PreToolUse hook /confirm calls to exactly
        # the originating task instead of fanning out to every in-flight
        # task on this bridge. Plan: agent-confirmation-hooks /
        # cross-tab-fanout-fix.
        self._cli_session_to_task: dict[str, str] = {}

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

    # ── Durable result buffer ────────────────────────────────────────
    # Undelivered completed results are mirrored to disk so they replay
    # across a bridge process restart, not just a WS reconnect. One JSON
    # file per task_id keeps writes/prunes independent. See
    # `_buffered_results` in __init__.
    _BUFFERED_RESULT_TTL_SECONDS = 7 * 24 * 3600

    def _resolve_buffered_results_dir(self) -> Path:
        """Dir holding one JSON file per undelivered result, namespaced like bridge_id."""
        explicit = str(os.environ.get("PIXSIM_BRIDGE_BUFFER_DIR") or "").strip()
        if explicit:
            try:
                return Path(explicit).expanduser()
            except Exception:
                pass
        namespace = self._normalize_bridge_id_namespace(
            os.environ.get("PIXSIM_BRIDGE_ID_NAMESPACE") or ""
        )
        name = f"buffered_results_{namespace}" if namespace else "buffered_results"
        return Path.home() / ".pixsim" / name

    def _persist_buffered_result(self, task_id: str, msg: dict) -> None:
        """Mirror a buffered result to disk so it survives a process restart."""
        if not task_id:
            return
        try:
            d = self._buffered_results_dir
            d.mkdir(parents=True, exist_ok=True)
            tmp = d / f".{task_id}.tmp"
            final = d / f"{task_id}.json"
            tmp.write_text(json.dumps(msg), encoding="utf-8")
            os.replace(str(tmp), str(final))  # atomic swap into place
            try:
                os.chmod(str(final), 0o600)
            except OSError:
                pass
        except (OSError, TypeError, ValueError) as e:
            get_logger().debug("buffered_result_persist_failed", task=task_id[:8], error=str(e))

    def _drop_persisted_buffered_result(self, task_id: str) -> None:
        """Remove the on-disk copy once a buffered result is delivered."""
        if not task_id:
            return
        try:
            (self._buffered_results_dir / f"{task_id}.json").unlink()
        except OSError:
            pass

    def _load_persisted_buffered_results(self) -> dict[str, dict]:
        """Reload undelivered results from disk at startup, pruning stale ones."""
        out: dict[str, dict] = {}
        try:
            files = list(self._buffered_results_dir.glob("*.json"))
        except OSError:
            return out
        now = time.time()
        for f in files:
            try:
                if now - f.stat().st_mtime > self._BUFFERED_RESULT_TTL_SECONDS:
                    f.unlink()
                    continue
                msg = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            task_id = msg.get("task_id") if isinstance(msg, dict) else None
            if task_id:
                out[task_id] = msg
        if out:
            get_logger().info("buffered_results_restored", count=len(out))
        return out

    # WS keepalive ping timing (seconds). Generous by default so a
    # briefly-busy event loop is never mistaken for a dead peer; overridable
    # so tests can force half-open detection in seconds rather than ~80s.
    _DEFAULT_WS_PING_INTERVAL = 20.0
    _DEFAULT_WS_PING_TIMEOUT = 60.0

    @classmethod
    def _resolve_ws_ping_timing(cls) -> tuple[float, float]:
        """(ping_interval, ping_timeout) for ws_connect, env-overridable.

        ``PIXSIM_BRIDGE_PING_INTERVAL`` / ``PIXSIM_BRIDGE_PING_TIMEOUT`` accept
        a positive float; anything missing/invalid falls back to the default.
        """
        def _val(env_name: str, default: float) -> float:
            raw = str(os.environ.get(env_name) or "").strip()
            if not raw:
                return default
            try:
                parsed = float(raw)
            except ValueError:
                return default
            return parsed if parsed > 0 else default

        return (
            _val("PIXSIM_BRIDGE_PING_INTERVAL", cls._DEFAULT_WS_PING_INTERVAL),
            _val("PIXSIM_BRIDGE_PING_TIMEOUT", cls._DEFAULT_WS_PING_TIMEOUT),
        )

    async def run(self) -> None:
        """Main loop — connect, handle tasks, reconnect on failure."""
        if websockets is None:
            get_logger().error("missing_dependency", package="websockets", hint="pip install websockets")
            return

        # Sweep stale MCP configs from the stable dir at startup. JWTs are
        # 24h-TTL so anything >48h old is unreachable; we delete eagerly so
        # ~/.pixsim/mcp/ doesn't accumulate session-<id>-*.json files
        # across reboots. Plan: stable-config-location.
        try:
            from pixsim7.client.token_manager import sweep_old_mcp_configs
            removed = sweep_old_mcp_configs()
            if removed:
                get_logger().info("mcp_config_sweep", removed=removed)
        except Exception as e:
            get_logger().debug("mcp_config_sweep_failed", error=str(e))

        # Start hook HTTP server for Claude Code PreToolUse integration
        from pixsim7.client.hook_server import HookServer
        self._hook_server = HookServer(confirm_fn=self._hook_confirm, status_fn=self.status)
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
                # Supervise the MCP HTTP server task. If it crashed (uvicorn
                # bind failure, internal exception) we used to keep reconnecting
                # the WS happily while MCP tools failed with connection-refused
                # — invisible to the user except as "MCP keeps restarting".
                # Now we notice and relaunch. Rate-limited naturally by the WS
                # reconnect backoff below: at most one relaunch attempt per
                # iteration of this loop.
                if (
                    self._mcp_server_task is not None
                    and self._mcp_server_task.done()
                    and not self._mcp_server_task.cancelled()
                ):
                    exc = self._mcp_server_task.exception()
                    if exc is not None:
                        get_logger().warning(
                            "mcp_http_server_relaunching",
                            error=str(exc),
                            error_type=type(exc).__name__,
                        )
                        # Recoverable: all agents lose MCP tools until the
                        # relaunched uvicorn rebinds. Surface as a warning.
                        self._set_mcp_degradation(
                            "warning",
                            f"MCP HTTP server crashed "
                            f"({type(exc).__name__}), relaunching",
                        )
                        self._mcp_server_task = asyncio.create_task(self._start_mcp_http_server())
                        await asyncio.sleep(0.3)  # give uvicorn a moment to bind
                elif (
                    self._mcp_server_task is not None
                    and not self._mcp_server_task.done()
                    and self._mcp_degradation is not None
                    and self._mcp_degradation.get("severity") == "warning"
                ):
                    # Relaunched task survived a supervisor tick → recovered.
                    self._clear_mcp_degradation()

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
                    # A refused connect means the backend port isn't open yet
                    # (still booting after a restart) — keep probing tightly
                    # instead of escalating into a long sleep that strands any
                    # in-flight task past the moment the endpoint comes back.
                    booting = _is_backend_booting_error(e)
                    delay = _reconnect_backoff_delay(
                        consecutive_failures, booting=booting
                    )
                    # Plan: launcher-health-probe-stability / ws-drop-root-cause —
                    # str(e) on websockets exceptions is just "no close frame
                    # received or sent" without the originating cause. Surface
                    # structured fields so we can see *why* the WS context died
                    # (ConnectionClosed code/reason, the chained __cause__, or
                    # the exception type if it's something other than a WS close).
                    err_fields: dict[str, object] = {
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "error_repr": repr(e),
                    }
                    if websockets is not None and isinstance(
                        e, websockets.exceptions.ConnectionClosed
                    ):
                        rcvd = getattr(e, "rcvd", None)
                        sent = getattr(e, "sent", None)
                        frame = rcvd or sent
                        err_fields["close_code"] = getattr(frame, "code", None)
                        err_fields["close_reason"] = getattr(frame, "reason", None)
                        err_fields["close_origin"] = (
                            "remote" if rcvd else ("local" if sent else "unknown")
                        )
                    if e.__cause__ is not None:
                        err_fields["cause_type"] = type(e.__cause__).__name__
                        err_fields["cause"] = repr(e.__cause__)
                    elif e.__context__ is not None and not e.__suppress_context__:
                        err_fields["context_type"] = type(e.__context__).__name__
                        err_fields["context"] = repr(e.__context__)
                    get_logger().error("connection_error", **err_fields)
                    # Full traceback at debug — verbose, but invaluable when a
                    # specific code path is repeatedly killing the WS context.
                    get_logger().debug(
                        "connection_error_traceback",
                        traceback="".join(
                            traceback.format_exception(type(e), e, e.__traceback__)
                        ),
                    )
                    get_logger().info("reconnecting", delay_s=delay, attempt=consecutive_failures, booting=booting)
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

        # WS-level keepalive. Commit 45d54664f disabled this ("app-level
        # heartbeats handle liveness"), but that left the CLIENT unable to
        # notice a silently half-open connection: the recv loop blocks on
        # recv() forever and the app-level keepalive send()s buffer into a dead
        # socket without raising, so a connection that dies mid-turn is only
        # discovered when the turn's `result` finally fails to send — at which
        # point a process restart can lose the buffered reply (plan
        # launcher-health-probe-stability / checkpoint
        # buffered-result-lost-on-bridge-restart). Ping expects a *pong*, so a
        # missing pong closes the connection and surfaces as a recv() error →
        # prompt reconnect. Timing is deliberately generous (ping every 20s,
        # 60s to pong) so a briefly-busy event loop is never mistaken for a
        # dead peer; the server's own 45s ping + 120s recv-timeout (45d54664f)
        # still guards the other direction. Overridable via env (tests use a
        # tight interval/timeout to assert half-open detection in seconds).
        ping_interval, ping_timeout = self._resolve_ws_ping_timing()
        async with ws_connect(
            ws_url,
            ping_interval=ping_interval,
            ping_timeout=ping_timeout,
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
            # Cache the user_id for status() so the launcher UI gets a
            # truthful scope readout (see Bridge.status()).
            self._user_id = int(user_id) if user_id is not None else None
            service_token = welcome.get("service_token", "")
            self._service_token = str(service_token or "")

            # Extract system prompt and generate MCP config
            server_system_prompt = welcome.get("system_prompt")
            mcp_config_path = self._ensure_mcp_config(scope=scope, token=service_token)
            if mcp_config_path:
                # Healthy (re)connect — clear any stale degradation badge.
                self._clear_mcp_degradation()

            # Wire a base-regenerator into the pool so sessions can recover when
            # the cached MCP config file is swept (Windows %TEMP% cleanup, etc.).
            # See plan: mcp-server-reliability.
            def _regen_base_mcp_config(
                _scope: str = scope, _token: str = str(service_token or "")
            ) -> Optional[str]:
                # Drop the bridge's cached path so _ensure_mcp_config writes a
                # fresh file instead of returning the (now missing) cached one.
                self._mcp_config_cache.pop(frozenset({"__default__"}), None)
                self._mcp_config_path = None
                try:
                    path = self._ensure_mcp_config(scope=_scope, token=_token)
                except Exception as exc:
                    # Base config can't be rebuilt → every session that needs
                    # regen will be refused. Unrecoverable until this clears.
                    self._set_mcp_degradation(
                        "error",
                        f"MCP base config regeneration raised "
                        f"{type(exc).__name__}: {exc}",
                    )
                    raise
                if not path:
                    self._set_mcp_degradation(
                        "error",
                        "MCP base config regeneration returned no path",
                    )
                else:
                    self._clear_mcp_degradation()
                return path

            self._pool.set_base_mcp_config_regenerator(_regen_base_mcp_config)

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
            await self._replay_buffered_results(ws)

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
                                "choice": msg.get("choice"),     # singular — single-select
                                "choices": msg.get("choices"),   # plural — multi-select (list of ids)
                                "text": msg.get("text"),
                                # Preserve the backend gate's timeout marker so
                                # ask_user can tell silence from a real deny.
                                "timed_out": bool(msg.get("timed_out", False)),
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

    async def _replay_buffered_results(self, ws) -> None:
        """Re-send results buffered while the WS was dead, then drop each copy.

        Called right after a (re)connect. A task can complete while the backend
        WS is down (or mid-restart); the result is held in ``_buffered_results``
        (and mirrored to disk) so it survives, then replayed here. Each success
        clears both the in-memory entry and its disk copy so it isn't re-sent.
        Stops on the first send failure — the WS just broke again, so the rest
        stay buffered for the next reconnect.
        """
        if not self._buffered_results:
            return
        get_logger().info("replaying_buffered", count=len(self._buffered_results))
        for task_id, result_msg in list(self._buffered_results.items()):
            try:
                await ws.send(json.dumps(result_msg))
                self._buffered_results.pop(task_id, None)
                self._drop_persisted_buffered_result(task_id)
                get_logger().debug("buffered_replayed", task=task_id[:8])
            except Exception as e:
                get_logger().error("buffered_replay_failed", task=task_id[:8], error=str(e))
                break  # WS already broken again — stop trying

    async def _send_pool_status(self, ws) -> None:
        """Send current pool session info to backend."""
        # `engines` is the post-probe survivors list (set by AgentPool.start);
        # `failed_engines` is the diagnostic for engines that didn't survive
        # the start-up probe. Backend stores both so the frontend can show
        # "codex install is broken" without waiting for a real dispatch.
        await ws.send(json.dumps({
            "type": "pool_status",
            "max_sessions": self._pool._max_sessions,
            "ready": self._pool.ready_count,
            "busy": self._pool.busy_count,
            "total": len(self._pool._sessions),
            "engines": [e.split("/")[-1].split("\\")[-1] for e in self._pool._engines],
            "failed_engines": [
                {"engine": name, "reason": reason}
                for name, reason in self._pool.failed_engines
            ],
            "sessions": [s.to_dict() for s in self._pool.sessions],
            # Surface in-flight task_ids so a restarted backend can rebuild
            # its _active_tasks state and accept frontend reconnects for them.
            "active_tasks": [
                {
                    "task_id": tid,
                    "bridge_session_id": info.get("bridge_session_id"),
                    "started_at": info.get("started_at"),
                    "action": info.get("action", ""),
                    "detail": info.get("detail", ""),
                }
                for tid, info in self._inflight_tasks.items()
            ],
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
        session_id: str = "",
        profile_id: str = "",
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
            # Cache per (focus, profile, session): a config baked with one
            # agent's X-Profile-Id must not be reused for another.
            cache_key = (
                frozenset(focus) if focus else "__default__",
                profile_id or "",
                session_id or "",
            )
            cached = self._mcp_config_cache.get(cache_key)
            if cached and os.path.exists(cached):
                return cached

            from pixsim7.client.token_manager import write_claude_mcp_http_config
            effective_token = token
            if not effective_token and self._token_file:
                effective_token = self._token_file.read()
            # Stable filename: deterministic on (focus) so reopening on
            # the next bridge boot reuses the same path; survives %TEMP%
            # sweeps because we live in pixsim_mcp_config_dir() now.
            # profile_id/session_id mirror the per-session path so the
            # X-Profile-Id / X-Chat-Session-Id headers are emitted and
            # agent attribution doesn't collapse to 'unknown'.
            path = write_claude_mcp_http_config(
                mcp_url=self._mcp_http_url,
                api_token=effective_token,
                scope=mcp_scope,
                session_id=session_id,
                profile_id=profile_id,
                name=_legacy_mcp_config_name(focus, profile_id, session_id),
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
            # Stable base token (immune to %TEMP% sweeps). Shared per bridge;
            # rewritten with per-request tokens, so a swept file is re-created
            # on the next write as long as the durable stable dir exists.
            # Plan: mcp-server-reliability / extend-stable-location-to-all-mcp-files.
            self._token_file = TokenFile.create(
                seed_token=token, name="pixsim-mcp-base.token",
            )

        env = build_mcp_env(
            api_base=api_base,
            token_file=self._token_file,
            scope=mcp_scope,
            api_token=token,
        )
        # Deterministic stable filename (same scheme as the HTTP branch:
        # default.json / focus<hash>.json) so the regenerator-on-missing
        # path keeps working and %TEMP% sweeps no longer apply.
        path = write_claude_mcp_config(
            env,
            python_cmd=mcp_python_cmd,
            python_prefix=mcp_python_prefix,
            mcp_server_script=mcp_server_script,
            name=_legacy_mcp_config_name(focus),
        )

        if focus:
            self._mcp_config_cache[frozenset(focus)] = path
            get_logger().debug("mcp_config_focused", scope=mcp_scope, path=path)
        else:
            self._mcp_config_path = path

        return path

    # ── Per-session MCP HTTP config (plan: mcp-http-bridge-session-resolution) ──

    @staticmethod
    def _per_session_subprocess_enabled() -> bool:
        """Feature flag for per-(chat_session, agent_type) HTTP MCP configs.

        Default on. The legacy shared-config path keeps a connect-time token
        static for the bridge WS lifetime and is now opt-out only.
        Per-session subprocess mode mints/rotates session-scoped credentials
        and avoids the stale-token "MCP disconnected" failure mode.
        """
        raw = os.environ.get("PIXSIM_BRIDGE_PER_SESSION_SUBPROCESS", "").strip().lower()
        return raw not in {"0", "false", "no", "off"}

    async def _mint_agent_session_token(
        self,
        *,
        chat_session_id: str = "",
        agent_type: str,
        profile_id: str,
        scope_key: Optional[str] = None,
        tab_id: Optional[str] = None,
        on_behalf_of: Optional[int] = None,
        ttl_hours: int = 24,
    ) -> tuple[str, float]:
        """Ask the backend to mint a per-session agent JWT.

        Anchored on ``chat_session_id`` when known, else on ``tab_id`` /
        ``scope_key`` for a new conversation's first turn (no session id yet).
        Returns ``(access_token, exp_epoch_seconds)``. Raises on HTTP error
        so callers can decide whether to fall back to the legacy resolution
        path (this is the cutover seam — failure here is expected when the
        backend hasn't been upgraded yet).
        """
        import time as _time
        import httpx

        api_base = self._ws_url_to_http_base()
        url = f"{api_base}/api/v1/dev/agent-tokens/bridge-session"
        body: dict = {
            "agent_type": agent_type,
            "profile_id": profile_id,
            "ttl_hours": ttl_hours,
        }
        if chat_session_id:
            body["chat_session_id"] = chat_session_id
        if scope_key:
            body["scope_key"] = scope_key
        if tab_id:
            body["tab_id"] = tab_id
        if on_behalf_of is not None:
            body["on_behalf_of"] = on_behalf_of

        headers = {"Authorization": f"Bearer {self._service_token}"} if self._service_token else {}
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=body, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(
                f"bridge-session token mint failed: {resp.status_code} {resp.text[:200]}"
            )
        data = resp.json()
        access_token = str(data.get("access_token") or "")
        if not access_token:
            raise RuntimeError("bridge-session token mint returned empty access_token")
        expires_in = int(data.get("expires_in_seconds") or 0)
        exp_epoch = _time.time() + max(expires_in, 1)
        return access_token, exp_epoch

    async def _ensure_per_session_mcp_config(
        self,
        *,
        chat_session_id: str = "",
        agent_type: str,
        focus: Optional[list[str]] = None,
        profile_id: str,
        scope_key: Optional[str] = None,
        tab_id: Optional[str] = None,
        on_behalf_of: Optional[int] = None,
    ) -> Optional[str]:
        """Write a per-(chat_session, agent_type, focus) HTTP MCP config.

        Returns the config file path, or ``None`` if HTTP MCP isn't active
        (caller should fall back to the legacy ``_ensure_mcp_config``).
        The MCP config carries a fresh agent-purpose JWT in the
        ``Authorization`` header so MCP tools resolve identity from claims
        rather than from the bridge's contextvar (which doesn't survive the
        starlette task boundary).
        """
        if not self._mcp_http_url:
            # Only applicable to HTTP transport. STDIO transport already gets
            # per-session isolation via PIXSIM_TOKEN_FILE.
            return None

        import os as _os
        import time as _time

        # Anchor the cache key + filename on the chat session when known, else
        # on the tab (turn 1, pre-session). Keeps per-tab configs distinct so a
        # tab-anchored turn-1 config and its later session-anchored config don't
        # collide — and the turn-1 spawn is the one the reused subprocess keeps.
        anchor = chat_session_id or (f"tab-{tab_id}" if tab_id else "")
        cache_key = (
            anchor,
            agent_type,
            frozenset(focus) if focus else frozenset({"__default__"}),
        )
        cached = self._per_session_mcp_cache.get(cache_key)
        # Refresh when within 1h of expiry (matches design note in plan).
        if cached and _os.path.exists(cached[0]) and (cached[2] - _time.time()) > 3600:
            return cached[0]

        # Mint a fresh JWT. Bubble errors up so the dispatch path can fall
        # back to legacy behavior cleanly.
        token, exp_epoch = await self._mint_agent_session_token(
            chat_session_id=chat_session_id,
            agent_type=agent_type,
            profile_id=profile_id,
            scope_key=scope_key,
            tab_id=tab_id,
            on_behalf_of=on_behalf_of,
        )

        from pixsim7.client.token_manager import write_claude_mcp_http_config
        # Both Claude and Codex use the same Authorization-bearing HTTP config
        # at this layer. Codex HTTP config writer accepts the same parameters;
        # we use the Claude writer for the JSON path consumed by the pool,
        # and Codex's project-local config.toml is handled by
        # ``_ensure_codex_project_workdir`` separately. (TODO follow-up: unify
        # both paths once Codex over HTTP-MCP graduates.)
        # Stable per-(chat_session, agent_type, focus) filename so a
        # %TEMP%-sweep equivalent (Storage Sense, etc.) doesn't leave the
        # cache holding a stale path.
        # X-Scope-Key is the MCP server's *tool-focus* channel, consumed only
        # by handle_list_tools: a contract-ID list narrows tools to
        # builtins + core + those contracts; an empty value returns the full
        # toolset. It is NOT an identity channel — identity rides in the JWT
        # claims plus X-Chat-Session-Id / X-Profile-Id. Send the focus
        # contracts (mirroring the STDIO path's PIXSIM_SCOPE), or "" for no
        # narrowing. Previously this sent the tab scope_key, which matched no
        # contract and collapsed every session to core-only.
        focus_scope = ",".join(focus) if focus else ""
        path = write_claude_mcp_http_config(
            mcp_url=self._mcp_http_url,
            api_token=token,
            scope=focus_scope,
            session_id=chat_session_id,
            profile_id=profile_id,
            name=_per_session_mcp_config_name(anchor, agent_type, focus),
        )
        self._per_session_mcp_cache[cache_key] = (path, token, exp_epoch)
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

        # Focus values are matched by contract id AND by `provides` capability
        # tag — the UI's focus areas live in the provides namespace
        # (asset_management, prompt_authoring, …) which diverges from the
        # contract-id namespace (assets.management, prompts.authoring). Mirrors
        # mcp_server.resolve_enabled_tool_names_for_focus.
        raw_focus = {str(f).strip() for f in focus if str(f or "").strip()}
        include_contract_ids = {self._normalize_contract_id(f) for f in raw_focus}
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
            provides = contract.get("provides")
            provides = provides if isinstance(provides, list) else []
            if contract_id not in include_contract_ids and not raw_focus.intersection(provides):
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
        chat_session_id: str = "",
        profile_id: str = "",
        tab_id: str | None = None,
    ) -> str | None:
        """Write focus-scoped .codex/config.toml and return launch workdir.

        This avoids touching global ~/.codex/config.toml. Each focus set gets
        an isolated workdir under the repo with its own project config layer.

        The cache key includes the token's `jti` (first 8 chars) so a token
        rotation creates a fresh workdir with a fresh config.toml — without
        this, the previous token's bearer would be silently reused from the
        cached file. The same jti is appended to the workdir directory name
        so old token's workdirs become orphaned (left on disk for an external
        cleanup pass to GC) rather than overwritten in place by a different
        token's config — keeping concurrent bridges from racing each other.
        """
        normalized_focus = tuple(
            sorted({
                self._normalize_contract_id(contract_id)
                for contract_id in (focus or [])
                if str(contract_id or "").strip()
            })
        )
        token_ns = _extract_token_jti(token)
        # Per-(tab, chat_session) cache slot: a token rotation alone would
        # already shift token_ns, but mixing the tab anchor in keeps cross-tab
        # reuse from collapsing identities when two tabs ever share a token
        # (e.g. service-token fallback on mint failure). Plan
        # ``tab-identity-mode`` / codex parity.
        identity_ns = chat_session_id or (f"tab-{tab_id}" if tab_id else "")
        cache_key = (scope, normalized_focus, token_ns, identity_ns)

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
            workdir = self._repo_root / ".pixsim-codex" / f"{scope}-{focus_hash}-{token_ns}"

            # ── HTTP mode: shared MCP server is running ──
            if self._mcp_http_url:
                from pixsim7.client.token_manager import write_codex_mcp_http_config
                config_path = write_codex_mcp_http_config(
                    mcp_url=self._mcp_http_url,
                    api_token=token,
                    scope=scope,
                    session_id=chat_session_id,
                    profile_id=profile_id,
                    enabled_tools=enabled_tools,
                    workdir=str(workdir),
                )
                get_logger().debug("codex_config_http", path=str(config_path))
                self._codex_workdir_cache[cache_key] = str(workdir)
                return str(workdir)

            # ── STDIO fallback ──
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
            model = model.split(":", 1)[1]  # strip provider prefix (e.g. openai:gpt-5.4)
        elif model and model.startswith("openai/"):
            model = model.split("/", 1)[1]  # tolerate profile IDs like openai/gpt-5.4

        profile_config = msg.get("profile_config") or {}

        # Tab anchor: explicit ``tab_id`` from the dispatch, else parsed from a
        # ``tab:<id>`` scope_key (unbound tabs). Lets the per-session token mint
        # pin identity on turn 1 — before any chat_session_id exists — for both
        # plan-scoped and unbound tabs. Plan `tab-identity-mode`.
        tab_id = _str("tab_id")
        if not tab_id and scope_key and scope_key.startswith("tab:"):
            tab_id = scope_key.split(":", 1)[1] or None

        return {
            "bridge_session_id": msg.get("bridge_session_id"),
            "session_policy": _str("session_policy"),
            "scope_key": scope_key,
            "tab_id": tab_id,
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
        """Normalize low-level task errors into actionable structured data.

        The wire-format category → error_code mapping lives in
        :mod:`pixsim7.client.agent_errors` so it stays next to the category
        vocabulary it depends on.
        """
        text = str(error or "").strip() or error.__class__.__name__
        if isinstance(error, SessionBusyError):
            return {
                "error": text,
                "error_code": error.error_code,
                "error_details": error.error_details,
            }
        if isinstance(error, AgentTaskError):
            err = error.err
            return {
                "error": err.message or text,
                "error_code": wire_error_code(err.category),
                "error_details": {
                    "category": err.category,
                    "http_status": err.http_status,
                    "retryable": err.retryable,
                    "retry_after_ms": err.retry_after_ms,
                },
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

        # Register inflight so pool_status reports it on (re)connect.
        import time as _time_inflight
        self._inflight_tasks[task_id] = {
            "bridge_session_id": meta.get("bridge_session_id"),
            "started_at": _time_inflight.time(),
            "action": "processing_task",
            "detail": "",
        }
        # Reverse-map cli_session_id → task_id so PreToolUse hooks can route
        # back to this task instead of broadcasting (plan:
        # agent-confirmation-hooks / cross-tab-fanout-fix). For resumed
        # conversations the bridge_session_id IS Claude's cli_session_id —
        # map it immediately. New conversations don't know it yet; the
        # on_progress 'session_resolved' branch below populates the map
        # once Claude's init event arrives.
        if meta.get("bridge_session_id"):
            self._cli_session_to_task[str(meta["bridge_session_id"])] = task_id

        # Set in-process dispatch session so MCP tools (log_work) can
        # resolve the correct chat session without file I/O races.
        from pixsim7.client.mcp_server import set_dispatch_session
        set_dispatch_session(meta["bridge_session_id"])

        # Per-request user token — passed to pool.send_message() which writes
        # it to the target session's isolated token file (no shared file race)
        user_token = msg.get("user_token")

        # Focus handling:
        # - Claude: per-session temp MCP config
        # - Codex: project-local .codex/config.toml selected by workdir
        mcp_config_override = None
        # Claude sessions need the project root as cwd so they can find
        # .claude/settings.json (hooks, permissions).  Codex sessions get
        # a focus-scoped workdir with a project-local .codex/config.toml.
        session_workdir: str | None = str(self._repo_root)
        codex_workdir = None
        if meta["engine"] == "codex":
            if self._token_file:
                api_base = self._ws_url_to_http_base()
                mcp_server_script = self._mcp_server_script_path()
                if not self._mcp_python_runtime:
                    self._mcp_python_runtime = self._resolve_mcp_python()
                mcp_python_cmd, mcp_python_prefix = self._mcp_python_runtime
                # Per-session identity for codex: mint a bridge-session JWT
                # carrying tab_id/scope_key/chat_session_id claims so the
                # codex subprocess's MCP traffic is no longer service-token
                # anonymous. Same path Claude uses
                # (_ensure_per_session_mcp_config) — falls back to the legacy
                # user_token / service_token on mint failure. Plan
                # ``tab-identity-mode`` / codex parity.
                codex_tab_id = meta.get("tab_id")
                codex_session_id = str(meta.get("bridge_session_id") or "")
                codex_profile_id = str(
                    msg.get("profile_id")
                    or (msg.get("profile_config") or {}).get("id")
                    or ""
                )
                effective_codex_token = str(user_token or self._service_token or "")
                if self._per_session_subprocess_enabled() and (
                    meta.get("bridge_session_id") or codex_tab_id
                ):
                    try:
                        codex_scope_key = meta.get("scope_key") or ""
                        if not codex_scope_key and codex_tab_id:
                            codex_scope_key = f"tab:{codex_tab_id}"
                        minted_token, _exp_epoch = await self._mint_agent_session_token(
                            chat_session_id=codex_session_id,
                            agent_type="codex",
                            profile_id=codex_profile_id or "unknown",
                            scope_key=codex_scope_key or None,
                            tab_id=codex_tab_id,
                            on_behalf_of=msg.get("on_behalf_of"),
                        )
                        if minted_token:
                            effective_codex_token = minted_token
                    except Exception as exc:
                        get_logger().warning(
                            "per_session_codex_token_mint_failed",
                            chat_session=codex_session_id[:12],
                            tab=str(codex_tab_id or "")[:12],
                            error=str(exc),
                        )
                codex_workdir = self._ensure_codex_project_workdir(
                    mcp_server_script,
                    api_base,
                    effective_codex_token,
                    self._token_file.path,
                    self._mcp_scope,
                    mcp_python_cmd=mcp_python_cmd,
                    mcp_python_prefix=mcp_python_prefix,
                    focus=meta["focus"],
                    chat_session_id=codex_session_id,
                    profile_id=codex_profile_id,
                    tab_id=codex_tab_id,
                )
        elif meta["focus"] or self._per_session_subprocess_enabled():
            # Per-session HTTP MCP config when the feature flag is on, even
            # without a focus filter — the per-session JWT is what carries
            # chat_session_id claims for MCP tool resolution. Falls back to
            # the legacy focus-only path on mint failure (cutover seam).
            mcp_config_override = None
            # Engage on a chat_session_id (resume / turn 2+) OR a tab anchor
            # (turn 1 of a new conversation — no session id yet, but the tab
            # pins identity). Without the tab fallback, turn 1 spawns with the
            # shared service token and the reused subprocess never reloads
            # config, so identity never attaches. Plan `tab-identity-mode`.
            tab_id = meta.get("tab_id")
            if self._per_session_subprocess_enabled() and (
                meta.get("bridge_session_id") or tab_id
            ):
                try:
                    profile_id = (
                        msg.get("profile_id")
                        or (msg.get("profile_config") or {}).get("id")
                        or "unknown"
                    )
                    sk = meta.get("scope_key") or ""
                    # Plan-scoped tabs carry scope_key="plan:<id>"; still anchor
                    # the token to the tab so resolution works on turn 1.
                    if not sk and tab_id:
                        sk = f"tab:{tab_id}"
                    mcp_config_override = await self._ensure_per_session_mcp_config(
                        chat_session_id=str(meta.get("bridge_session_id") or ""),
                        agent_type=str(meta.get("engine") or "claude"),
                        focus=meta.get("focus"),
                        profile_id=str(profile_id),
                        scope_key=sk or None,
                        tab_id=tab_id,
                        on_behalf_of=msg.get("on_behalf_of"),
                    )
                except Exception as exc:
                    get_logger().warning(
                        "per_session_mcp_config_failed",
                        chat_session=str(meta.get("bridge_session_id") or "")[:12],
                        tab=str(tab_id or "")[:12],
                        agent_type=meta.get("engine"),
                        error=str(exc),
                    )
                    mcp_config_override = None
            # Legacy path covers two cases:
            #  (a) feature flag off, focus present
            #  (b) flag on but mint failed (graceful fallback during cutover)
            if mcp_config_override is None and meta["focus"]:
                # Mirror the per-session path's identity extraction so the
                # legacy/fallback config still emits X-Profile-Id /
                # X-Chat-Session-Id (otherwise attribution -> 'unknown').
                fallback_profile_id = (
                    msg.get("profile_id")
                    or (msg.get("profile_config") or {}).get("id")
                    or ""
                )
                mcp_config_override = self._ensure_mcp_config(
                    focus=meta["focus"],
                    session_id=str(meta.get("bridge_session_id") or ""),
                    profile_id=str(fallback_profile_id),
                )

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
            # Honor the backend's clamp (ws_chat.py clamps to 10..1800). A
            # lower cap here silently halved the caller's turn budget before it
            # reached session.send_message — which now enforces the budget as
            # the single absolute turn bound, so the two must agree.
            timeout = max(10, min(timeout, 1800))

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
                """Emit periodic heartbeats so backend does not time out on quiet turns.

                These are BLIND connectivity ticks — they fire every 15s whether
                or not the agent is making real progress, re-sending the last
                known ``detail``. They are tagged ``keepalive: True`` so the
                backend's dispatch watchdog can tell them apart from genuine
                progress events (``on_progress`` → ``send_progress``): a blind
                keepalive proves the bridge is alive but must NOT reset the
                no-progress stall timer, or a hung agent (e.g. a vitest/Bash that
                never returns) would be masked forever and the panel would freeze
                with no result. See remote_cmd_bridge.dispatch_task_streaming.
                """
                while not keepalive_done.is_set():
                    await asyncio.sleep(15)
                    if keepalive_done.is_set():
                        break
                    try:
                        await ws.send(json.dumps({
                            **hb_base,
                            "action": "processing_task",
                            "detail": last_detail,
                            "keepalive": True,
                        }))
                    except Exception:
                        pass

            def on_progress(event_type: str, detail: str):
                nonlocal last_detail
                # Special-case: agent client telling us the cli_session_id has
                # been resolved (first init event of a brand-new turn). Stamp
                # it onto hb_base so all subsequent heartbeats / keepalives
                # carry it back to the backend WS chat — which forwards it to
                # the panel, where it's mirrored onto tab.sessionId before the
                # final `result` arrives. First-message HMR recovery hinges on
                # this id reaching the panel early.
                if event_type == "session_resolved" and detail:
                    # Cross-tab-fanout-fix: register the freshly-resolved
                    # cli_session_id in the reverse map so a PreToolUse hook
                    # firing later this turn (e.g. AskUserQuestion) routes
                    # back to this task instead of fanning out.
                    self._cli_session_to_task[str(detail)] = task_id
                    if not hb_base.get("bridge_session_id"):
                        hb_base["bridge_session_id"] = detail
                        inflight = self._inflight_tasks.get(task_id)
                        if inflight is not None:
                            inflight["bridge_session_id"] = detail
                        # Flush a heartbeat now so the backend doesn't have to
                        # wait up to 15s for the next keepalive cycle.
                        asyncio.ensure_future(send_progress("processing_task", last_detail))
                    return
                # Plan `chat-session-durable-resume` CP-C: the CLI could not
                # restore the requested conversation and started a fresh one.
                # Stamp it onto hb_base + inflight so it rides every
                # subsequent heartbeat AND the final result envelope (the
                # backend forwards whichever lands), then flush immediately.
                if event_type == "resume_failed" and detail:
                    try:
                        parsed_rf = json.loads(detail)
                    except Exception:
                        parsed_rf = {"requested": None, "actual": None}
                    hb_base["resume_failed"] = parsed_rf
                    inflight = self._inflight_tasks.get(task_id)
                    if inflight is not None:
                        inflight["resume_failed"] = parsed_rf
                    get_logger().warning(
                        "resume_failed",
                        task=task_id[:8],
                        requested=str(parsed_rf.get("requested"))[:12],
                        actual=str(parsed_rf.get("actual"))[:12],
                    )
                    asyncio.ensure_future(send_progress("resume_failed", detail))
                    return
                if detail:
                    last_detail = detail[:200]
                # Mirror onto inflight record so reconnect handshakes carry
                # the latest action/detail without an extra heartbeat hop.
                inflight = self._inflight_tasks.get(task_id)
                if inflight is not None:
                    inflight["action"] = event_type or inflight.get("action", "")
                    if detail:
                        inflight["detail"] = detail[:200]
                asyncio.ensure_future(send_progress(event_type, detail))

            # ── Tool gate: intercept built-in tool_use events ──
            gated_tools = self._get_gated_tools()

            async def tool_gate(tool_name: str, tool_input: dict) -> bool:
                if not gated_tools or tool_name not in gated_tools:
                    return True  # not gated — allow
                get_logger().info("tool_gate_requesting", tool=tool_name, task=task_id[:8])
                # Route through the same confirmation flow as ask_user
                result = await self._hook_confirm({
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                    "title": f"Tool: {tool_name}",
                    "description": _describe_tool_for_gate(tool_name, tool_input),
                    "timeout_s": 120,
                    "task_id": task_id,
                })
                approved = result.get("approved", False)
                get_logger().info("tool_gate_result", tool=tool_name, approved=approved)
                return approved

            keepalive_task = asyncio.create_task(send_keepalive())
            try:
                session_id, response = await self._pool.send_message(
                    prompt, timeout=timeout, images=images, on_progress=on_progress,
                    tool_gate=tool_gate if gated_tools else None,
                    bridge_session_id=meta["bridge_session_id"],
                    engine=meta["engine"],
                    model=meta["model"],
                    reasoning_effort=meta["reasoning_effort"],
                    session_policy=meta["session_policy"],
                    scope_key=meta["scope_key"],
                    mcp_config_path=mcp_config_override,
                    workdir=codex_workdir or session_workdir,
                    user_token=user_token,
                )
                self._tasks_handled += 1

                # Get conversation session UUID for resume support
                session = next((s for s in self._pool.sessions if s.session_id == session_id), None)
                bridge_session_id = session.cli_session_id if session else None

                # Update dispatch session with resolved ID — new conversations
                # get their session ID after the first turn.
                if bridge_session_id:
                    set_dispatch_session(bridge_session_id)

                get_logger().info("task_complete", task=task_id[:8], session=session_id, chars=len(response))

                result_msg: dict = {
                    "type": "result",
                    "task_id": task_id,
                    "edited_prompt": response,
                }
                if bridge_session_id:
                    result_msg["bridge_session_id"] = bridge_session_id
                # CP-C: carry the resume-failure verdict on the result too, so
                # a turn whose heartbeats were missed (WS hiccup) still tells
                # the panel the conversation context was lost.
                if hb_base.get("resume_failed"):
                    result_msg["resume_failed"] = hb_base["resume_failed"]
                # Include the original session ID from the task for linking
                original_session_id = meta.get("bridge_session_id")
                if original_session_id and original_session_id != bridge_session_id:
                    result_msg["original_session_id"] = original_session_id
                try:
                    await ws.send(json.dumps(result_msg))
                except Exception:
                    # WS dead — buffer result for replay on reconnect, and
                    # mirror to disk so it survives a bridge process restart.
                    self._buffered_results[task_id] = result_msg
                    self._persist_buffered_result(task_id, result_msg)
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
            details = error_payload.get("error_details") or {}
            get_logger().error(
                "task_error",
                task=task_id[:8],
                error=error_payload["error"],
                error_code=error_payload["error_code"],
                category=details.get("category"),
                http_status=details.get("http_status"),
                retryable=details.get("retryable"),
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
                # WS dead — buffer error for replay on reconnect, and mirror
                # to disk so it survives a bridge process restart.
                self._buffered_results[task_id] = error_msg
                self._persist_buffered_result(task_id, error_msg)
                get_logger().warning("ws_dead_buffered_error", task=task_id[:8])
        finally:
            # Whatever happened — success, buffered, or error — the bridge is
            # no longer actively running this task. Drop it so the next
            # pool_status reflects reality.
            self._inflight_tasks.pop(task_id, None)
            # Drop reverse cli_session → task mappings that pointed here so a
            # PreToolUse hook /confirm arriving after task completion doesn't
            # route to a stale task. Iterate by list() since we mutate.
            for _cli, _tid in list(self._cli_session_to_task.items()):
                if _tid == task_id:
                    self._cli_session_to_task.pop(_cli, None)

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
        try:
            await server.serve()
        except asyncio.CancelledError:
            # Clean shutdown path — bubble up so the awaiter sees CancelledError.
            raise
        except Exception as e:
            # Silent death of this task used to be invisible: the bridge would
            # keep reconnecting its WS while MCP tools failed with connection-
            # refused. Log it so the cause shows up in ai-client.log, then
            # re-raise so the task's exception is retrievable and the
            # supervisor in run() can relaunch us.
            get_logger().error(
                "mcp_http_server_crashed",
                error=str(e),
                error_type=type(e).__name__,
                port=self._mcp_http_port,
            )
            raise

    def _get_gated_tools(self) -> set[str]:
        """Read the tool approval list from launcher service settings (live).

        Returns set of built-in tool names that require user approval.
        Falls back to empty set (all allowed) on any error.
        """
        try:
            settings_file = self._repo_root / "data" / "launcher" / "service_settings" / "ai-client.json"
            if settings_file.exists():
                data = json.loads(settings_file.read_text(encoding="utf-8"))
                tools = data.get("hook_tools", [])
                if isinstance(tools, list) and tools:
                    return {str(t).strip() for t in tools if t}
        except Exception:
            pass
        return set()

    async def _hook_confirm(self, payload: dict) -> dict:
        """Called by hook_server when /confirm is hit.
        Routes through the WS confirmation flow to the frontend UI.
        Returns full response dict: {approved, choice?, text?}."""
        ws = self._active_ws
        if not ws or not self._connected:
            get_logger().warning("hook_confirm_no_ws", connected=self._connected, has_ws=ws is not None)
            return {"approved": True}  # auto-approve if bridge not connected (fail-open)
        # Resolve task_id (plan: agent-confirmation-hooks / cross-tab-fanout-fix):
        #   1. explicit payload['task_id'] — bridge-side tool gate already
        #      plumbs this; preserves its path verbatim.
        #   2. payload['cli_session_id'] — PreToolUse hook from
        #      hook_pretool.py forwards Claude's session_id here; we
        #      reverse-look-up via _cli_session_to_task so the backend
        #      heartbeat carries the originating task_id and doesn't fan
        #      out to every in-flight task on this bridge.
        #   3a. cli_session_id provided but unmapped → fail-open. The hook
        #       belongs to a Claude CLI this bridge doesn't own (foreign
        #       terminal session, etc.). Broadcasting via synthetic_fallback
        #       leaks the prompt into every in-flight chat tab; better to
        #       return approved:True so the foreign Claude uses its native
        #       UI. hook_pretool.py already gates on PIXSIM_BRIDGE_MANAGED
        #       so this path is mostly belt-and-suspenders.
        #   3b. cli_session_id absent (legacy hook without session forwarding)
        #       → synthetic 'hook-<uuid>' fallback, logged loudly so the
        #       historical silent fan-out is at least audible.
        task_id = payload.get("task_id")
        resolution_source = "explicit"
        if not task_id:
            cli_session = payload.get("cli_session_id")
            if cli_session:
                task_id = self._cli_session_to_task.get(str(cli_session))
                if task_id:
                    resolution_source = "cli_session_lookup"
                else:
                    get_logger().warning(
                        "hook_confirm_foreign_session",
                        cli_session=str(cli_session),
                        tool=payload.get("tool_name"),
                        in_flight_cli_sessions=list(self._cli_session_to_task.keys())[:5],
                    )
                    return {"approved": True}
            if not task_id:
                task_id = f"hook-{uuid.uuid4().hex[:8]}"
                resolution_source = "synthetic_fallback"
                get_logger().warning(
                    "hook_confirm_unrouted",
                    cli_session=None,
                    tool=payload.get("tool_name"),
                    synthetic_task=task_id,
                    in_flight_cli_sessions=list(self._cli_session_to_task.keys())[:5],
                )
        get_logger().info(
            "hook_confirm_routing",
            task_id=task_id,
            tool=payload.get("tool_name"),
            connected=self._connected,
            resolution=resolution_source,
        )
        result = await self.request_confirmation(ws, task_id, payload)
        get_logger().info("hook_confirm_result", task_id=task_id, approved=result.get("approved"), result_keys=list(result.keys()))
        return result

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
                # Bridge-side wait expired before the backend gate replied —
                # still a timeout, not a refusal.
                return {"approved": False, "timed_out": True}
        finally:
            self._pending_confirmations.pop(confirmation_id, None)
            self._confirmation_results.pop(confirmation_id, None)

    def _set_mcp_degradation(self, severity: str, reason: str) -> None:
        """Flag degraded MCP wiring so the launcher card shows it.

        ``severity``: ``"warning"`` (recoverable — regen will retry, transient
        transport blip) or ``"error"`` (unrecoverable without intervention —
        base config can't be rebuilt, HTTP server can't rebind). Idempotent:
        re-flagging the same severity keeps the original ``at`` so the badge
        doesn't flicker its age on every retry.
        """
        prev = self._mcp_degradation
        if prev and prev.get("severity") == severity and prev.get("reason") == reason:
            return
        from datetime import datetime, timezone
        self._mcp_degradation = {
            "severity": severity,
            "reason": reason,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        log = get_logger()
        (log.error if severity == "error" else log.warning)(
            "mcp_degraded", severity=severity, reason=reason,
        )

    def _clear_mcp_degradation(self) -> None:
        """MCP wiring is healthy again — drop the badge. No-op if not set."""
        if self._mcp_degradation is not None:
            get_logger().info(
                "mcp_recovered", was=self._mcp_degradation.get("severity"),
            )
            self._mcp_degradation = None

    def status(self) -> dict:
        """Bridge status summary — exposed via hook server /status for launcher UI.

        The ``scope`` block is the truthful current state, computed each tick:
        - ``shared_flag`` reflects the ``--shared`` CLI flag the bridge was
          started with (the toggle on the launcher's ai-client settings).
        - ``user_id`` is the authenticated id the backend sent back in the
          most recent WS welcome (``None`` while disconnected, or when the
          bridge is genuinely operating without a user token).
        - ``scope`` is the display label the UI should render:
          ``"user-scoped"`` if user_id is set, ``"shared"`` otherwise.

        Without this, the launcher had to infer scope from the
        ``shared-`` / ``user-N`` prefix of ``bridge_client_id``, which gets
        stale once a bridge is reassigned (Plan
        `unified-task-agent-architecture` — bridge UI scope toggle).
        """
        return {
            "connected": self._connected,
            "bridge_client_id": self._bridge_client_id,
            "tasks_handled": self._tasks_handled,
            "hook_port": self._hook_server.port if self._hook_server else None,
            "mcp_http_url": self._mcp_http_url,
            "mcp_http_port": self._mcp_http_port if self._mcp_http_url else None,
            "pending_confirmations": len(self._pending_confirmations),
            "mcp_degradation": self._mcp_degradation,
            "pool": self._pool.status(),
            "scope": {
                "shared_flag": bool(self._shared),
                "user_id": self._user_id,
                "label": "user-scoped" if self._user_id is not None else "shared",
            },
        }
