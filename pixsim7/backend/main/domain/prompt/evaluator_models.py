"""DB models for primitive effectiveness evaluation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class PrimitiveContribution(SQLModel, table=True):
    """Records a primitive's contribution to a single generation run."""

    __tablename__ = "primitive_contributions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    run_id: UUID = Field(index=True)
    generation_id: Optional[int] = Field(default=None, index=True)
    primitive_id: str = Field(max_length=200, index=True)
    target_key: str = Field(max_length=200)
    weight: float = Field(default=1.0)
    plan_hash: Optional[str] = Field(default=None, max_length=64)
    outcome: str = Field(default="pending", max_length=32, index=True)
    outcome_signal: Optional[str] = Field(default=None, max_length=64)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
    )


class PrimitiveEffectivenessScore(SQLModel, table=True):
    """Aggregate effectiveness score for a primitive."""

    __tablename__ = "primitive_effectiveness_scores"

    primitive_id: str = Field(max_length=200, primary_key=True)
    sample_count: int = Field(default=0)
    success_rate: float = Field(default=0.0)
    avg_weight: float = Field(default=0.0)
    confidence: float = Field(default=0.0)
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    score_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
