"""Prompt tool preset persistence models."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class PromptToolPreset(SQLModel, table=True):
    """User-authored prompt tool preset row."""

    __tablename__ = "prompt_tool_presets"
    __table_args__ = (
        UniqueConstraint(
            "owner_user_id",
            "preset_id",
            name="uq_prompt_tool_preset_owner_preset_id",
        ),
        Index("idx_prompt_tool_preset_owner_public", "owner_user_id", "is_public"),
        Index("idx_prompt_tool_preset_public_updated", "is_public", "updated_at"),
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

    owner_user_id: int = Field(
        foreign_key="users.id",
        index=True,
        description="Owning user ID",
    )
    preset_id: str = Field(
        max_length=120,
        index=True,
        description="User-defined preset identifier",
    )
    label: str = Field(
        max_length=120,
        description="Display label",
    )
    description: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
        description="Human-readable description",
    )
    category: str = Field(
        default="rewrite",
        max_length=32,
        index=True,
        description="Preset category",
    )
    enabled: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )
    is_public: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )
    requires: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="Required run-context capabilities for this preset",
    )
    defaults: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="Default params/config used during execution",
    )
    owner_payload: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="Flexible owner metadata snapshot",
    )

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
