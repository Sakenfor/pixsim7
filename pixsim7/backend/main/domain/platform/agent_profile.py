"""
Agent Profile — persistent named identity for AI agents.

An agent profile gives an AI agent a stable identity across sessions.
Tokens minted from a profile carry the profile's ``agent_id``, so all
writes are attributed consistently.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow

PLATFORM_SCHEMA = "dev_meta"


class AgentProfile(SQLModel, table=True):
    """A persistent, named AI agent identity."""

    __tablename__ = "agent_profiles"
    __table_args__ = (
        Index("idx_agent_profiles_user", "user_id"),
        Index("idx_agent_profiles_status", "status"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: str = Field(primary_key=True, max_length=120)
    user_id: int = Field(index=True)
    label: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    agent_type: str = Field(default="claude-cli", max_length=64)
    instructions: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="System prompt / guidelines for this agent (v1.1).",
    )
    default_scopes: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Default scopes when minting tokens from this profile.",
    )
    assigned_plans: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Plan IDs this agent is allowed to work on. NULL = unrestricted.",
    )
    status: str = Field(default="active", max_length=32)  # active | paused | archived
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# ---------------------------------------------------------------------------
# Agent Run — per-invocation tracking (stub, v1.1)
# ---------------------------------------------------------------------------


class AgentRun(SQLModel, table=True):
    """A single agent run/invocation. Stub for v1.1 — designed but not yet populated.

    TODO(v1.1):
    - Populate on token mint (started_at = now, status = running)
    - Update on agent disconnect or heartbeat timeout (ended_at, status)
    - Compute summary from PlanEvent/Notification records for the run_id
    - Wire into Writes tab for per-run grouping
    """

    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("idx_agent_runs_profile", "profile_id"),
        Index("idx_agent_runs_started", "started_at"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    profile_id: str = Field(
        foreign_key=f"{PLATFORM_SCHEMA}.agent_profiles.id",
        max_length=120,
        index=True,
    )
    run_id: str = Field(max_length=120, index=True)
    status: str = Field(default="running", max_length=32)  # running | completed | failed
    started_at: datetime = Field(default_factory=utcnow)
    ended_at: Optional[datetime] = Field(default=None)
    summary: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    token_jti: Optional[str] = Field(
        default=None,
        max_length=64,
        description="JWT jti for future revocation support.",
    )
