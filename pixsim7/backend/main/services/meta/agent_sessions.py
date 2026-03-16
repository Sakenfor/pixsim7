"""
Agent session tracking.

Lightweight in-memory registry of active AI agent sessions.
Agents report heartbeats with their current activity (which contract,
which plan, what status). Sessions expire after a configurable timeout.

No DB persistence — this is ephemeral runtime state. If the server
restarts, agents re-register on their next heartbeat.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from pixsim_logging import get_logger

logger = get_logger()

SESSION_TIMEOUT_SECONDS = 120  # expire after 2 minutes of no heartbeat


@dataclass
class AgentActivity:
    """A single activity entry in an agent's timeline."""
    contract_id: Optional[str] = None
    endpoint: Optional[str] = None
    plan_id: Optional[str] = None
    action: str = ""  # e.g. "reading_plan", "editing_code", "running_codegen"
    detail: str = ""  # free-form detail
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class AgentSession:
    """An active AI agent session."""
    session_id: str
    agent_type: str = "claude"  # claude, custom, etc.
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_heartbeat: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "active"  # active, paused, completed, errored
    current_plan_id: Optional[str] = None
    current_contract_id: Optional[str] = None
    current_action: str = ""
    current_detail: str = ""
    activity_log: List[AgentActivity] = field(default_factory=list)
    metadata: Dict[str, str] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        elapsed = (datetime.now(timezone.utc) - self.last_heartbeat).total_seconds()
        return elapsed > SESSION_TIMEOUT_SECONDS

    @property
    def duration_seconds(self) -> int:
        return int((self.last_heartbeat - self.started_at).total_seconds())


class AgentSessionRegistry:
    """In-memory registry of active agent sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[str, AgentSession] = {}

    def heartbeat(
        self,
        session_id: str,
        agent_type: str = "claude",
        status: str = "active",
        contract_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        plan_id: Optional[str] = None,
        action: str = "",
        detail: str = "",
        metadata: Optional[Dict[str, str]] = None,
    ) -> AgentSession:
        """Register or update an agent session."""
        now = datetime.now(timezone.utc)

        session = self._sessions.get(session_id)
        if not session:
            session = AgentSession(
                session_id=session_id,
                agent_type=agent_type,
                started_at=now,
                metadata=metadata or {},
            )
            self._sessions[session_id] = session
            logger.info("agent_session_started", session_id=session_id, agent_type=agent_type)

        session.last_heartbeat = now
        session.status = status
        session.current_plan_id = plan_id
        session.current_contract_id = contract_id
        session.current_action = action
        session.current_detail = detail
        if metadata:
            session.metadata.update(metadata)

        # Append to activity log (keep last 50 entries)
        if action:
            session.activity_log.append(AgentActivity(
                contract_id=contract_id,
                endpoint=endpoint,
                plan_id=plan_id,
                action=action,
                detail=detail,
                timestamp=now,
            ))
            if len(session.activity_log) > 50:
                session.activity_log = session.activity_log[-50:]

        # Clean expired sessions while we're here
        self._cleanup()

        return session

    def end_session(self, session_id: str, status: str = "completed") -> Optional[AgentSession]:
        """Mark a session as ended."""
        session = self._sessions.get(session_id)
        if session:
            session.status = status
            session.last_heartbeat = datetime.now(timezone.utc)
            logger.info(
                "agent_session_ended",
                session_id=session_id,
                status=status,
                duration_s=session.duration_seconds,
            )
        return session

    def get_active(self) -> List[AgentSession]:
        """Get all non-expired sessions."""
        self._cleanup()
        return [s for s in self._sessions.values() if not s.is_expired]

    def get_all(self) -> List[AgentSession]:
        """Get all sessions including recently expired."""
        return list(self._sessions.values())

    def get_session(self, session_id: str) -> Optional[AgentSession]:
        return self._sessions.get(session_id)

    def get_by_contract(self, contract_id: str) -> List[AgentSession]:
        """Get active sessions currently working on a specific contract."""
        return [
            s for s in self.get_active()
            if s.current_contract_id == contract_id
        ]

    def get_by_plan(self, plan_id: str) -> List[AgentSession]:
        """Get active sessions currently working on a specific plan."""
        return [
            s for s in self.get_active()
            if s.current_plan_id == plan_id
        ]

    def _cleanup(self) -> None:
        """Remove sessions that have been expired for more than 5 minutes."""
        now = datetime.now(timezone.utc)
        stale = [
            sid for sid, s in self._sessions.items()
            if (now - s.last_heartbeat).total_seconds() > SESSION_TIMEOUT_SECONDS * 3
        ]
        for sid in stale:
            del self._sessions[sid]


# Global singleton
agent_session_registry = AgentSessionRegistry()
