"""
Durable analysis backfill runs with checkpoint state.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import ConfigDict
from sqlalchemy import JSON
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.domain.enums import enum_column
from pixsim7.backend.main.shared.datetime_utils import utcnow


class AnalysisBackfillStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AnalysisBackfillRun(SQLModel, table=True):
    __tablename__ = "analysis_backfill_runs"
    model_config = ConfigDict(protected_namespaces=())

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    status: AnalysisBackfillStatus = Field(
        default=AnalysisBackfillStatus.PENDING,
        sa_column=enum_column(
            AnalysisBackfillStatus,
            "analysis_backfill_status_enum",
            index=True,
        ),
    )

    media_type: Optional[str] = Field(default=None, max_length=20, index=True)
    analyzer_id: Optional[str] = Field(default=None, max_length=100, index=True)
    analyzer_intent: Optional[str] = Field(default=None, max_length=100)
    analysis_point: Optional[str] = Field(default=None, max_length=120)
    prompt: Optional[str] = Field(default=None)
    params: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    priority: int = Field(default=5)
    batch_size: int = Field(default=100)

    cursor_asset_id: int = Field(default=0, index=True)
    total_assets: int = Field(default=0)
    processed_assets: int = Field(default=0)
    created_analyses: int = Field(default=0)
    deduped_assets: int = Field(default=0)
    failed_assets: int = Field(default=0)

    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_error: Optional[str] = None

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        Index("idx_analysis_backfill_user_status", "user_id", "status", "created_at"),
        Index("idx_analysis_backfill_user_cursor", "user_id", "cursor_asset_id"),
    )

    @property
    def is_terminal(self) -> bool:
        return self.status in {
            AnalysisBackfillStatus.COMPLETED,
            AnalysisBackfillStatus.FAILED,
            AnalysisBackfillStatus.CANCELLED,
        }
