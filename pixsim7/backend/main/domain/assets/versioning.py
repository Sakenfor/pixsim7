"""
Asset versioning models

Git-like versioning for assets, allowing users to track iterations
of the same conceptual asset (fix anatomy, improve lighting, etc.).

Key concepts:
- AssetVersionFamily: Groups all versions of a conceptual asset (like a git repo)
- Asset.version_family_id: Links asset to its family
- Asset.version_number: Sequential version within family
- Asset.parent_asset_id: Direct parent for chain navigation
"""
from typing import Optional, List, Any, Dict
from datetime import datetime
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON

from pixsim7.backend.main.shared.datetime_utils import utcnow


class AssetVersionFamily(SQLModel, table=True):
    """
    Groups all versions of the same conceptual asset.

    Analogous to PromptFamily for prompts, or a git repository.
    Each asset in the family has a sequential version_number.

    INVARIANTS:
    - head_asset_id must point to an asset in this family (app-level validation)
    - All assets in family have unique version_number (DB constraint)

    HEAD MANAGEMENT:
    - head_asset_id is the SINGLE SOURCE OF TRUTH for the "current best" version
    - No is_version_head flag on Asset to avoid dual-marker drift
    - Service layer should auto-elect new HEAD when current HEAD is deleted
    """
    __tablename__ = "asset_version_families"

    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique family identifier"
    )

    # Identity
    name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="User-friendly name: 'Beach sunset scene', 'Character portrait'"
    )
    description: Optional[str] = Field(
        default=None,
        description="Detailed description of what this asset family represents"
    )

    # Classification
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Family-level tags for organization"
    )

    # HEAD pointer - single source of truth for current version
    # FK defined in migration with ON DELETE SET NULL
    head_asset_id: Optional[int] = Field(
        default=None,
        description="Current 'best' version (user can change). FK to assets.id"
    )

    # Owner
    user_id: int = Field(
        index=True,
        description="User who owns this version family. FK to users.id"
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=utcnow,
        description="When family was created"
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        description="When family was last modified (new version added, HEAD changed)"
    )

    __table_args__ = (
        Index("idx_avf_user_updated", "user_id", "updated_at"),
        {'extend_existing': True},
    )

    def __repr__(self) -> str:
        return (
            f"<AssetVersionFamily(id={self.id}, "
            f"name='{self.name}', "
            f"head_asset_id={self.head_asset_id})>"
        )

    # NOTE: version_count and latest_version_number are DERIVED at query time:
    #   SELECT COUNT(*), MAX(version_number)
    #   FROM assets
    #   WHERE version_family_id = ?
    # This avoids concurrency issues with denormalized counters.
