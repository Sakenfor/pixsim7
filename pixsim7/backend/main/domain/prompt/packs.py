"""Prompt pack authoring models."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class PromptPackDraft(SQLModel, table=True):
    """User-authored prompt pack draft source and compile placeholders."""

    __tablename__ = "prompt_pack_drafts"
    __table_args__ = (
        UniqueConstraint(
            "owner_user_id",
            "namespace",
            "pack_slug",
            name="uq_prompt_pack_draft_owner_namespace_slug",
        ),
        Index("idx_prompt_pack_draft_owner_status", "owner_user_id", "status"),
        Index("idx_prompt_pack_draft_owner_updated", "owner_user_id", "updated_at"),
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

    owner_user_id: int = Field(
        foreign_key="users.id",
        index=True,
        description="Owning user",
    )
    namespace: str = Field(
        max_length=255,
        index=True,
        description="User namespace, e.g. user.123 or user.123.tools",
    )
    pack_slug: str = Field(
        max_length=120,
        index=True,
        description="Pack slug within owner namespace",
    )
    status: str = Field(
        default="draft",
        max_length=32,
        index=True,
        description="Draft lifecycle status",
    )

    cue_source: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
        description="Raw CUE source authored by user",
    )
    last_compile_status: Optional[str] = Field(
        default=None,
        max_length=32,
        description="Last compile status marker",
    )
    last_compile_errors: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="Structured compile diagnostics from the latest compile attempt",
    )
    last_compiled_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class PromptPackVersion(SQLModel, table=True):
    """Immutable compiled snapshot for a prompt pack draft."""

    __tablename__ = "prompt_pack_versions"
    __table_args__ = (
        UniqueConstraint(
            "draft_id",
            "version",
            name="uq_prompt_pack_version_draft_version",
        ),
        Index("idx_prompt_pack_version_draft_created", "draft_id", "created_at"),
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

    draft_id: UUID = Field(
        foreign_key="prompt_pack_drafts.id",
        index=True,
        description="Parent draft ID",
    )
    version: int = Field(
        ge=1,
        description="Monotonic version number per draft",
    )
    cue_source: str = Field(
        sa_column=Column(Text, nullable=False),
        description="Source snapshot at version creation time",
    )
    compiled_schema_yaml: str = Field(
        sa_column=Column(Text, nullable=False),
        description="Compiled pack schema YAML artifact",
    )
    compiled_manifest_yaml: str = Field(
        sa_column=Column(Text, nullable=False),
        description="Compiled manifest YAML artifact",
    )
    compiled_blocks_json: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False),
        description="Compiled block catalog artifact",
    )
    checksum: str = Field(
        max_length=64,
        index=True,
        description="Deterministic checksum of source and compiled artifacts",
    )

    created_at: datetime = Field(default_factory=utcnow, index=True)


class PromptPackPublication(SQLModel, table=True):
    """Publication and review workflow state for an immutable pack version."""

    __tablename__ = "prompt_pack_publications"
    __table_args__ = (
        UniqueConstraint(
            "version_id",
            name="uq_prompt_pack_publication_version",
        ),
        Index(
            "idx_prompt_pack_publication_visibility_review",
            "visibility",
            "review_status",
        ),
        Index(
            "idx_prompt_pack_publication_reviewed_by",
            "reviewed_by_user_id",
            "reviewed_at",
        ),
    )

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)

    version_id: UUID = Field(
        foreign_key="prompt_pack_versions.id",
        index=True,
        description="Immutable version this publication entry references",
    )
    visibility: str = Field(
        default="private",
        max_length=32,
        index=True,
        description="Catalog visibility: private, approved, shared",
    )
    review_status: str = Field(
        default="draft",
        max_length=32,
        index=True,
        description="Review lifecycle: draft, submitted, approved, rejected",
    )
    reviewed_by_user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="Admin reviewer user id",
    )
    reviewed_at: Optional[datetime] = Field(default=None)
    review_notes: Optional[str] = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
        description="Optional reviewer notes, especially for rejection context",
    )

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
