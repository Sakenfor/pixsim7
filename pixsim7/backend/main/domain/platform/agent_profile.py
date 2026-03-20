"""
Agent Profile — unified identity for AI agents and assistant personas.

Merges the former ``AssistantDefinition`` (conversation persona) with
``AgentProfile`` (service identity).  A single profile configures:
- **Identity**: stable agent_id for write attribution
- **Persona**: system prompt, model, delivery method
- **Scope**: allowed contracts, token scopes, plan assignments
- **UI**: icon, label, description
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
    """Unified AI profile — both identity and persona."""

    __tablename__ = "agent_profiles"
    __table_args__ = (
        Index("idx_agent_profiles_user", "user_id"),
        Index("idx_agent_profiles_status", "status"),
        {"schema": PLATFORM_SCHEMA},
    )

    id: str = Field(primary_key=True, max_length=120)
    user_id: int = Field(default=0, index=True)  # 0 = global/system profile
    label: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    icon: Optional[str] = Field(default=None, max_length=50)
    agent_type: str = Field(default="claude-cli", max_length=64)

    # Persona (from AssistantDefinition)
    system_prompt: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="System prompt / instructions appended to base prompt.",
    )
    model_id: Optional[str] = Field(default=None, max_length=100)
    method: Optional[str] = Field(default=None, max_length=20)
    audience: str = Field(default="user", max_length=20)
    allowed_contracts: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Contract IDs this profile can access. NULL = all for audience.",
    )
    config: Optional[Dict] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Extra config (temperature, max_tokens, etc.).",
    )

    # Agent identity
    default_scopes: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Default scopes when minting tokens.",
    )
    assigned_plans: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Plan IDs this agent may work on. NULL = unrestricted.",
    )

    # Status & defaults
    status: str = Field(default="active", max_length=32)  # active | paused | archived
    is_default: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    @property
    def is_global(self) -> bool:
        return self.user_id == 0

    @property
    def enabled(self) -> bool:
        return self.status == "active"


# ---------------------------------------------------------------------------
# Chat Session — tracks assistant conversation sessions for resume
# ---------------------------------------------------------------------------


class ChatSession(SQLModel, table=True):
    """A tracked assistant chat session (for /resume picker).

    Created on first message of a new conversation, updated on each subsequent
    message. Scoped to engine (claude, codex, api) and optionally a profile.
    """

    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("idx_chat_sessions_user_engine", "user_id", "engine"),
        Index("idx_chat_sessions_last_used", "last_used_at"),
        {"schema": PLATFORM_SCHEMA},
    )

    # The conversation UUID from the agent CLI (session_id from init event)
    id: str = Field(primary_key=True, max_length=120)
    user_id: int = Field(default=0, index=True)
    engine: str = Field(default="claude", max_length=32)
    profile_id: Optional[str] = Field(default=None, max_length=120)
    label: str = Field(default="Untitled", max_length=255)
    message_count: int = Field(default=0)
    last_used_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)
    status: str = Field(default="active", max_length=32)  # active | archived


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
    status: str = Field(default="running", max_length=32)
    started_at: datetime = Field(default_factory=utcnow)
    ended_at: Optional[datetime] = Field(default=None)
    summary: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    token_jti: Optional[str] = Field(default=None, max_length=64)
