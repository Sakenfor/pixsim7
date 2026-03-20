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
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import WebSocket
from pixsim_logging import get_logger

logger = get_logger()


@dataclass
class RemoteAgent:
    """A connected remote agent terminal."""
    agent_id: str
    websocket: WebSocket
    agent_type: str = "claude-cli"
    user_id: Optional[int] = None  # None = shared/admin bridge
    connected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    active_tasks: int = 0          # number of in-flight tasks
    current_task_id: Optional[str] = None  # most recent task (for heartbeat tracking)
    tasks_completed: int = 0
    metadata: Dict[str, str] = field(default_factory=dict)

    @property
    def busy(self) -> bool:
        """Backward compat — True if any task is active."""
        return self.active_tasks > 0


class RemoteCommandBridge:
    """Manages remote agent WebSocket connections and task dispatch."""

    def __init__(self) -> None:
        self._agents: Dict[str, RemoteAgent] = {}
        self._pending_tasks: Dict[str, asyncio.Future] = {}
        self._heartbeat_queues: Dict[str, asyncio.Queue] = {}  # task_id -> queue
        # Completed task results cache (task_id -> result dict, kept for 5 min)
        self._completed_results: Dict[str, Dict[str, Any]] = {}
        # Active task tracking: agent_id -> {task_id, heartbeats}
        self._active_tasks: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, agent_id: str, agent_type: str = "claude-cli", user_id: Optional[int] = None, metadata: Optional[Dict[str, str]] = None) -> RemoteAgent:
        """Register a new remote agent connection (or reconnect an existing one)."""
        await websocket.accept()

        # Reconnect: preserve stats from previous connection
        old = self._agents.get(agent_id)
        tasks_completed = old.tasks_completed if old else 0

        agent = RemoteAgent(
            agent_id=agent_id,
            websocket=websocket,
            agent_type=agent_type,
            user_id=user_id,
            metadata=metadata or {},
        )
        agent.tasks_completed = tasks_completed
        self._agents[agent_id] = agent

        if old:
            logger.info("remote_agent_reconnected", agent_id=agent_id, tasks_completed=tasks_completed)
        else:
            logger.info("remote_agent_connected", agent_id=agent_id, agent_type=agent_type, user_id=user_id)

        # Build system prompt — always provide it so agents know the available APIs
        system_prompt = None
        try:
            from pixsim7.backend.main.api.v1.meta_contracts import _build_user_system_prompt
            system_prompt = _build_user_system_prompt()
        except Exception as e:
            logger.warning("system_prompt_build_failed", error=str(e))

        # Mint a scoped service token for the bridge to call API endpoints
        service_token = None
        try:
            service_token = _mint_bridge_token(user_id)
        except Exception:
            logger.warning("bridge_token_mint_failed", agent_id=agent_id)

        welcome: dict = {
            "type": "connected",
            "agent_id": agent_id,
            "user_id": user_id,
            "message": "Connected to remote command bridge. Waiting for tasks.",
        }
        if system_prompt:
            welcome["system_prompt"] = system_prompt
        if service_token:
            welcome["service_token"] = service_token

        await websocket.send_json(welcome)

        return agent

    def disconnect(self, agent_id: str) -> None:
        """Remove a disconnected agent."""
        agent = self._agents.pop(agent_id, None)
        if agent:
            logger.info("remote_agent_disconnected", agent_id=agent_id, tasks_completed=agent.tasks_completed)
            # Fail any pending task for this agent
            if agent.current_task_id and agent.current_task_id in self._pending_tasks:
                future = self._pending_tasks.pop(agent.current_task_id)
                if not future.done():
                    future.set_exception(ConnectionError("Remote agent disconnected"))

    def get_available_agent(self, user_id: Optional[int] = None) -> Optional[RemoteAgent]:
        """Get a connected, non-busy agent.

        Resolution order:
        1. User's own bridge (if user_id provided and user has one)
        2. Shared/admin bridge — least-busy (fewest tasks completed)
        """
        if user_id is not None:
            # First try user's own bridge
            for agent in self._agents.values():
                if not agent.busy and agent.user_id == user_id:
                    return agent
        # Fall back to shared bridges, pick least-busy
        shared = [a for a in self._agents.values() if not a.busy and a.user_id is None]
        if shared:
            return min(shared, key=lambda a: a.tasks_completed)
        return None

    def get_agents(self, user_id: Optional[int] = None) -> List[RemoteAgent]:
        """List connected agents, optionally filtered by user."""
        if user_id is not None:
            return [a for a in self._agents.values() if a.user_id == user_id or a.user_id is None]
        return list(self._agents.values())

    @property
    def has_available(self) -> bool:
        return any(not a.busy for a in self._agents.values())

    def has_available_for_user(self, user_id: int) -> bool:
        return self.get_available_agent(user_id=user_id) is not None

    @property
    def connected_count(self) -> int:
        return len(self._agents)

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

        task_id = str(uuid.uuid4())
        agent.active_tasks += 1
        agent.current_task_id = task_id

        # Create future for the result
        loop = asyncio.get_event_loop()
        future: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending_tasks[task_id] = future

        try:
            # Send task to agent
            await agent.websocket.send_json({
                "type": "task",
                "task_id": task_id,
                **task_payload,
            })

            logger.info("remote_task_dispatched", task_id=task_id, agent_id=agent.agent_id)

            # Wait for result
            result = await asyncio.wait_for(future, timeout=timeout)

            agent.tasks_completed += 1
            logger.info("remote_task_completed", task_id=task_id, agent_id=agent.agent_id)

            return result

        except asyncio.TimeoutError:
            self._pending_tasks.pop(task_id, None)
            raise TimeoutError(f"Remote agent did not respond within {timeout}s")
        finally:
            agent.active_tasks = max(0, agent.active_tasks - 1)
            agent.current_task_id = None

    def record_heartbeat(self, agent_id: str, data: Dict[str, Any]) -> None:
        """Forward a heartbeat to the task's heartbeat queue (if streaming)."""
        agent = self._agents.get(agent_id)
        if agent and agent.current_task_id:
            task_id = agent.current_task_id
            # Track latest heartbeat with timestamp for staleness detection
            self._active_tasks[task_id] = {
                "action": data.get("action", ""),
                "detail": data.get("detail", ""),
                "_ts": datetime.now(timezone.utc),
            }
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
    ):
        """
        Async generator that yields heartbeat dicts while waiting, then yields the result.

        Each yielded dict has a "type" key: "heartbeat" for progress, "result" for final.
        Raises on timeout or error (same as dispatch_task).
        """
        agent = self.get_available_agent(user_id=user_id)
        if not agent:
            raise RuntimeError("No remote agents available")

        task_id = str(uuid.uuid4())
        agent.active_tasks += 1
        agent.current_task_id = task_id

        loop = asyncio.get_event_loop()
        future: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending_tasks[task_id] = future
        self._heartbeat_queues[task_id] = asyncio.Queue(maxsize=64)

        try:
            await agent.websocket.send_json({
                "type": "task",
                "task_id": task_id,
                **task_payload,
            })
            logger.info("remote_task_dispatched", task_id=task_id, agent_id=agent.agent_id)

            hb_queue = self._heartbeat_queues[task_id]
            deadline = asyncio.get_event_loop().time() + timeout

            while True:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    self._pending_tasks.pop(task_id, None)
                    raise TimeoutError(f"Remote agent did not respond within {timeout}s")

                # Check if result is ready
                if future.done():
                    result = future.result()
                    agent.tasks_completed += 1
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
                    yield {"type": "heartbeat", **hb}
                else:
                    hb_wait.cancel()

                if future in done:
                    result = future.result()
                    agent.tasks_completed += 1
                    result["type"] = "result"
                    yield result
                    return

        except asyncio.TimeoutError:
            self._pending_tasks.pop(task_id, None)
            raise TimeoutError(f"Remote agent did not respond within {timeout}s")
        finally:
            self._heartbeat_queues.pop(task_id, None)
            # If the task is still pending (SSE dropped but agent still working),
            # keep agent.current_task_id so heartbeats continue to be tracked.
            # resolve_task/fail_task will clean up when the result arrives.
            if future.done():
                agent.active_tasks = max(0, agent.active_tasks - 1)
                agent.current_task_id = None
            else:
                # SSE dropped mid-task — leave task_id for heartbeat tracking
                # but mark agent as not-busy so new requests can use it
                # (the pending future will be resolved when the result arrives via WS)
                agent.active_tasks = max(0, agent.active_tasks - 1)

    def resolve_task(self, task_id: str, result: Dict[str, Any]) -> bool:
        """Called when a remote agent sends back a task result."""
        # Cache result for reconnect (even if SSE dropped)
        self._completed_results[task_id] = result
        self._active_tasks.pop(task_id, None)
        self._gc_completed()

        # Clean up agent tracking (may be stale from dropped SSE)
        for agent in self._agents.values():
            if agent.current_task_id == task_id:
                agent.current_task_id = None

        future = self._pending_tasks.pop(task_id, None)
        if future and not future.done():
            future.set_result(result)
            return True
        return False

    def fail_task(self, task_id: str, error: str) -> bool:
        """Called when a remote agent reports a task failure."""
        self._completed_results[task_id] = {"error": error, "ok": False}
        self._active_tasks.pop(task_id, None)

        # Clean up agent tracking
        for agent in self._agents.values():
            if agent.current_task_id == task_id:
                agent.current_task_id = None

        future = self._pending_tasks.pop(task_id, None)
        if future and not future.done():
            future.set_exception(RuntimeError(error))
            return True
        return False

    def get_active_task_for_user(self, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Get the currently active task for a user (if any).

        Checks dispatch state first, then falls back to recent heartbeats
        (for tasks that outlived their SSE stream).
        """
        now = datetime.now(timezone.utc)

        # Primary: check dispatch state
        for agent in self._agents.values():
            if user_id is not None and agent.user_id != user_id and agent.user_id is not None:
                continue
            if agent.busy and agent.current_task_id:
                task_info = self._active_tasks.get(agent.current_task_id, {})
                return {
                    "task_id": agent.current_task_id,
                    "agent_id": agent.agent_id,
                    "status": "active",
                    "action": task_info.get("action", ""),
                    "detail": task_info.get("detail", ""),
                }

        # Fallback: check for tasks with recent heartbeats (< 30s old)
        # These are tasks where the SSE dropped but the agent is still working
        stale_keys = []
        for task_id, info in self._active_tasks.items():
            ts = info.get("_ts")
            if ts and (now - ts).total_seconds() > 30:
                stale_keys.append(task_id)
                continue
            # Recent heartbeat — task is still active
            return {
                "task_id": task_id,
                "status": "active",
                "agent_id": "",
                "action": info.get("action", ""),
                "detail": info.get("detail", ""),
            }

        # Clean up stale entries
        for k in stale_keys:
            self._active_tasks.pop(k, None)

        return None

    def get_completed_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a cached completed result (for SSE reconnect)."""
        return self._completed_results.get(task_id)

    def pop_completed_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get and remove a cached completed result."""
        return self._completed_results.pop(task_id, None)

    def _gc_completed(self) -> None:
        """Keep only the last 20 completed results."""
        if len(self._completed_results) > 20:
            keys = list(self._completed_results.keys())
            for k in keys[:-20]:
                self._completed_results.pop(k, None)


def _mint_bridge_token(user_id: Optional[int], hours: int = 24) -> Optional[str]:
    """Mint a service token for bridge/CLI use.

    The token skips session tracking (purpose=bridge) so it doesn't pollute
    the UserSession table.  The auth layer recognizes purpose=bridge tokens
    and skips session-revocation checks.
    """
    from datetime import timedelta
    from pixsim7.backend.main.shared.auth import create_access_token

    ttl = timedelta(hours=hours)

    if user_id is not None:
        return create_access_token(
            data={
                "sub": str(user_id),
                "purpose": "bridge",
                "role": "user",
                "is_admin": False,
                "permissions": [],
                "is_active": True,
            },
            expires_delta=ttl,
        )
    else:
        # Shared bridge: admin-level service token.
        # sub=0 signals a service identity (no real user row).
        return create_access_token(
            data={
                "sub": "0",
                "purpose": "bridge",
                "role": "admin",
                "is_admin": True,
                "permissions": [],
                "is_active": True,
            },
            expires_delta=ttl,
        )


# Global singleton
remote_cmd_bridge = RemoteCommandBridge()
