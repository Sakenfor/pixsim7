"""
Analyzer Preset domain model

Stores user-created analyzer presets that can be submitted for approval.
Approved presets are merged into analyzer definitions for global use.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, UniqueConstraint

from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.domain.enums import ReviewStatus, enum_column


class AnalyzerPreset(SQLModel, table=True):
    """
    Analyzer preset entry.

    Presets are owned by a user and can be submitted for approval.
    Approved presets are globally discoverable.
    """
    __tablename__ = "analyzer_presets"
    __table_args__ = (
        UniqueConstraint(
            "owner_user_id",
            "analyzer_id",
            "preset_id",
            name="uq_analyzer_preset_owner",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)

    analyzer_id: str = Field(
        index=True,
        max_length=100,
        description="Analyzer ID this preset targets",
    )
    preset_id: str = Field(
        index=True,
        max_length=100,
        description="Preset identifier (unique per user+analyzer)",
    )

    name: str = Field(max_length=255, description="Display name")
    description: Optional[str] = Field(default=None, description="Preset description")

    config: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Preset configuration (prompts, schema, metadata)",
    )

    status: ReviewStatus = Field(
        default=ReviewStatus.DRAFT,
        sa_column=enum_column(
            ReviewStatus,
            "review_status",
            index=True,
        ),
        description="Preset review status",
    )

    owner_user_id: int = Field(
        foreign_key="users.id",
        index=True,
        description="Preset owner",
    )
    approved_by_user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="Admin approver",
    )
    approved_at: Optional[datetime] = Field(default=None)
    rejected_at: Optional[datetime] = Field(default=None)
    rejection_reason: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self) -> str:
        return (
            f"<AnalyzerPreset(id={self.id}, analyzer_id='{self.analyzer_id}', "
            f"preset_id='{self.preset_id}', status='{self.status}')>"
        )
