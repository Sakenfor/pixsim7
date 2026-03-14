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
    """Cached projection of a plan manifest bundle."""

    __tablename__ = "plan_registry"
    __table_args__ = {"schema": PLAN_META_SCHEMA}

    id: str = Field(primary_key=True, max_length=120)
    title: str = Field(max_length=255)
    status: str = Field(default="active", max_length=32, index=True)
    stage: str = Field(default="unknown", max_length=64, index=True)
    owner: str = Field(default="unassigned", max_length=120, index=True)
    revision: int = Field(default=1)
    priority: str = Field(default="normal", max_length=32)
    summary: str = Field(default="", sa_column=Column(Text))
    scope: str = Field(default="", max_length=32)
    code_paths: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    companions: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    handoffs: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    depends_on: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    manifest_hash: str = Field(default="", max_length=64)
    last_synced_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


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
