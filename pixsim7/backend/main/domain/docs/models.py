from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class PlanRegistry(SQLModel, table=True):
    """Cached projection of a plan manifest bundle."""

    __tablename__ = "plan_registry"

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
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    plan_id: str = Field(foreign_key="plan_registry.id", index=True, max_length=120)
    event_type: str = Field(max_length=64)
    field: Optional[str] = Field(default=None, max_length=64)
    old_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    commit_sha: Optional[str] = Field(default=None, max_length=64)
    timestamp: datetime = Field(default_factory=utcnow, index=True)
