from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow

PLAN_META_SCHEMA = "dev_meta"


class PlanSyncRun(SQLModel, table=True):
    """A single filesystem->DB sync attempt with aggregate counters."""

    __tablename__ = "plan_sync_runs"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    status: str = Field(default="running", max_length=32, index=True)
    started_at: datetime = Field(default_factory=utcnow, index=True)
    finished_at: Optional[datetime] = Field(default=None, index=True)
    commit_sha: Optional[str] = Field(default=None, max_length=64)
    actor: Optional[str] = Field(default=None, max_length=120)
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))
    created: int = Field(default=0)
    updated: int = Field(default=0)
    removed: int = Field(default=0)
    unchanged: int = Field(default=0)
    events: int = Field(default=0)
    duration_ms: Optional[int] = Field(default=None)
    changed_fields: Optional[Dict[str, int]] = Field(default=None, sa_column=Column(JSON))


class PlanRegistry(SQLModel, table=True):
    """Unified task/plan store.

    Serves both dev plans (task_scope='plan') and user tasks (task_scope='user').
    The DB is the authority for state. Filesystem markdown is a convenience
    export for dev plans committed to git.
    """

    __tablename__ = "plan_registry"
    __table_args__ = (
        Index("idx_plan_registry_scope_user", "task_scope", "user_id"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: str = Field(primary_key=True, max_length=120)
    title: str = Field(max_length=255)
    status: str = Field(default="active", max_length=32, index=True)
    stage: str = Field(default="unknown", max_length=64, index=True)
    owner: str = Field(default="unassigned", max_length=120, index=True)
    revision: int = Field(default=1)
    priority: str = Field(default="normal", max_length=32)
    summary: str = Field(default="", sa_column=Column(Text))
    scope: str = Field(default="", max_length=32)
    task_scope: str = Field(default="plan", max_length=32)  # plan | user | system
    plan_type: str = Field(default="feature", max_length=32)  # proposal | feature | bugfix | refactor | exploration | task
    user_id: Optional[int] = Field(default=None, index=True)  # NULL = shared/system
    visibility: str = Field(default="public", max_length=32)  # private | shared | public
    target: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    checkpoints: Optional[List[Dict]] = Field(default=None, sa_column=Column(JSON))
    markdown: Optional[str] = Field(default=None, sa_column=Column(Text))
    plan_path: Optional[str] = Field(default=None, max_length=512)
    code_paths: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    companions: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    handoffs: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    depends_on: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    manifest_hash: str = Field(default="", max_length=64)
    last_synced_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class PlanDocument(SQLModel, table=True):
    """Companion or handoff document belonging to a plan."""

    __tablename__ = "plan_documents"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id", index=True, max_length=120)
    doc_type: str = Field(max_length=32, index=True)  # 'companion' or 'handoff'
    path: str = Field(max_length=512)
    title: str = Field(max_length=255)
    markdown: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class PlanShare(SQLModel, table=True):
    """Grants a specific user access to a plan."""

    __tablename__ = "plan_shares"
    __table_args__ = (
        Index("idx_plan_shares_plan_user", "plan_id", "user_id", unique=True),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id", max_length=120)
    user_id: int = Field(index=True)
    role: str = Field(default="viewer", max_length=32)  # viewer | commenter | contributor | editor | maintainer | admin
    granted_by: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class AgentActivityLog(SQLModel, table=True):
    """Persistent log of AI agent actions across the system."""

    __tablename__ = "agent_activity_log"
    __table_args__ = (
        Index("idx_agent_log_session_ts", "session_id", "timestamp"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    session_id: str = Field(max_length=120, index=True)
    agent_type: str = Field(default="claude", max_length=64)
    status: str = Field(default="active", max_length=32)
    contract_id: Optional[str] = Field(default=None, max_length=120, index=True)
    plan_id: Optional[str] = Field(default=None, max_length=120, index=True)
    action: str = Field(default="", max_length=120)
    detail: Optional[str] = Field(default=None, sa_column=Column(Text))
    endpoint: Optional[str] = Field(default=None, max_length=512)
    extra: Optional[Dict] = Field(default=None, sa_column=Column("metadata", JSON))
    timestamp: datetime = Field(default_factory=utcnow, index=True)


class PlanEvent(SQLModel, table=True):
    """Audit trail entry for plan state transitions."""

    __tablename__ = "plan_events"
    __table_args__ = (
        Index("idx_plan_event_plan_ts", "plan_id", "timestamp"),
        {"schema": PLAN_META_SCHEMA},
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    run_id: Optional[UUID] = Field(default=None, foreign_key=f"{PLAN_META_SCHEMA}.plan_sync_runs.id", index=True)
    plan_id: str = Field(foreign_key=f"{PLAN_META_SCHEMA}.plan_registry.id", index=True, max_length=120)
    event_type: str = Field(max_length=64)
    field: Optional[str] = Field(default=None, max_length=64)
    old_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    commit_sha: Optional[str] = Field(default=None, max_length=64)
    timestamp: datetime = Field(default_factory=utcnow, index=True)
