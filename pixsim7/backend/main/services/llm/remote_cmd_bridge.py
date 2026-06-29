"""
Remote command bridge.

Manages WebSocket connections from user terminals and dispatches
LLM tasks to them. This is the counterpart to CommandLlmProvider
but executes on the user's machine instead of the server.

Architecture:
    User terminal ←WebSocket→ Backend ←Provider interface→ LLM system

The user runs a small agent script that:
    1. Connects via WebSocket to /ws/agent-cmd
    2. Receives task JSON
    3. Executes locally (spawns claude CLI, etc.)
    4. Returns result JSON
"""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import WebSocket
from pixsim_logging import get_logger

from pixsim7.backend.main.infrastructure.events.bus import event_bus, register_event_type

logger = get_logger()


# Bridge connectivity events — consumed by the websocket_handler so the
# frontend's bridgeStatusStore can react instantly instead of waiting for
# its 15s heartbeat poll. Payload: {"connected": int, "available": int}.
BRIDGE_STATUS_CHANGED = register_event_type(
    "bridge:status_changed",
    description="Emitted when the count of connected bridge agents changes (connect/disconnect).",
    payload_schema={"connected": "int", "available": "int", "reason": "str"},
    source="services/llm/remote_cmd_bridge",
)


def normalize_engine(value: Optional[str]) -> Optional[str]:
    """Reduce an engine identifier to its canonical short form.

    Bridges register with ``agent_type`` like ``claude-cli`` / ``codex-cli``
    (the literal CLI binary name) while WS requests carry the user-facing
    ``engine`` like ``claude`` / ``codex``. The match has to tolerate that
    suffix or every engine-filtered lookup would miss every real bridge.

    Module-level (not a method) so callers can use it without holding a
    bridge instance — the WS chat handler in particular uses it on the
    request side before it has resolved an agent.
    """
    v = (value or "").strip().lower()
    if not v:
        return None
    if v.endswith("-cli"):
        v = v[:-4]
    return v or None


class RemoteTaskError(RuntimeError):
    """Structured task failure propagated from remote bridge clients."""

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


@dataclass
class RemoteAgent:
    """A connected remote bridge client terminal.

    Bridges are shared dispatchers — they route tasks for any agent profile,
    not just one.
    """
    bridge_client_id: str
    websocket: WebSocket
    bridge_id: Optional[str] = None
    connection_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    agent_type: str = "unknown"
    user_id: Optional[int] = None  # None = shared/admin bridge
    run_id: Optional[str] = None
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    active_tasks: int = 0          # number of in-flight tasks
    current_task_ids: set = field(default_factory=set)  # in-flight task IDs (for heartbeat routing)
    max_concurrent: int = 4        # max concurrent tasks before considered fully busy
    tasks_completed: int = 0
    metadata: Dict[str, str] = field(default_factory=dict)
    available_models: List[Dict[str, Any]] = field(default_factory=list)
    pool_status: Dict[str, Any] = field(default_factory=dict)  # pool sessions info

    @property
    def busy(self) -> bool:
        return self.active_tasks >= self.max_concurrent

    def supported_engines(self) -> set:
        """Normalized engine capabilities this bridge can actually serve.

        A single bridge registers with one ``agent_type`` (e.g. ``claude``)
        but its pool can run multiple engines — the bridge reports the real
        list as ``pool_status["engines"]`` at connect (same source the
        status endpoint surfaces). Falls back to active session-id prefixes,
        then the registered ``agent_type``, so legacy/empty pool_status
        bridges still resolve.
        """
        engines: set = set()
        pool = self.pool_status or {}
        for raw in pool.get("engines", []) or []:
            norm = normalize_engine(raw)
            if norm:
                engines.add(norm)
        if not engines:
            for s in pool.get("sessions", []) or []:
                sid = s.get("session_id") if isinstance(s, dict) else None
                if sid:
                    norm = normalize_engine(str(sid).split("-")[0])
                    if norm:
                        engines.add(norm)
        if not engines:
            norm = normalize_engine(self.agent_type)
            if norm:
                engines.add(norm)
        return engines


@dataclass
class ConfirmationGate:
    """Blocks an agent task until the user responds to a prompt."""

    confirmation_id: str
    task_id: str
    _event: asyncio.Event = field(default_factory=asyncio.Event)
    approved: bool | None = None
    response: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.monotonic)

    async def wait(self, timeout: float = 120) -> Dict[str, Any]:
        """Block until resolved or timeout. Returns full response dict."""
        try:
            await asyncio.wait_for(self._event.wait(), timeout)
            return self.response
        except asyncio.TimeoutError:
            self.approved = False
            # timed_out distinguishes "user never answered" from an explicit
            # deny — ask_user surfaces this to the agent so silence isn't
            # misread as a refusal.
            self.response = {"approved": False, "timed_out": True}
            return self.response

    def resolve(self, approved: bool, **extra: Any) -> None:
        self.approved = approved
        self.response = {"approved": approved, **extra}
        self._event.set()


class _DispatchWatchdog:
    """Dual-deadline liveness policy shared by the streaming and non-streaming
    dispatch paths.

    Two independent deadlines, both bounded by the caller's turn ``timeout``:

    * **connectivity** — reset by ANY heartbeat (including the bridge's blind
      15s keepalives). Catches a dead/half-open bridge whose keepalive loop
      stopped.
    * **progress** — reset ONLY by *real* progress events; blind keepalives
      (``keepalive: True``) do NOT reset it. Catches a hung-but-connected agent
      (a Bash/vitest that never returns) that keepalives would otherwise mask
      forever — the panel would keep receiving heartbeats, never go stale, and
      freeze with no result.

    Centralising this here keeps both dispatch loops honest: they differ only in
    how they acquire events (queue-drain+yield vs await-future), not in the
    liveness rules. See ``HEARTBEAT_GAP_TIMEOUT_S`` / ``NO_PROGRESS_TIMEOUT_S``.
    """

    def __init__(self, *, timeout: float, gap_timeout: float, progress_timeout: float) -> None:
        self.timeout = timeout
        self.gap = min(timeout, gap_timeout)
        self.progress = min(timeout, progress_timeout)
        now = asyncio.get_event_loop().time()
        self._conn_deadline = now + self.gap
        self._progress_deadline = now + self.progress

    def record(self, *, real_progress: bool) -> None:
        """Register an event. Any event proves connectivity; only real progress
        clears the stall watchdog."""
        now = asyncio.get_event_loop().time()
        self._conn_deadline = now + self.gap
        if real_progress:
            self._progress_deadline = now + self.progress

    def remaining(self) -> float:
        """Seconds until the nearest deadline (may be negative if expired)."""
        now = asyncio.get_event_loop().time()
        return min(self._conn_deadline - now, self._progress_deadline - now)

    def expired_reason(self) -> Optional[str]:
        """A ``TimeoutError`` message if a deadline has passed, else ``None``.
        Connectivity takes priority when both have expired."""
        now = asyncio.get_event_loop().time()
        if self._conn_deadline - now <= 0:
            return (
                f"Remote agent sent no heartbeat for {self.gap}s "
                f"(turn budget {self.timeout}s) — bridge/agent presumed disconnected"
            )
        if self._progress_deadline - now <= 0:
            return (
                f"Remote agent made no progress for {self.progress}s "
                f"(turn budget {self.timeout}s) — agent presumed stalled "
                f"(e.g. a tool or command that never returned)"
            )
        return None


class RemoteCommandBridge:
    """Manages remote agent WebSocket connections and task dispatch."""

    def __init__(self) -> None:
        self._agents: Dict[str, RemoteAgent] = {}
        self._pending_tasks: Dict[str, asyncio.Future] = {}
        self._heartbeat_queues: Dict[str, asyncio.Queue] = {}  # task_id -> queue
        # Completed task results cache: task_id -> (result dict, monotonic timestamp)
        # Kept for up to 5 minutes, max 200 entries.
        self._completed_results: Dict[str, tuple[Dict[str, Any], float]] = {}
        # Active task tracking: task_id -> {_ts, bridge_id, bridge_client_id, user_id}
        self._active_tasks: Dict[str, Dict[str, Any]] = {}
        # Available models per engine (engine -> list of model dicts)
        self._engine_models: Dict[str, List[Dict[str, Any]]] = {}
        # Pending confirmation gates: confirmation_id -> ConfirmationGate
        self._confirmation_gates: Dict[str, ConfirmationGate] = {}

    async def connect(
        self,
        websocket: WebSocket,
        bridge_client_id: Optional[str] = None,
        agent_type: str = "unknown",
        user_id: Optional[int] = None,
        run_id: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        bridge_id: Optional[str] = None,
    ) -> RemoteAgent:
        """Register a new remote agent connection (or reconnect an existing one)."""
        await websocket.accept()
        client_id = (bridge_client_id or "").strip()
        if not client_id:
            raise RuntimeError("Bridge client ID is required")

        # Reconnect: preserve stats from previous connection
        old = self._agents.get(client_id)
        tasks_completed = old.tasks_completed if old else 0

        agent = RemoteAgent(
            bridge_client_id=client_id,
            bridge_id=(bridge_id.strip() if isinstance(bridge_id, str) and bridge_id.strip() else None),
            websocket=websocket,
            agent_type=agent_type,
            user_id=user_id,
            run_id=run_id,
            metadata=metadata or {},
        )
        agent.tasks_completed = tasks_completed
        was_present = old is not None
        self._agents[client_id] = agent

        if old:
            logger.info(
                "remote_agent_reconnected",
                bridge_client_id=client_id,
                bridge_id=agent.bridge_id,
                tasks_completed=tasks_completed,
            )
        else:
            logger.info(
                "remote_agent_connected",
                bridge_client_id=client_id,
                bridge_id=agent.bridge_id,
                agent_type=agent_type,
                user_id=user_id,
            )

        # Notify subscribers (frontend bridgeStatusStore via WS broadcast)
        # only on a real new connection — reconnects don't change the count.
        if not was_present:
            self._publish_status_change("agent_connected")

        # Build system prompt — always provide it so agents know the available APIs
        system_prompt = None
        try:
            from pixsim7.backend.main.api.v1.meta_contracts import build_user_system_prompt
            system_prompt = build_user_system_prompt()
        except Exception as e:
            logger.warning("system_prompt_build_failed", error=str(e))

        # Mint a scoped service token for the bridge to call API endpoints
        service_token = None
        try:
            service_token = _mint_bridge_token(user_id)
        except Exception:
            logger.warning("bridge_token_mint_failed", bridge_client_id=client_id)

        welcome: dict = {
            "type": "connected",
            "bridge_client_id": client_id,
            "bridge_id": agent.bridge_id,
            "user_id": user_id,
            "message": "Connected to remote command bridge. Waiting for tasks.",
        }
        if system_prompt:
            welcome["system_prompt"] = system_prompt
        if service_token:
            welcome["service_token"] = service_token

        await websocket.send_json(welcome)

        return agent

    def disconnect(
        self,
        bridge_client_id: str,
        *,
        websocket: Optional[WebSocket] = None,
        connection_id: Optional[str] = None,
        grace: bool = True,
    ) -> None:
        """Remove a disconnected agent.

        If *grace* is True (default), in-flight tasks are kept pending for
        ``DISCONNECT_GRACE_SECONDS`` so a reconnecting bridge can deliver
        buffered results.  Pass ``grace=False`` for explicit user stop.
        """
        agent = self._agents.get(bridge_client_id)
        if not agent:
            return
        if websocket is not None and agent.websocket is not websocket:
            logger.info(
                "remote_agent_disconnect_stale_ignored",
                bridge_client_id=bridge_client_id,
                bridge_id=agent.bridge_id,
            )
            return
        if connection_id is not None and agent.connection_id != connection_id:
            logger.info(
                "remote_agent_disconnect_stale_connection_ignored",
                bridge_client_id=bridge_client_id,
                bridge_id=agent.bridge_id,
            )
            return

        agent = self._agents.pop(bridge_client_id, None)
        if agent:
            in_flight = list(agent.current_task_ids)
            logger.info(
                "remote_agent_disconnected",
                bridge_client_id=bridge_client_id,
                bridge_id=agent.bridge_id,
                tasks_completed=agent.tasks_completed,
                in_flight=len(in_flight),
            )
            if in_flight and grace:
                # Don't fail tasks immediately — the bridge client buffers
                # results and replays them on reconnect.  Keep futures alive
                # for a grace period so the replayed result can resolve them.
                asyncio.ensure_future(
                    self._fail_tasks_after_grace(in_flight, bridge_client_id)
                )
            elif in_flight:
                # Immediate failure (explicit user stop — no reconnect expected)
                for tid in in_flight:
                    self._completed_results[tid] = (
                        {"error": "Remote agent disconnected", "ok": False},
                        time.monotonic(),
                    )
                    future = self._pending_tasks.pop(tid, None)
                    if future and not future.done():
                        future.set_exception(ConnectionError("Remote agent disconnected"))
                    self._active_tasks.pop(tid, None)
            self._gc_completed()
            self._publish_status_change("agent_disconnected")

    # Grace period before failing in-flight tasks after bridge disconnect.
    # The bridge client buffers results and replays them on reconnect,
    # so we wait before declaring tasks failed.
    DISCONNECT_GRACE_SECONDS = 90

    # Max allowed gap BETWEEN heartbeats on an in-flight task, decoupled from
    # the per-turn ``timeout`` budget. A healthy turn emits a keepalive every
    # ~15s (bridge ``send_keepalive``), so a gap exceeding this means the
    # bridge/agent went silent (dead WS, frozen event loop) — fail fast here
    # instead of starving for the entire ``timeout`` (default 900s). This is
    # the dispatch-side counterpart to ``DISCONNECT_GRACE_SECONDS`` (which only
    # fires on a *clean* WS close); it also covers silent stalls that never
    # surface a disconnect. See plan ``launcher-health-probe-stability`` ›
    # ``dispatch-starvation-on-bridge-disconnect``.
    HEARTBEAT_GAP_TIMEOUT_S = 90

    # Max allowed gap with NO *real progress* on an in-flight task. The bridge's
    # ``send_keepalive`` emits a blind heartbeat every ~15s regardless of whether
    # the agent is doing anything, so ``HEARTBEAT_GAP_TIMEOUT_S`` above only
    # detects a dead bridge — never a hung-but-connected agent (a Bash/vitest
    # that never returns, a frozen tool). Those keepalives are tagged
    # ``keepalive: True``; only genuine progress events reset this deadline, so a
    # turn that stops making progress for this long is failed even while
    # keepalives keep flowing. Without it the panel receives heartbeats forever,
    # never goes stale, and freezes on the last activity line with no result.
    # Bounded by the caller's ``timeout`` via ``min(...)``. Trade-off: a single
    # legitimately long blocking command that emits no progress is also capped
    # here — run such work in the background (run_in_background) so it surfaces
    # managed-process progress instead.
    NO_PROGRESS_TIMEOUT_S = 300

    async def _fail_tasks_after_grace(
        self,
        task_ids: List[str],
        bridge_client_id: str,
    ) -> None:
        """Wait for bridge reconnect before failing in-flight tasks."""
        await asyncio.sleep(self.DISCONNECT_GRACE_SECONDS)
        failed = 0
        for tid in task_ids:
            future = self._pending_tasks.pop(tid, None)
            if future and not future.done():
                self._completed_results[tid] = (
                    {"error": "Remote agent disconnected", "ok": False},
                    time.monotonic(),
                )
                future.set_exception(ConnectionError("Remote agent disconnected"))
                self._active_tasks.pop(tid, None)
                failed += 1
        if failed:
            logger.info(
                "grace_period_expired",
                bridge_client_id=bridge_client_id,
                failed=failed,
                total=len(task_ids),
            )

    async def force_disconnect(self, bridge_client_id: str) -> bool:
        """Force-close a bridge's WebSocket from the server side.

        Used by the UI stop button for externally-started bridges
        that the server doesn't have a subprocess handle for.
        Sends a shutdown command so the client exits cleanly instead
        of reconnecting, then closes the WebSocket.
        Returns True if the bridge was found and closed.
        """
        agent = self._agents.get(bridge_client_id)
        if not agent:
            return False
        try:
            await agent.websocket.send_json({"type": "shutdown"})
        except Exception:
            pass
        try:
            await agent.websocket.close(code=1000, reason="Stopped by user")
        except Exception:
            pass
        self.disconnect(bridge_client_id, grace=False)
        return True

    async def force_disconnect_all(self) -> int:
        """Force-close all connected bridges. Returns count disconnected."""
        ids = list(self._agents.keys())
        count = 0
        for cid in ids:
            if await self.force_disconnect(cid):
                count += 1
        return count

    async def abort_tab(self, tab_id: str, user_id: Optional[int] = None) -> bool:
        """Tell the owning bridge to interrupt the in-flight turn for *tab_id*.

        This is the real-stop path: cancelling the server-side dispatch task
        only abandons our ``await`` — the CLI keeps running. Here we resolve
        the active task for the tab, find its bridge agent, and send an
        ``abort`` frame so the client can interrupt the live CLI turn. Returns
        True if an abort was dispatched (False if no matching active task /
        agent, or the send failed).
        """
        target = (tab_id or "").strip()
        if not target:
            return False
        for task_id, info in list(self._active_tasks.items()):
            if str(info.get("tab_id") or "") != target:
                continue
            if user_id is not None and info.get("user_id") not in (None, user_id):
                continue
            bridge_client_id = str(info.get("bridge_client_id") or "")
            agent = self._agents.get(bridge_client_id)
            if not agent:
                continue
            try:
                await agent.websocket.send_json({"type": "abort", "task_id": task_id})
                logger.info(
                    "remote_task_abort_sent",
                    task_id=task_id,
                    tab_id=target,
                    bridge_client_id=bridge_client_id,
                )
                return True
            except Exception as exc:
                logger.warning(
                    "remote_task_abort_failed",
                    task_id=task_id,
                    tab_id=target,
                    error=str(exc),
                )
        return False

    async def steer_tab(
        self,
        tab_id: str,
        message: str,
        user_id: Optional[int] = None,
    ) -> bool:
        """Inject a user message into the in-flight turn for *tab_id* (live
        steering — type while the agent works).

        Resolves the tab's active task, finds its bridge agent, and forwards a
        ``steer`` frame so the client can write the message into the running
        CLI's input stream. Returns True if delivered (False if no matching
        active task / agent, blank message, or the send failed).
        """
        target = (tab_id or "").strip()
        if not target or not (message or "").strip():
            return False
        for task_id, info in list(self._active_tasks.items()):
            if str(info.get("tab_id") or "") != target:
                continue
            if user_id is not None and info.get("user_id") not in (None, user_id):
                continue
            bridge_client_id = str(info.get("bridge_client_id") or "")
            agent = self._agents.get(bridge_client_id)
            if not agent:
                continue
            try:
                await agent.websocket.send_json(
                    {"type": "steer", "task_id": task_id, "message": message}
                )
                logger.info(
                    "remote_task_steer_sent",
                    task_id=task_id,
                    tab_id=target,
                    bridge_client_id=bridge_client_id,
                    chars=len(message),
                )
                return True
            except Exception as exc:
                logger.warning(
                    "remote_task_steer_failed",
                    task_id=task_id,
                    tab_id=target,
                    error=str(exc),
                )
        return False

    def get_available_agent(
        self,
        user_id: Optional[int] = None,
        agent_type: Optional[str] = None,
    ) -> Optional[RemoteAgent]:
        """Get a connected agent with remaining capacity.

        Resolution order:
        1. User's own bridge (if user_id provided and user has one)
        2. Shared/admin bridge — least-loaded (fewest active tasks)

        When ``agent_type`` is given, only agents that can actually serve
        that engine (e.g. "claude", "codex") are eligible. Matching uses the
        bridge's full engine capability set — a single bridge registered as
        ``claude`` whose pool also runs ``codex`` matches a ``codex``
        request. Without this a multi-engine bridge would reject codex
        lookups and the caller would silently fall back to claude (running
        a codex profile's model on the claude binary). ``agent_type=None``
        keeps the legacy any-engine behavior for callers that don't care.
        """
        wanted = normalize_engine(agent_type)

        def _matches(a: "RemoteAgent") -> bool:
            if a.busy:
                return False
            if wanted is None:
                return True
            return wanted in a.supported_engines()

        if user_id is not None:
            # First try user's own bridge
            for agent in self._agents.values():
                if _matches(agent) and agent.user_id == user_id:
                    return agent
        # Fall back to shared bridges, pick least-loaded
        shared = [a for a in self._agents.values() if _matches(a) and a.user_id is None]
        if shared:
            return min(shared, key=lambda a: a.active_tasks)
        return None

    def get_agents(self, user_id: Optional[int] = None) -> List[RemoteAgent]:
        """List connected agents, optionally filtered by user."""
        if user_id is not None:
            return [a for a in self._agents.values() if a.user_id == user_id or a.user_id is None]
        return list(self._agents.values())

    def get_agent_by_bridge_client_id(
        self,
        bridge_client_id: str,
        user_id: Optional[int] = None,
    ) -> Optional[RemoteAgent]:
        """Get a connected bridge client by ID, optionally enforcing user visibility."""
        agent = self._agents.get(bridge_client_id)
        if agent is None:
            return None
        if user_id is not None and agent.user_id not in (None, user_id):
            return None
        return agent

    def get_agent_by_bridge_id(self, bridge_id: str, user_id: Optional[int] = None) -> Optional[RemoteAgent]:
        """Get a connected agent by stable bridge UUID."""
        target = (bridge_id or "").strip()
        if not target:
            return None
        for agent in self._agents.values():
            if (agent.bridge_id or "") != target:
                continue
            if user_id is not None and agent.user_id not in (None, user_id):
                continue
            return agent
        return None

    @property
    def has_available(self) -> bool:
        return any(not a.busy for a in self._agents.values())

    def has_available_for_user(self, user_id: int) -> bool:
        return self.get_available_agent(user_id=user_id) is not None

    @property
    def connected_count(self) -> int:
        return len(self._agents)

    def _publish_status_change(self, reason: str) -> None:
        """Fire-and-forget bridge:status_changed event.

        Called from sync code paths (disconnect) and async ones (connect).
        We schedule via ensure_future so the publish never blocks the
        connect/disconnect path even if the event handlers are slow.
        """
        available = sum(1 for a in self._agents.values() if not a.busy)
        payload = {
            "connected": len(self._agents),
            "available": available,
            "reason": reason,
        }
        try:
            asyncio.ensure_future(event_bus.publish(BRIDGE_STATUS_CHANGED, payload))
        except RuntimeError:
            # No running loop (e.g. unit tests calling sync paths) — drop
            # silently rather than crash. Polling fallback covers this.
            pass

    def update_bridge_pool_status(self, bridge_client_id: str, status: Dict[str, Any]) -> None:
        """Update pool status for a connected bridge client.

        Also re-registers any in-flight task IDs the bridge reports. This is
        what lets a frontend re-attach to a running task after the backend
        was restarted: the bridge survives the outage, reports its currently
        running task_ids on reconnect, and we rebuild the dispatch state so
        ``_handle_reconnect`` can stream heartbeats and the eventual result.
        """
        agent = self._agents.get(bridge_client_id)
        if not agent:
            return
        agent.pool_status = status

        # The bridge's reported session ceiling (driven by the ai-client "Max
        # Sessions" pool setting) IS the real per-bridge concurrency capacity.
        # Track it as the server-side gate so "bridge client is busy" reflects
        # what the bridge can actually run, not a hardcoded default.
        max_sessions = status.get("max_sessions") if isinstance(status, dict) else None
        if isinstance(max_sessions, int) and max_sessions > 0:
            agent.max_concurrent = max_sessions

        active_tasks = status.get("active_tasks") if isinstance(status, dict) else None
        if isinstance(active_tasks, list):
            for entry in active_tasks:
                if not isinstance(entry, dict):
                    continue
                tid = str(entry.get("task_id") or "").strip()
                if not tid:
                    continue
                self._register_active_task_from_bridge(
                    task_id=tid,
                    agent=agent,
                    bridge_session_id=entry.get("bridge_session_id"),
                    action=str(entry.get("action") or ""),
                    detail=str(entry.get("detail") or ""),
                )

    def _register_active_task_from_bridge(
        self,
        *,
        task_id: str,
        agent: RemoteAgent,
        bridge_session_id: Optional[str] = None,
        action: str = "",
        detail: str = "",
    ) -> None:
        """Re-register an in-flight task reported by a reconnecting bridge.

        Idempotent: re-registers only if the task isn't already known and
        hasn't already been completed. Creates a pending future so a future
        ``resolve_task`` (when the bridge sends the eventual result) can
        wake any reconnect handler currently awaiting it.
        """
        if task_id in self._completed_results:
            return  # already finished — bridge will replay; nothing to wait on
        if task_id in self._active_tasks:
            return  # already tracked

        self._active_tasks[task_id] = {
            "_ts": datetime.now(timezone.utc),
            "bridge_id": agent.bridge_id,
            "bridge_client_id": agent.bridge_client_id,
            "user_id": agent.user_id,
            "action": action,
            "detail": detail,
            # Handshake-replayed tasks don't carry the original prompt; leave
            # empty so resolve_task's bridge-side persistence falls back to a
            # placeholder user_message rather than missing the row entirely.
            "prompt": "",
        }
        agent.current_task_ids.add(task_id)

        if task_id not in self._pending_tasks:
            try:
                loop = asyncio.get_event_loop()
                self._pending_tasks[task_id] = loop.create_future()
            except RuntimeError:
                # No running loop (e.g. unit tests) — skip future creation;
                # resolve_task is still safe and will populate _completed_results.
                pass

        logger.info(
            "remote_task_recovered_from_handshake",
            task_id=task_id,
            bridge_client_id=agent.bridge_client_id,
        )

    def update_bridge_models(
        self,
        bridge_client_id: str,
        models: List[Dict[str, Any]],
        engine: Optional[str] = None,
    ) -> None:
        """Update available models. Stored per engine, not per bridge client."""
        engine_key = (
            engine
            or (self._agents[bridge_client_id].agent_type if bridge_client_id in self._agents else "unknown")
        )
        self._engine_models[engine_key] = models
        logger.info(
            "engine_models_updated",
            engine=engine_key,
            count=len(models),
            bridge_client_id=bridge_client_id,
        )

    def get_available_models(self, agent_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get available models, optionally filtered by engine/agent_type."""
        if agent_type:
            return list(self._engine_models.get(agent_type, []))
        # Return all models across engines
        seen: set = set()
        result: List[Dict[str, Any]] = []
        for models in self._engine_models.values():
            for m in models:
                mid = m.get("id", "")
                if mid and mid not in seen:
                    seen.add(mid)
                    result.append(m)
        return result

    async def dispatch_task(
        self,
        task_payload: Dict[str, Any],
        timeout: int = 120,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Send a task to an available remote agent and wait for the result.

        Args:
            task_payload: JSON-serializable task (same contract as cmd-llm stdin)
            timeout: Seconds to wait for result
            user_id: Route to this user's bridge first, then shared bridges

        Returns:
            Result dict from the remote agent

        Raises:
            RuntimeError: No agents available
            TimeoutError: Agent didn't respond in time
            ConnectionError: Agent disconnected during task
        """
        agent = self.get_available_agent(user_id=user_id)
        if not agent:
            raise RuntimeError("No remote agents available")
        return await self._dispatch_to_agent(agent=agent, task_payload=task_payload, timeout=timeout)

    def _resolve_target_agent(
        self,
        *,
        bridge_client_id: Optional[str] = None,
        bridge_id: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> RemoteAgent:
        """Resolve a target agent by bridge_client_id or bridge_id, validating availability."""
        if bridge_client_id:
            target = bridge_client_id.strip()
            if not target:
                raise RuntimeError("Target bridge client ID is required")
            agent = self.get_agent_by_bridge_client_id(target, user_id=user_id)
            label = f"bridge client '{target}'"
        elif bridge_id:
            target = bridge_id.strip()
            if not target:
                raise RuntimeError("Target bridge ID is required")
            agent = self.get_agent_by_bridge_id(target, user_id=user_id)
            label = f"bridge '{target}'"
        else:
            raise RuntimeError("Either bridge_client_id or bridge_id is required")

        if not agent:
            raise RuntimeError(f"Target {label} is not connected")
        if agent.busy:
            raise RuntimeError(f"Target {label} is busy")
        return agent

    async def dispatch_task_to_bridge_client(
        self,
        bridge_client_id: str,
        task_payload: Dict[str, Any],
        timeout: int = 120,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Dispatch a task to a specific connected bridge client ID."""
        agent = self._resolve_target_agent(bridge_client_id=bridge_client_id, user_id=user_id)
        return await self._dispatch_to_agent(agent=agent, task_payload=task_payload, timeout=timeout)

    async def dispatch_task_to_bridge(
        self,
        bridge_id: str,
        task_payload: Dict[str, Any],
        timeout: int = 120,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Dispatch a task to a specific connected bridge UUID."""
        agent = self._resolve_target_agent(bridge_id=bridge_id, user_id=user_id)
        return await self._dispatch_to_agent(agent=agent, task_payload=task_payload, timeout=timeout)

    @staticmethod
    def _enrich_result(
        result: Any,
        agent: RemoteAgent,
        task_payload: Dict[str, Any],
    ) -> None:
        """Stamp bridge identity and engine onto the result dict."""
        if not isinstance(result, dict):
            return
        result.setdefault("bridge_client_id", agent.bridge_client_id)
        if agent.bridge_id:
            result.setdefault("bridge_id", agent.bridge_id)
        engine = task_payload.get("engine") or agent.agent_type
        if engine:
            result.setdefault("engine", engine)

    async def _dispatch_to_agent(
        self,
        *,
        agent: RemoteAgent,
        task_payload: Dict[str, Any],
        timeout: int,
    ) -> Dict[str, Any]:
        task_id = str(uuid.uuid4())
        agent.active_tasks += 1
        agent.current_task_ids.add(task_id)
        self._active_tasks[task_id] = {
            "_ts": datetime.now(timezone.utc),
            "bridge_id": agent.bridge_id,
            "bridge_client_id": agent.bridge_client_id,
            "user_id": agent.user_id,
            "action": "",
            "detail": "",
            # Stash the user prompt so resolve_task can persist the user+
            # assistant pair to ChatSession the moment the agent replies, even
            # if no WS handler is alive to await the future.
            "prompt": str(task_payload.get("prompt") or ""),
            # Carry the tab so a user-initiated cancel can resolve THIS task and
            # send the bridge an `abort` to interrupt the live CLI turn.
            "tab_id": str(task_payload.get("tab_id") or ""),
        }

        # Create future for the result
        loop = asyncio.get_event_loop()
        future: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending_tasks[task_id] = future
        # A heartbeat queue lets this non-streaming path drive the SAME liveness
        # watchdog the streaming path uses — including the keepalive vs real-
        # progress distinction. Without reading the queue we could only poll the
        # ``_ts`` timestamp, which blind keepalives bump too, so a hung agent
        # would extend the deadline forever (the masking bug fixed here).
        self._heartbeat_queues[task_id] = asyncio.Queue(maxsize=64)

        try:
            # Send task to agent
            await agent.websocket.send_json({
                "type": "task",
                "task_id": task_id,
                "timeout": timeout,
                **task_payload,
            })

            logger.info("remote_task_dispatched", task_id=task_id, bridge_client_id=agent.bridge_client_id)

            hb_queue = self._heartbeat_queues[task_id]
            watchdog = _DispatchWatchdog(
                timeout=timeout,
                gap_timeout=self.HEARTBEAT_GAP_TIMEOUT_S,
                progress_timeout=self.NO_PROGRESS_TIMEOUT_S,
            )

            result: Dict[str, Any]
            while True:
                reason = watchdog.expired_reason()
                if reason is not None:
                    self._pending_tasks.pop(task_id, None)
                    self._active_tasks.pop(task_id, None)
                    raise TimeoutError(reason)

                if future.done():
                    result = future.result()
                    break

                hb_wait = asyncio.ensure_future(hb_queue.get())
                done, _pending = await asyncio.wait(
                    [hb_wait, future],
                    timeout=min(watchdog.remaining(), 10),
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if hb_wait in done:
                    hb = hb_wait.result()
                    # No UI to relay heartbeats to — consume them solely to feed
                    # the watchdog (keepalives keep connectivity fresh but don't
                    # reset the stall deadline).
                    watchdog.record(real_progress=not hb.get("keepalive"))
                else:
                    hb_wait.cancel()

                if future in done:
                    result = future.result()
                    break

            agent.tasks_completed += 1
            self._enrich_result(result, agent, task_payload)
            logger.info("remote_task_completed", task_id=task_id, bridge_client_id=agent.bridge_client_id)

            return result

        except asyncio.TimeoutError as exc:
            self._pending_tasks.pop(task_id, None)
            self._active_tasks.pop(task_id, None)
            # Preserve the watchdog's precise reason (disconnected vs stalled);
            # only synthesize a generic message for a message-less timeout.
            raise TimeoutError(
                str(exc) or f"Remote agent did not respond within {timeout}s"
            )
        finally:
            self._heartbeat_queues.pop(task_id, None)
            agent.active_tasks = max(0, agent.active_tasks - 1)
            agent.current_task_ids.discard(task_id)

    def record_heartbeat(self, bridge_client_id: str, data: Dict[str, Any]) -> None:
        """Update timestamp tracking and forward to heartbeat queue (if streaming).

        Activity state (action/detail) is tracked by AgentSessionRegistry,
        not here.  This method only maintains the timestamp needed for
        deadline extension in dispatch_task / dispatch_task_streaming.

        If the heartbeat includes a ``task_id``, it is routed to that specific
        task's queue.  Otherwise it is broadcast to all in-flight task queues
        for the agent (backward-compatible with clients that don't send task_id).

        Confirmation requests (action=confirmation_request) are forwarded as-is
        so the WS chat handler can relay them to the frontend.
        """
        agent = self._agents.get(bridge_client_id)
        if not agent:
            return
        # Capture model info from heartbeat if provided
        model = data.get("model")
        if isinstance(model, str) and model:
            agent.metadata["model"] = model

        # Determine which task(s) to route this heartbeat to.
        # Idle session keepalives (action=cli_session) have no task_id and must
        # NOT be broadcast to task queues — they would pollute in-flight task
        # heartbeat streams with "idle" activity.
        explicit_task_id = data.get("task_id")
        if explicit_task_id and explicit_task_id in agent.current_task_ids:
            target_task_ids = [explicit_task_id]
        elif data.get("action") == "cli_session":
            target_task_ids = []  # idle keepalive — timestamp-only, no queue routing
        else:
            target_task_ids = list(agent.current_task_ids)

        # Diagnostic: log confirmation_request routing
        if data.get("action") == "confirmation_request":
            logger.info(
                "confirmation_hb_routing",
                bridge_client_id=bridge_client_id,
                explicit_task_id=explicit_task_id,
                current_task_ids=list(agent.current_task_ids),
                target_task_ids=target_task_ids,
                has_queues=[tid for tid in target_task_ids if self._heartbeat_queues.get(tid)],
            )

        now = datetime.now(timezone.utc)
        for task_id in target_task_ids:
            row = self._active_tasks.get(task_id) or {}
            row["_ts"] = now
            row.setdefault("bridge_id", agent.bridge_id)
            row.setdefault("bridge_client_id", agent.bridge_client_id)
            row.setdefault("user_id", agent.user_id)
            row["action"] = data.get("action", row.get("action", ""))
            row["detail"] = data.get("detail", row.get("detail", ""))
            self._active_tasks[task_id] = row
            queue = self._heartbeat_queues.get(task_id)
            if queue:
                try:
                    queue.put_nowait(data)
                except asyncio.QueueFull:
                    pass

    async def dispatch_task_streaming(
        self,
        task_payload: Dict[str, Any],
        timeout: int = 120,
        user_id: Optional[int] = None,
        bridge_client_id: Optional[str] = None,
    ):
        """
        Async generator that yields heartbeat dicts while waiting, then yields the result.

        Each yielded dict has a "type" key: "heartbeat" for progress, "result" for final.
        Raises on timeout or error (same as dispatch_task).
        """
        if bridge_client_id:
            agent = self._resolve_target_agent(bridge_client_id=bridge_client_id, user_id=user_id)
        else:
            agent = self.get_available_agent(user_id=user_id)
            if not agent:
                raise RuntimeError("No remote agents available")

        task_id = str(uuid.uuid4())
        agent.active_tasks += 1
        agent.current_task_ids.add(task_id)
        self._active_tasks[task_id] = {
            "_ts": datetime.now(timezone.utc),
            "bridge_id": agent.bridge_id,
            "bridge_client_id": agent.bridge_client_id,
            "user_id": agent.user_id,
            "action": "",
            "detail": "",
            # Stash the user prompt so resolve_task can persist the user+
            # assistant pair to ChatSession the moment the agent replies, even
            # if this WS handler dies before consuming the future.
            "prompt": str(task_payload.get("prompt") or ""),
            # Carry the tab so a user-initiated cancel can resolve THIS task and
            # send the bridge an `abort` to interrupt the live CLI turn.
            "tab_id": str(task_payload.get("tab_id") or ""),
        }

        loop = asyncio.get_event_loop()
        future: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending_tasks[task_id] = future
        self._heartbeat_queues[task_id] = asyncio.Queue(maxsize=64)

        try:
            await agent.websocket.send_json({
                "type": "task",
                "task_id": task_id,
                "timeout": timeout,
                **task_payload,
            })
            logger.info("remote_task_dispatched", task_id=task_id, bridge_client_id=agent.bridge_client_id)

            # Yield task_id immediately so the client can persist it for
            # reconnect *before* waiting for the first agent heartbeat.
            yield {"type": "task_created", "task_id": task_id}

            hb_queue = self._heartbeat_queues[task_id]
            watchdog = _DispatchWatchdog(
                timeout=timeout,
                gap_timeout=self.HEARTBEAT_GAP_TIMEOUT_S,
                progress_timeout=self.NO_PROGRESS_TIMEOUT_S,
            )

            while True:
                reason = watchdog.expired_reason()
                if reason is not None:
                    self._pending_tasks.pop(task_id, None)
                    self._active_tasks.pop(task_id, None)
                    raise TimeoutError(reason)

                # Check if result is ready
                if future.done():
                    result = future.result()
                    agent.tasks_completed += 1
                    self._enrich_result(result, agent, task_payload)
                    result["type"] = "result"
                    yield result
                    return

                # Wait for either a heartbeat or the result (whichever comes first)
                hb_wait = asyncio.ensure_future(hb_queue.get())
                done, pending = await asyncio.wait(
                    [hb_wait, future],
                    timeout=min(watchdog.remaining(), 10),
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if hb_wait in done:
                    hb = hb_wait.result()
                    # Any heartbeat proves connectivity; only a non-keepalive
                    # event counts as real progress against the stall watchdog.
                    watchdog.record(real_progress=not hb.get("keepalive"))

                    # Confirmation request — yield as distinct event and block until resolved
                    if hb.get("action") == "confirmation_request" and hb.get("confirmation_id"):
                        conf_id = hb["confirmation_id"]
                        gate = self.create_confirmation_gate(task_id, conf_id)
                        yield {
                            "type": "confirmation_request",
                            "task_id": task_id,
                            "confirmation_id": conf_id,
                            "title": hb.get("title", "Confirmation Required"),
                            "description": hb.get("description", ""),
                            "tool_name": hb.get("tool_name"),
                            "tool_input": hb.get("tool_input"),
                            "timeout_s": hb.get("timeout_s", 120),
                            # Forward choice/text-input prompt fields — without these,
                            # ws_chat.py can't include them in the frontend message and
                            # ConfirmationCard silently falls back to approve_deny mode.
                            "interaction_type": hb.get("interaction_type"),
                            "choices": hb.get("choices"),
                            "placeholder": hb.get("placeholder"),
                        }
                        # Block until user responds — deadline paused while waiting
                        conf_timeout = float(hb.get("timeout_s", 120))
                        response = await gate.wait(timeout=conf_timeout)
                        # Send full response back to the agent bridge
                        try:
                            await agent.websocket.send_json({
                                "type": "confirmation_response",
                                "task_id": task_id,
                                "confirmation_id": conf_id,
                                **response,
                            })
                        except Exception:
                            pass
                        # User just resolved the prompt — that's real activity;
                        # reset both deadlines (they were paused during gate.wait).
                        watchdog.record(real_progress=True)
                    else:
                        yield {"type": "heartbeat", **hb}
                else:
                    hb_wait.cancel()

                if future in done:
                    result = future.result()
                    agent.tasks_completed += 1
                    self._enrich_result(result, agent, task_payload)
                    result["type"] = "result"
                    yield result
                    return

        except asyncio.TimeoutError as exc:
            self._pending_tasks.pop(task_id, None)
            self._active_tasks.pop(task_id, None)
            # Preserve the gap-accurate message raised inside the loop; only
            # synthesize one for a message-less asyncio timeout (e.g. a
            # confirmation-gate wait that timed out).
            raise TimeoutError(
                str(exc) or f"Remote agent did not respond within {timeout}s"
            )
        finally:
            self._heartbeat_queues.pop(task_id, None)
            # If the task is still pending (SSE dropped but agent still working),
            # keep task_id in current_task_ids so heartbeats continue to be tracked.
            # resolve_task/fail_task will clean up when the result arrives.
            if future.done():
                agent.active_tasks = max(0, agent.active_tasks - 1)
                agent.current_task_ids.discard(task_id)
            else:
                # SSE dropped mid-task — leave task_id for heartbeat tracking
                # but decrement active_tasks so new requests can use this agent
                # (the pending future will be resolved when the result arrives via WS)
                agent.active_tasks = max(0, agent.active_tasks - 1)

    def resolve_task(self, task_id: str, result: Dict[str, Any]) -> bool:
        """Called when a remote agent sends back a task result.

        Bridge-side persistence: schedules a fire-and-forget write of the
        user+assistant pair to ``ChatSession.messages`` the moment the result
        arrives, independent of whether any WS handler is alive to receive it.
        This is the single canonical durability path — every other consumer
        (live ``_handle_message``, reconnect, replay, drain) becomes a redundant
        safety net rather than the only chance to capture the reply.
        """
        # Stash the prompt before _active_tasks.pop strips the entry; we need it
        # for the fire-and-forget persist below.
        task_info = self._active_tasks.get(task_id) or {}

        # Cache result for reconnect (even if SSE dropped)
        self._completed_results[task_id] = (result, time.monotonic())
        self._active_tasks.pop(task_id, None)
        self._gc_completed()

        # Persist to ChatSession the instant the bridge has the reply. Routed
        # via asyncio task so resolve_task itself stays sync (called from WS
        # handlers + tests). Skips silently if there's no running loop (unit
        # tests calling resolve_task directly) or no session_id on the result.
        self._schedule_session_persistence(task_info, result)

        # Clean up agent tracking (may be stale from dropped SSE)
        for agent in self._agents.values():
            agent.current_task_ids.discard(task_id)

        future = self._pending_tasks.pop(task_id, None)
        if future and not future.done():
            future.set_result(result)
            return True
        return False

    def fail_task(
        self,
        task_id: str,
        error: str,
        *,
        error_code: str | None = None,
        error_details: dict | None = None,
    ) -> bool:
        """Called when a remote agent reports a task failure."""
        error_text = str(error or "Unknown error from remote agent")
        payload: dict[str, Any] = {"error": error_text, "ok": False}
        if error_code:
            payload["error_code"] = str(error_code)
        if isinstance(error_details, dict) and error_details:
            payload["error_details"] = error_details

        self._completed_results[task_id] = (payload, time.monotonic())
        self._active_tasks.pop(task_id, None)

        # Clean up agent tracking
        for agent in self._agents.values():
            agent.current_task_ids.discard(task_id)

        future = self._pending_tasks.pop(task_id, None)
        if future and not future.done():
            future.set_exception(
                RemoteTaskError(
                    error_text,
                    code=str(error_code) if error_code else None,
                    details=error_details if isinstance(error_details, dict) else None,
                )
            )
            return True
        return False

    # ── Confirmation gates ──

    def create_confirmation_gate(
        self,
        task_id: str,
        confirmation_id: str,
    ) -> ConfirmationGate:
        """Create a gate that blocks until the user responds to a confirmation request."""
        gate = ConfirmationGate(confirmation_id=confirmation_id, task_id=task_id)
        self._confirmation_gates[confirmation_id] = gate
        return gate

    def resolve_confirmation(self, confirmation_id: str, approved: bool, **extra: Any) -> bool:
        """Resolve a pending confirmation gate (called when user responds).
        Returns True if the gate existed and was resolved."""
        gate = self._confirmation_gates.pop(confirmation_id, None)
        if gate:
            gate.resolve(approved, **extra)
            return True
        return False

    def get_confirmation_gate(self, confirmation_id: str) -> Optional[ConfirmationGate]:
        return self._confirmation_gates.get(confirmation_id)

    def _gc_confirmation_gates(self) -> None:
        """Clean up expired confirmation gates (older than 5 minutes)."""
        now = time.monotonic()
        expired = [k for k, g in self._confirmation_gates.items() if now - g.created_at > 300]
        for k in expired:
            gate = self._confirmation_gates.pop(k, None)
            if gate and gate.approved is None:
                gate.resolve(False)  # auto-deny expired

    def get_active_task_for_user(self, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Get the currently active task for a user (if any).

        Checks dispatch state first, then falls back to recent heartbeats
        (for tasks that outlived their SSE stream).
        Activity state (action/detail) is read from AgentSessionRegistry.
        """
        from pixsim7.backend.main.services.meta.agent_sessions import agent_session_registry

        now = datetime.now(timezone.utc)

        # Primary: check dispatch state — return most recent active task
        for agent in self._agents.values():
            if user_id is not None and agent.user_id != user_id and agent.user_id is not None:
                continue
            if agent.active_tasks > 0 and agent.current_task_ids:
                # Pick the most recently dispatched task (by timestamp)
                best_tid = None
                best_ts = None
                for tid in agent.current_task_ids:
                    ts = (self._active_tasks.get(tid) or {}).get("_ts")
                    if best_ts is None or (ts and ts > best_ts):
                        best_tid = tid
                        best_ts = ts
                if best_tid:
                    task_state = self._active_tasks.get(best_tid, {})
                    session = agent_session_registry.get_session(agent.bridge_client_id)
                    return {
                        "task_id": best_tid,
                        "bridge_id": agent.bridge_id,
                        "bridge_client_id": agent.bridge_client_id,
                        "status": "active",
                        "action": session.action if session else str(task_state.get("action", "") or ""),
                        "detail": session.detail if session else str(task_state.get("detail", "") or ""),
                    }

        # Fallback: check for tasks with recent heartbeats (< 30s old)
        stale_keys = []
        for task_id, info in self._active_tasks.items():
            info_user_id = info.get("user_id")
            if user_id is not None and info_user_id not in (None, user_id):
                continue
            ts = info.get("_ts")
            if ts and (now - ts).total_seconds() > 30:
                stale_keys.append(task_id)
                continue
            task_bridge_client_id = str(info.get("bridge_client_id") or "")
            return {
                "task_id": task_id,
                "status": "active",
                "bridge_id": str(info.get("bridge_id") or "") or None,
                "bridge_client_id": task_bridge_client_id or None,
                "action": "",
                "detail": "",
            }

        for k in stale_keys:
            self._active_tasks.pop(k, None)

        return None

    def get_completed_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a cached completed result (for reconnect)."""
        entry = self._completed_results.get(task_id)
        return entry[0] if entry else None

    def pop_completed_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get and remove a cached completed result."""
        entry = self._completed_results.pop(task_id, None)
        return entry[0] if entry else None

    def _schedule_session_persistence(
        self,
        task_info: Dict[str, Any],
        result: Dict[str, Any],
    ) -> None:
        """Fire-and-forget write of the user+assistant pair to ChatSession.

        Called from ``resolve_task`` so the assistant reply lands in the DB
        the moment the bridge has it — no dependence on a WS handler being
        alive. Silently skips when:
          * no running event loop (unit tests calling resolve_task directly),
          * the result has no ``bridge_session_id`` (caller had no session),
          * the result has no extractable response text (error / cancel).

        Imports are local because the bridge module is imported very early
        during app startup and we don't want to pull the meta-contracts /
        ORM graph into that path.
        """
        if not isinstance(result, dict):
            return
        if result.get("error") or not result.get("ok", True):
            # Errors/cancellations are reported on the wire but we don't want
            # them in ChatSession.messages (transient). The error path keeps
            # using the WS handler's existing reporting.
            return

        try:
            from pixsim7.backend.main.services.meta.agent_dispatch import extract_response_text
        except Exception:
            return

        response_text = extract_response_text(result)
        if not response_text:
            return

        session_id = result.get("bridge_session_id") or task_info.get("bridge_session_id")
        if not session_id:
            return

        prompt = str(task_info.get("prompt") or "")
        duration_ms = result.get("duration_ms")
        try:
            duration_ms = int(duration_ms) if duration_ms is not None else None
        except (TypeError, ValueError):
            duration_ms = None

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            return  # no loop — tests; the live _handle_message path still covers normal runs

        async def _persist() -> None:
            try:
                from pixsim7.backend.main.api.v1.meta_contracts import _store_session_response
                await _store_session_response(
                    session_id=str(session_id),
                    user_message=prompt,
                    assistant_response=response_text,
                    duration_ms=duration_ms,
                )
            except Exception as exc:
                logger.warning(
                    "bridge_persist_session_response_failed",
                    session_id=str(session_id),
                    error=str(exc),
                )

        try:
            loop.create_task(_persist())
        except RuntimeError:
            # Loop closed between get_event_loop and create_task — extremely
            # rare; nothing to do, the cached result still lets reconnect work.
            pass

    # Results older than this are evicted regardless of cache size.
    _COMPLETED_TTL_S = 300  # 5 minutes

    def _gc_completed(self) -> None:
        """Evict results older than TTL, then cap at 200 entries."""
        now = time.monotonic()
        expired = [k for k, (_, ts) in self._completed_results.items()
                   if now - ts > self._COMPLETED_TTL_S]
        for k in expired:
            self._completed_results.pop(k, None)
        # Hard cap — drop oldest if still over limit
        if len(self._completed_results) > 200:
            by_age = sorted(self._completed_results.items(), key=lambda kv: kv[1][1])
            for k, _ in by_age[:len(self._completed_results) - 200]:
                self._completed_results.pop(k, None)


def _mint_bridge_token(user_id: Optional[int], hours: int = 24) -> Optional[str]:
    """Mint a service token for bridge/CLI use.

    The token skips session tracking (purpose=bridge) so it doesn't pollute
    the UserSession table.  The auth layer recognizes purpose=bridge tokens
    and skips session-revocation checks.
    """
    from datetime import timedelta
    from pixsim7.backend.main.services.user.token_policy import TokenKind, mint_token

    return mint_token(TokenKind.BRIDGE, user_id=user_id, ttl=timedelta(hours=hours))


# Global singleton
remote_cmd_bridge = RemoteCommandBridge()


# Re-export from canonical location (backward compat for existing importers)
from pixsim7.backend.main.services.meta.agent_dispatch import (  # noqa: F401
    TASK_MESSAGE,
    TASK_EDIT_PROMPT,
    TASK_EMBED_TEXTS,
    TASK_EMBED_IMAGES,
    build_task_payload as build_bridge_task_payload,
)
