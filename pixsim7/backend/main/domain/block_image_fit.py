"""Block ↔ Image Fit Feedback domain model

User feedback and derived metadata for how well an ActionBlock
fits a specific image/asset (or generation output).
"""
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID


class BlockImageFit(SQLModel, table=True):
    """
    User feedback and derived metadata for how well an ActionBlock
    fits a specific image/asset (or generation output).
    """
    __tablename__ = "block_image_fits"

    id: Optional[int] = Field(default=None, primary_key=True)

    block_id: UUID = Field(
        foreign_key="action_blocks.id",
        index=True,
        description="ActionBlockDB.id being evaluated"
    )

    asset_id: Optional[int] = Field(
        default=None,
        index=True,
        description="Asset.id (image/video) the block is being evaluated against"
    )

    generation_id: Optional[int] = Field(
        default=None,
        index=True,
        description="Generation.id if rating tied to a specific generation"
    )

    # Sequence context: initial scene setup, continuation, or transition
    role_in_sequence: str = Field(
        default="unspecified",
        max_length=32,
        description="'initial' | 'continuation' | 'transition' | 'unspecified'"
    )

    # User + rating
    user_id: Optional[int] = Field(default=None, index=True)
    fit_rating: Optional[int] = Field(
        default=None,
        description="1-5 rating for how well block fits the image"
    )

    # Heuristic fit score (0-1 or 0-100) from ontology tag comparison, for analysis
    heuristic_score: Optional[float] = Field(default=None)

    # Snapshots of tags at rating time (for offline analysis)
    block_tags_snapshot: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON)
    )
    asset_tags_snapshot: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON)
    )

    notes: Optional[str] = Field(default=None, description="Optional free-form notes")

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
