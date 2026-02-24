"""Character version family model.

Groups all versions of the same character, following the same pattern
as AssetVersionFamily for asset versioning.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4

from sqlalchemy import JSON, Index
from sqlmodel import SQLModel, Field, Column

from pixsim7.backend.main.shared.datetime_utils import utcnow


class CharacterVersionFamily(SQLModel, table=True):
    """
    Groups all versions of the same character.

    Analogous to AssetVersionFamily for assets.
    Each character in the family has a sequential version_number.

    INVARIANTS:
    - head_character_id must point to a character in this family (app-level validation)
    - All characters in family have unique version_number (DB constraint)

    HEAD MANAGEMENT:
    - head_character_id is the SINGLE SOURCE OF TRUTH for the "current" version
    - Service layer auto-elects new HEAD when current HEAD is deleted
    """
    __tablename__ = "character_version_families"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None)
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )

    # HEAD pointer — FK defined in migration with ON DELETE SET NULL
    head_character_id: Optional[UUID] = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        Index("idx_cvf_updated", "updated_at"),
        {"extend_existing": True},
    )

    def __repr__(self) -> str:
        return (
            f"<CharacterVersionFamily(id={self.id}, "
            f"name='{self.name}', "
            f"head_character_id={self.head_character_id})>"
        )
