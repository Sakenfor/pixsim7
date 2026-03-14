"""
BlockPrimitive model — composable prompt building blocks.

Lives in the separate `pixsim7_blocks` database.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import Column, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class BlockPrimitive(SQLModel, table=True):
    """A composable prompt primitive (light, camera, character, environment, etc.)."""

    __tablename__ = "block_primitives"

    # Primary key
    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Identity
    block_id: str = Field(
        max_length=200,
        unique=True,
        index=True,
        description="Human-readable unique identifier (e.g. 'light.golden_hour')",
    )
    category: str = Field(
        max_length=64,
        index=True,
        description="Block category: light, camera, character, environment, etc.",
    )
    text: str = Field(
        sa_column=Column(Text, nullable=False),
        description="The prompt text content",
    )
    tags: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        description="Structured tags for filtering and composition",
    )
    block_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        description="Structured metadata for composition/runtime systems",
    )
    capabilities: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        description="Explicit composition/runtime capabilities declared by this primitive",
    )

    # Ownership
    owner_id: Optional[UUID] = Field(
        default=None,
        description="Owning user ID. null = system-provided block.",
    )
    source: str = Field(
        max_length=50,
        default="system",
        description="Origin: system | user | imported",
    )
    is_public: bool = Field(
        default=True,
        index=True,
        description="Whether the block is visible to all users",
    )

    # Growth / ranking
    avg_rating: Optional[float] = Field(default=None)
    usage_count: int = Field(default=0)

    # Embedding (pgvector)
    # Stored as a plain float list; actual Vector(768) column is created in migration.
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column("embedding", nullable=True),
        description="Semantic embedding vector (768-dim)",
    )
    embedding_model: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Model used to generate the embedding",
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    # Table-level indexes
    __table_args__ = (
        Index("ix_block_primitives_tags", "tags", postgresql_using="gin"),
        Index("ix_block_primitives_capabilities", "capabilities", postgresql_using="gin"),
    )
