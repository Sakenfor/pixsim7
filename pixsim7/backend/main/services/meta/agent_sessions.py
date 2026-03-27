"""
Agent session tracking.

Lightweight in-memory registry of active AI agent sessions.
Agents report heartbeats with their current activity (which contract,
which plan, what status). Sessions expire after a configurable timeout.

No DB persistence — this is ephemeral runtime state. If the server
restarts, agents re-register on their next heartbeat.

Exports ``CanonicalHeartbeat`` — the single normalised shape for all
heartbeat data (from WS, HTTP, or internal callers).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, FrozenSet, List, Optional

from pixsim_logging import get_logger

logger = get_logger()

SESSION_TIMEOUT_SECONDS = 120  # expire after 2 minutes of no heartbeat

# ── Canonical heartbeat contract ─────────────────────────────────

_KNOWN_HB_FIELDS: FrozenSet[str] = frozenset({
    "type", "status", "action", "detail",
    "contract_id", "plan_id", "endpoint",
    "model", "task_id", "task_kind",
})


@dataclass(frozen=True)
class CanonicalHeartbeat:
    """Immutable, typed heartbeat record."""

    session_id: str
    run_id: Optional[str] = None
    agent_type: str = "claude"
    status: str = "active"
    action: str = ""
    detail: str = ""
    contract_id: Optional[str] = None
    plan_id: Optional[str] = None
    task_kind: Optional[str] = None  # "review", "build", "research", or free-form for non-plan work
    endpoint: Optional[str] = None
    task_id: Optional[str] = None
    model: Optional[str] = None
    timestamp: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    metadata: Dict[str, str] = field(default_factory=dict)


def from_ws_heartbeat(
    agent_id: str,
    agent_type: str,
    data: Dict[str, Any],
    *,
    task_id: Optional[str] = None,
) -> CanonicalHeartbeat:
    """Build a ``CanonicalHeartbeat`` from a raw WS heartbeat dict."""
    model_raw = data.get("model")
    return CanonicalHeartbeat(
        session_id=agent_id,
        agent_type=agent_type,
        status=data.get("status", "active"),
        action=data.get("action", ""),
        detail=data.get("detail", ""),
        contract_id=data.get("contract_id"),
        plan_id=data.get("plan_id"),
        task_kind=data.get("task_kind"),
        endpoint=data.get("endpoint"),
        task_id=task_id,
        model=model_raw if isinstance(model_raw, str) and model_raw else None,
        metadata={
            k: v
            for k, v in data.items()
            if k not in _KNOWN_HB_FIELDS and isinstance(v, str)
        },
    )


# ── Activity / session dataclasses ───────────────────────────────

@dataclass
class AgentActivity:
    """A single activity entry in an agent's timeline."""
    contract_id: Optional[str] = None
    endpoint: Optional[str] = None
    plan_id: Optional[str] = None
    task_kind: Optional[str] = None
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
    plan_id: Optional[str] = None
    task_kind: Optional[str] = None  # "review", "build", "research", or free-form
    contract_id: Optional[str] = None
    action: str = ""
    detail: str = ""
    activity_log: List[AgentActivity] = field(default_factory=list)
    metadata: Dict[str, str] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        elapsed = (datetime.now(timezone.utc) - self.last_heartbeat).total_seconds()
        return elapsed > SESSION_TIMEOUT_SECONDS

    @property
    def duration_seconds(self) -> int:
        return int((self.last_heartbeat - self.started_at).total_seconds())

    def to_presence(self) -> Dict[str, Any]:
        """Convert to AgentPresence-compatible dict for API responses."""
        return {
            "session_id": self.session_id,
            "agent_type": self.agent_type,
            "status": self.status,
            "action": self.action,
            "detail": self.detail,
            "plan_id": self.plan_id,
            "task_kind": self.task_kind,
            "duration_seconds": self.duration_seconds,
        }


PersistFn = Optional[Any]  # Callable[[CanonicalHeartbeat], Awaitable[None]] — loose to avoid import issues


class AgentSessionRegistry:
    """In-memory registry of active agent sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[str, AgentSession] = {}
        self._persist_fn: PersistFn = None
        # Track last persisted (action, detail) per session to avoid duplicate DB rows
        self._last_persisted: Dict[str, tuple] = {}

    def set_persist(self, fn: PersistFn) -> None:
        """Set an async callback that persists each heartbeat to the DB.

        Called once at app startup to wire in the database layer without
        making the registry depend on SQLAlchemy/DB imports.
        """
        self._persist_fn = fn

    def record(self, hb: CanonicalHeartbeat) -> AgentSession:
        """Accept a CanonicalHeartbeat and update session state."""
        session = self.heartbeat(
            session_id=hb.session_id,
            agent_type=hb.agent_type,
            status=hb.status,
            contract_id=hb.contract_id,
            endpoint=hb.endpoint,
            plan_id=hb.plan_id,
            task_kind=hb.task_kind,
            action=hb.action,
            detail=hb.detail,
            metadata=dict(hb.metadata) if hb.metadata else None,
        )
        if self._persist_fn is not None and hb.action:
            key = (hb.action, hb.detail, hb.contract_id, hb.plan_id)
            if self._last_persisted.get(hb.session_id) != key:
                self._last_persisted[hb.session_id] = key
                try:
                    import asyncio
                    asyncio.ensure_future(self._persist_fn(hb))
                except RuntimeError:
                    pass  # no event loop — skip persistence silently
        return session

    def heartbeat(
        self,
        session_id: str,
        agent_type: str = "claude",
        status: str = "active",
        contract_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        plan_id: Optional[str] = None,
        task_kind: Optional[str] = None,
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
        session.plan_id = plan_id
        session.task_kind = task_kind or session.task_kind  # sticky — once set, persists until overwritten
        session.contract_id = contract_id
        session.action = action
        session.detail = detail
        if metadata:
            session.metadata.update(metadata)

        # Append to activity log (keep last 50 entries)
        if action:
            session.activity_log.append(AgentActivity(
                contract_id=contract_id,
                endpoint=endpoint,
                plan_id=plan_id,
                task_kind=task_kind,
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
            if s.contract_id == contract_id
        ]

    def get_by_plan(self, plan_id: str) -> List[AgentSession]:
        """Get active sessions currently working on a specific plan."""
        return [
            s for s in self.get_active()
            if s.plan_id == plan_id
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
            self._last_persisted.pop(sid, None)


# Global singleton
agent_session_registry = AgentSessionRegistry()
