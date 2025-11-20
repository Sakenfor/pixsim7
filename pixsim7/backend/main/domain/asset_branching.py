"""Domain models for branching and clip metadata (simplified).

These map to existing tables created in earlier migrations. We only include
fields we actively use; optional legacy columns are omitted.
"""
from __future__ import annotations

from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Index


class AssetBranch(SQLModel, table=True):
    __tablename__ = "asset_branches"
    id: Optional[int] = Field(default=None, primary_key=True)
    source_asset_id: int = Field(foreign_key="assets.id", index=True)
    branch_time: float = Field(description="Seconds into source asset where branch occurs")
    branch_frame: Optional[int] = None
    branch_name: Optional[str] = Field(default=None, max_length=128)
    branch_description: Optional[str] = None
    branch_tag: Optional[str] = Field(default=None, max_length=64)
    branch_type: str = Field(default="manual", max_length=32)
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_branch_source_time", "source_asset_id", "branch_time"),
        {'extend_existing': True},
    )


class AssetBranchVariant(SQLModel, table=True):
    __tablename__ = "asset_branch_variants"

    id: Optional[int] = Field(default=None, primary_key=True)
    branch_id: int = Field(foreign_key="asset_branches.id", index=True)
    variant_asset_id: int = Field(foreign_key="assets.id", index=True)
    variant_name: str = Field(max_length=128)
    variant_description: Optional[str] = None
    variant_tag: Optional[str] = Field(default=None, max_length=64)
    weight: float = Field(default=1.0)
    display_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_branch_variant_unique", "branch_id", "variant_asset_id", unique=True),
        {'extend_existing': True},
    )


class AssetClip(SQLModel, table=True):
    __tablename__ = "asset_clips"

    id: Optional[int] = Field(default=None, primary_key=True)
    source_asset_id: int = Field(foreign_key="assets.id", index=True)
    start_time: float = Field(description="Clip start time in seconds")
    end_time: float = Field(description="Clip end time in seconds")
    start_frame: Optional[int] = None
    end_frame: Optional[int] = None
    clip_name: str = Field(max_length=128)
    clip_tag: Optional[str] = Field(default=None, max_length=64)
    clip_asset_id: Optional[int] = Field(default=None, foreign_key="assets.id")
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_clip_source", "source_asset_id", "start_time"),
        {'extend_existing': True},
    )
