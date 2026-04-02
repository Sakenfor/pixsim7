"""
Prompt tag domain model.

PromptFamilyTag is the join table linking PromptFamily records to the shared
Tag catalog, mirroring the AssetTag pattern.

Usage:
    from pixsim7.backend.main.services.tag import TagAssignment
    from pixsim7.backend.main.domain.prompt.tag import PromptFamilyTag

    prompt_tags = TagAssignment(db, PromptFamilyTag, "family_id")
    await prompt_tags.assign(family_id, ["location:park", "mood:romantic"])
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from sqlmodel import SQLModel, Field

from pixsim7.backend.main.shared.datetime_utils import utcnow


class PromptFamilyTag(SQLModel, table=True):
    """
    Join table linking a PromptFamily to structured tags.

    Design mirrors AssetTag:
    - Only canonical tag IDs are stored (resolve aliases before inserting).
    - Composite primary key (family_id, tag_id).

    Replaces the PromptFamily.tags JSON list for structured, queryable tagging.
    The JSON list can remain for backward compat while callers migrate.
    """
    __tablename__ = "prompt_family_tag"

    family_id: UUID = Field(
        foreign_key="prompt_families.id",
        primary_key=True,
        index=True,
    )
    tag_id: int = Field(
        foreign_key="tag.id",
        primary_key=True,
        index=True,
    )
    created_at: datetime = Field(default_factory=utcnow, index=True)

    def __repr__(self) -> str:
        return f"<PromptFamilyTag(family_id={self.family_id}, tag_id={self.tag_id})>"
