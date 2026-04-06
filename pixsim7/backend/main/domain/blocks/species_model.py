"""
SpeciesRecord — DB-persisted species vocabulary entries.

Lives in the separate `pixsim7_blocks` database alongside BlockPrimitive.
The in-memory representation (SpeciesDef dataclass with computed modifiers)
is hydrated from these rows via make_species() at registry sync time.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel

from pixsim7.backend.main.shared.datetime_utils import utcnow


class SpeciesRecord(SQLModel, table=True):
    """A species vocabulary entry persisted in the blocks database."""

    __tablename__ = "species"

    id: str = Field(
        primary_key=True,
        max_length=100,
        description="Namespaced species ID (e.g. 'species:cephalopod')",
    )
    label: str = Field(max_length=200, description="Human-readable label")
    category: str = Field(
        default="",
        max_length=64,
        description="Species category: humanoid, mammal, mollusk, fantasy, etc.",
    )
    anatomy_map: Dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    movement_verbs: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    pronoun_set: Dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    default_stance: str = Field(default="standing", max_length=200)
    keywords: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    visual_priority: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    render_template: str = Field(default="", description="Optional custom visual description template")
    word_lists: Dict[str, List[str]] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    modifier_roles: Dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    is_builtin: bool = Field(default=False, description="True for YAML-seeded defaults")
    source: str = Field(default="system", max_length=50, description="Origin: system | user | api")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
