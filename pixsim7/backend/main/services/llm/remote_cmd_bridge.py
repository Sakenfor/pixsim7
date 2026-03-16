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
    busy: bool = False
    current_task_id: Optional[str] = None
    tasks_completed: int = 0
    metadata: Dict[str, str] = field(default_factory=dict)


class RemoteCommandBridge:
    """Manages remote agent WebSocket connections and task dispatch."""

    def __init__(self) -> None:
        self._agents: Dict[str, RemoteAgent] = {}
        self._pending_tasks: Dict[str, asyncio.Future] = {}

    async def connect(self, websocket: WebSocket, agent_id: str, agent_type: str = "claude-cli", user_id: Optional[int] = None, metadata: Optional[Dict[str, str]] = None) -> RemoteAgent:
        """Register a new remote agent connection."""
        await websocket.accept()

        agent = RemoteAgent(
            agent_id=agent_id,
            websocket=websocket,
            agent_type=agent_type,
            user_id=user_id,
            metadata=metadata or {},
        )
        self._agents[agent_id] = agent

        logger.info("remote_agent_connected", agent_id=agent_id, agent_type=agent_type, user_id=user_id)

        # Build system prompt based on user scope
        system_prompt = None
        if user_id is not None:
            try:
                from pixsim7.backend.main.api.v1.meta_contracts import _build_user_system_prompt
                system_prompt = _build_user_system_prompt()
            except Exception:
                pass

        welcome: dict = {
            "type": "connected",
            "agent_id": agent_id,
            "user_id": user_id,
            "message": "Connected to remote command bridge. Waiting for tasks.",
        }
        if system_prompt:
            welcome["system_prompt"] = system_prompt

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
        agent.busy = True
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
            agent.busy = False
            agent.current_task_id = None

    def resolve_task(self, task_id: str, result: Dict[str, Any]) -> bool:
        """Called when a remote agent sends back a task result."""
        future = self._pending_tasks.pop(task_id, None)
        if future and not future.done():
            future.set_result(result)
            return True
        return False

    def fail_task(self, task_id: str, error: str) -> bool:
        """Called when a remote agent reports a task failure."""
        future = self._pending_tasks.pop(task_id, None)
        if future and not future.done():
            future.set_exception(RuntimeError(error))
            return True
        return False


# Global singleton
remote_cmd_bridge = RemoteCommandBridge()
