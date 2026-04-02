"""
Prompt version tag assertions

Typed tag assignments for prompt versions.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlmodel import SQLModel, Field

from pixsim7.backend.main.shared.datetime_utils import utcnow


class PromptVersionTagAssertion(SQLModel, table=True):
    """
    Assign a canonical tag to a prompt version.

    Provenance is tracked via `source`:
    - manual
    - system
    - analyzer
    - unknown
    """

    __tablename__ = "prompt_version_tag_assertion"

    prompt_version_id: UUID = Field(
        foreign_key="prompt_versions.id",
        primary_key=True,
        index=True,
    )
    tag_id: int = Field(
        foreign_key="tag.id",
        primary_key=True,
        index=True,
    )
    source: str = Field(
        default="analyzer",
        max_length=16,
        index=True,
    )
    confidence: Optional[float] = Field(
        default=None,
        description="Optional analyzer confidence score in range [0.0, 1.0]",
    )
    created_at: datetime = Field(
        default_factory=utcnow,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            "PromptVersionTagAssertion("
            f"prompt_version_id={self.prompt_version_id}, "
            f"tag_id={self.tag_id}, source={self.source})"
        )

