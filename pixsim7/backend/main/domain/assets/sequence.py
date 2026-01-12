"""
Clip sequences for asset playback.

Defines ordered sequences of clips/keyframes with optional branching variants.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON


class ClipSequence(SQLModel, table=True):
    """Groups clips into a playable animation sequence."""

    __tablename__ = "clip_sequences"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=128, index=True)

    # Owner (optional)
    character_id: Optional[UUID] = Field(default=None, foreign_key="characters.id", index=True)
    npc_id: Optional[int] = Field(default=None, foreign_key="game_npcs.id", index=True)

    # Ontology concept tags (pose, mood, activity, etc.)
    concept_refs: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))

    # Playback
    loop_mode: str = Field(default="loop", max_length=16)
    loop_start_order: Optional[int] = Field(default=None)
    loop_end_order: Optional[int] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)


class ClipSequenceEntry(SQLModel, table=True):
    """Entry in a sequence - references existing AssetClip or Asset."""

    __tablename__ = "clip_sequence_entries"
    __table_args__ = (
        Index("idx_clip_sequence_entry_order", "sequence_id", "sequence_order", unique=True),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    sequence_id: int = Field(foreign_key="clip_sequences.id", index=True)

    # Reference to clip or asset
    clip_id: Optional[int] = Field(default=None, foreign_key="asset_clips.id")
    asset_id: Optional[int] = Field(default=None, foreign_key="assets.id")

    # Variations (uses AssetBranch/AssetBranchVariant)
    branch_id: Optional[int] = Field(default=None, foreign_key="asset_branches.id")

    # Position
    sequence_order: int = Field(default=0)
    entry_type: str = Field(max_length=16)

    # Timing
    duration_sec: Optional[float] = None

    # Ontology concept tags (overrides/extends sequence-level tags)
    concept_refs: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
