"""
Vocabulary candidate harvesting.

Collects keywords that the parser matched against a role keyword list
but couldn't resolve to an ontology ID. These are vocabulary gaps —
known to be content-bearing (they matched a role) but not specific
enough to produce a structured tag like ``mood:tender`` or ``camera:pov``.

Workflow:
    Phase 1 (this module) — harvest, count frequency, store sample contexts.
    Phase 2 — LLM proposes namespace:value mappings for top candidates.
    Phase 3 — human/agent review accepts, rejects, or remaps proposals.
              Accepted entries feed back into the parser's keyword→ontology
              lookup so the next parse produces structured tags directly.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class VocabularyCandidate(SQLModel, table=True):
    """A keyword the parser saw frequently but couldn't resolve to an ontology ID."""

    __tablename__ = "vocabulary_candidate"

    id: Optional[int] = Field(default=None, primary_key=True)

    term: str = Field(
        max_length=128,
        unique=True,
        index=True,
        description="The matched keyword (normalized lowercase)",
    )

    inferred_role: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="The role whose keyword list matched this term (e.g. 'setting')",
    )

    frequency: int = Field(
        default=1,
        index=True,
        description="Times the parser has seen this unresolved keyword",
    )

    first_seen: datetime = Field(default_factory=utcnow)
    last_seen: datetime = Field(default_factory=utcnow, index=True)

    sample_contexts: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Up to 5 sample sentences containing the term (for review)",
    )

    status: str = Field(
        default="pending",
        max_length=16,
        index=True,
        description="pending | proposed | accepted | rejected | blocklisted",
    )

    proposed_tag: Optional[str] = Field(
        default=None,
        max_length=128,
        description="LLM-suggested namespace:value mapping (e.g. 'location:alley')",
    )

    proposed_at: Optional[datetime] = Field(default=None)
    reviewed_at: Optional[datetime] = Field(default=None)
    reviewed_by: Optional[int] = Field(default=None, description="User ID who reviewed")
