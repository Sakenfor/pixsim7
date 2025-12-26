"""
Prompt feedback models

Tracks user feedback on prompt variants and their outputs.
"""
from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON
from uuid import UUID


class PromptVariantFeedback(SQLModel, table=True):
    """
    Feedback on a specific combination of prompt version + input assets + output asset.

    Tracks:
        - Which seed images were used
        - Which output asset was produced
        - Per-variant ratings, favorites, and notes
    """
    __tablename__ = "prompt_variant_feedback"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Identity and linkage
    prompt_version_id: UUID = Field(
        foreign_key="prompt_versions.id",
        index=True,
        description="Prompt version used for this generation"
    )
    output_asset_id: int = Field(
        foreign_key="assets.id",
        index=True,
        description="Asset produced by this combination"
    )
    input_asset_ids: List[int] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Asset IDs used as seeds / keyframes for this generation"
    )
    generation_id: Optional[int] = Field(
        default=None,
        foreign_key="generations.id",
        index=True,
        description="Optional link back to the unified generation record"
    )

    # Who rated it
    user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="User who provided feedback"
    )

    # Ratings and quality
    user_rating: Optional[int] = Field(
        default=None,
        description="Explicit 1-5 rating from user"
    )
    quality_score: Optional[float] = Field(
        default=None,
        description="Optional computed quality score (e.g., aggregate metric)"
    )
    is_favorite: bool = Field(
        default=False,
        description="Whether user marked this variant as favorite"
    )
    notes: Optional[str] = Field(
        default=None,
        description="Free-form notes about this result"
    )

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )

    __table_args__ = (
        Index("idx_pvf_version_asset", "prompt_version_id", "output_asset_id"),
        Index("idx_pvf_user_favorites", "user_id", "is_favorite"),
    )

    def __repr__(self) -> str:
        return (
            f"<PromptVariantFeedback(id={self.id}, "
            f"version={self.prompt_version_id}, "
            f"asset={self.output_asset_id})>"
        )
