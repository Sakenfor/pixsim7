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

logger = get_logger()


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
            self.response = {"approved": False}
            return self.response

    def resolve(self, approved: bool, **extra: Any) -> None:
        self.approved = approved
        self.response = {"approved": approved, **extra}
        self._event.set()


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

    # Grace period before failing in-flight tasks after bridge disconnect.
    # The bridge client buffers results and replays them on reconnect,
    # so we wait before declaring tasks failed.
    DISCONNECT_GRACE_SECONDS = 90

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

    def get_available_agent(self, user_id: Optional[int] = None) -> Optional[RemoteAgent]:
        """Get a connected agent with remaining capacity.

        Resolution order:
        1. User's own bridge (if user_id provided and user has one)
        2. Shared/admin bridge — least-loaded (fewest active tasks)
        """
        if user_id is not None:
            # First try user's own bridge
            for agent in self._agents.values():
                if not agent.busy and agent.user_id == user_id:
                    return agent
        # Fall back to shared bridges, pick least-loaded
        shared = [a for a in self._agents.values() if not a.busy and a.user_id is None]
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

    def update_bridge_pool_status(self, bridge_client_id: str, status: Dict[str, Any]) -> None:
        """Update pool status for a connected bridge client."""
        agent = self._agents.get(bridge_client_id)
        if agent:
            agent.pool_status = status

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
        }

        # Create future for the result
        loop = asyncio.get_event_loop()
        future: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending_tasks[task_id] = future

        try:
            # Send task to agent
            await agent.websocket.send_json({
                "type": "task",
                "task_id": task_id,
                "timeout": timeout,
                **task_payload,
            })

            logger.info("remote_task_dispatched", task_id=task_id, bridge_client_id=agent.bridge_client_id)

            # Wait for result. If heartbeats are still arriving, treat the task as active
            # and extend the deadline (same behavior as streaming dispatch).
            deadline = asyncio.get_event_loop().time() + timeout
            while True:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    self._pending_tasks.pop(task_id, None)
                    self._active_tasks.pop(task_id, None)
                    raise TimeoutError(f"Remote agent did not respond within {timeout}s")

                try:
                    result = await asyncio.wait_for(asyncio.shield(future), timeout=min(remaining, 10))
                    break
                except asyncio.TimeoutError:
                    hb = self._active_tasks.get(task_id, {})
                    hb_ts = hb.get("_ts")
                    if isinstance(hb_ts, datetime):
                        age_s = (datetime.now(timezone.utc) - hb_ts).total_seconds()
                        if age_s <= timeout:
                            deadline = asyncio.get_event_loop().time() + timeout

            agent.tasks_completed += 1
            self._enrich_result(result, agent, task_payload)
            logger.info("remote_task_completed", task_id=task_id, bridge_client_id=agent.bridge_client_id)

            return result

        except asyncio.TimeoutError:
            self._pending_tasks.pop(task_id, None)
            self._active_tasks.pop(task_id, None)
            raise TimeoutError(f"Remote agent did not respond within {timeout}s")
        finally:
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
            deadline = asyncio.get_event_loop().time() + timeout

            while True:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    self._pending_tasks.pop(task_id, None)
                    self._active_tasks.pop(task_id, None)
                    raise TimeoutError(f"Remote agent did not respond within {timeout}s")

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
                    timeout=min(remaining, 10),
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if hb_wait in done:
                    hb = hb_wait.result()
                    # Each heartbeat resets the deadline
                    deadline = asyncio.get_event_loop().time() + timeout

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
                        # Reset deadline after confirmation resolved
                        deadline = asyncio.get_event_loop().time() + timeout
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

        except asyncio.TimeoutError:
            self._pending_tasks.pop(task_id, None)
            self._active_tasks.pop(task_id, None)
            raise TimeoutError(f"Remote agent did not respond within {timeout}s")
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
        """Called when a remote agent sends back a task result."""
        # Cache result for reconnect (even if SSE dropped)
        self._completed_results[task_id] = (result, time.monotonic())
        self._active_tasks.pop(task_id, None)
        self._gc_completed()

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
