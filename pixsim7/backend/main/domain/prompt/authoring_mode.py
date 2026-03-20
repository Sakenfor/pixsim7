"""
AuthoringMode domain model — DB-persisted prompt authoring modes.

Each mode defines a category for prompt families with generation hints,
recommended tags, and constraints. Builtins are seeded on first run;
runtime additions/edits via API are persisted here.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import Column, Field, SQLModel
from sqlalchemy import JSON

from pixsim7.backend.main.shared.datetime_utils import utcnow


class AuthoringMode(SQLModel, table=True):
    """A prompt authoring mode / category."""

    __tablename__ = "authoring_modes"

    id: str = Field(primary_key=True, max_length=100, description="Unique mode ID")
    label: str = Field(max_length=200, description="Human-readable label")
    description: str = Field(default="", description="What this mode is for")
    sequence_role: Optional[str] = Field(default=None, max_length=50)
    generation_hints: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    recommended_tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    required_fields: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default='["prompt_text"]'),
    )
    is_builtin: bool = Field(default=False, description="True for code-defined defaults")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
