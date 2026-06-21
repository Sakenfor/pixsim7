"""
Durable analysis backfill runs with checkpoint state.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import ConfigDict
from sqlalchemy import JSON
from sqlmodel import Column, Field, Index, SQLModel

from pixsim7.backend.main.domain.assets.backfill import (
    TERMINAL_BACKFILL_STATUSES,
    BackfillStatus,
)
from pixsim7.backend.main.domain.enums import enum_column
from pixsim7.backend.main.shared.datetime_utils import utcnow

# The lifecycle enum is shared across all backfill domains; keep the historical
# name as an alias so existing imports (api, domain re-exports) keep working.
AnalysisBackfillStatus = BackfillStatus


class AnalysisBackfillRun(SQLModel, table=True):
    __tablename__ = "analysis_backfill_runs"
    model_config = ConfigDict(protected_namespaces=())

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    status: BackfillStatus = Field(
        default=BackfillStatus.PENDING,
        sa_column=enum_column(
            BackfillStatus,
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
        return self.status in TERMINAL_BACKFILL_STATUSES

    def to_progress_dict(self) -> Dict[str, Any]:
        """Worker-facing progress snapshot (the ARQ task's return value)."""
        return {
            "status": self.status.value,
            "run_id": self.id,
            "processed_assets": self.processed_assets,
            "created_analyses": self.created_analyses,
            "deduped_assets": self.deduped_assets,
            "failed_assets": self.failed_assets,
            "cursor_asset_id": self.cursor_asset_id,
        }
