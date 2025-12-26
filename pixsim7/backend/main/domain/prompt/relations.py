"""
Prompt domain relation/junction tables

Links between prompt versions and blocks for composition tracking.
"""
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Index
from uuid import UUID

from pixsim7.backend.main.domain.enums import enum_column
from pixsim7.backend.main.domain.prompt.enums import PromptSegmentRole


class PromptVersionBlock(SQLModel, table=True):
    """
    Junction table: which blocks appear in which prompt versions.

    Tracks block composition with ordering, weights, and per-instance overrides.
    Enables queries like "find all versions using block X" and
    "reconstruct prompt from blocks".
    """
    __tablename__ = "prompt_version_blocks"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    version_id: UUID = Field(
        foreign_key="prompt_versions.id",
        index=True,
        description="The prompt version containing this block"
    )
    block_id: UUID = Field(
        foreign_key="prompt_blocks.id",
        index=True,
        description="The block used in this version"
    )

    # Ordering & composition
    block_index: int = Field(
        description="Position of block in prompt (0-based)"
    )
    weight: float = Field(
        default=1.0,
        description="Weight for weighted composition (default 1.0)"
    )

    # Per-instance overrides (NULL = use block defaults)
    role_override: Optional[PromptSegmentRole] = Field(
        default=None,
        sa_column=enum_column(PromptSegmentRole, "pvb_role_override_enum"),
        description="Override block's default role for this usage"
    )
    category_override: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Override block's default category for this usage"
    )

    # Provenance
    source_type: str = Field(
        default="composed",
        max_length=20,
        description="How linked: composed, parsed, manual"
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )

    __table_args__ = (
        # Ensure unique block position per version
        Index(
            "idx_pvb_version_block_unique",
            "version_id", "block_id", "block_index",
            unique=True
        ),
        # Fast lookups
        Index("idx_pvb_version_order", "version_id", "block_index"),
        Index("idx_pvb_block", "block_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<PromptVersionBlock(version={self.version_id}, "
            f"block={self.block_id}, idx={self.block_index})>"
        )
