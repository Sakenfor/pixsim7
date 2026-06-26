"""Durable signal-scan reprobe backfill runs.

Persisted run row for re-probing videos to the current signal scanner
(``SCANNER_VERSION``) — the resumable, pause/cancel-able twin of
``analysis_backfill_runs``. Shares the lifecycle state machine via
``BackfillRunServiceBase``; only the counters and target version differ.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import ConfigDict
from sqlmodel import Field, Index, SQLModel

from pixsim7.backend.main.domain.assets.backfill import (
    TERMINAL_BACKFILL_STATUSES,
    BackfillStatus,
)
from pixsim7.backend.main.domain.enums import enum_column
from pixsim7.backend.main.shared.datetime_utils import utcnow


class SignalBackfillRun(SQLModel, table=True):
    __tablename__ = "signal_backfill_runs"
    model_config = ConfigDict(protected_namespaces=())

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    status: BackfillStatus = Field(
        default=BackfillStatus.PENDING,
        sa_column=enum_column(
            BackfillStatus,
            "signal_backfill_status_enum",
            index=True,
        ),
    )

    # The scanner version this run is bringing assets up to (e.g. "v3"). Stale
    # videos are those whose signal_scanner_version is distinct from this.
    target_scanner_version: str = Field(max_length=20)
    # Run mode:
    #   "reprobe" — full ffmpeg probe (captures chroma_fp + audio/visual metrics)
    #               over STALE videos (scanner_version distinct from target).
    #   "rescore" — no ffmpeg: re-apply the fingerprint matcher + scoring over
    #               every previously-scored video's STORED metrics. The pass you
    #               repeat after curating signalref:* references / retuning
    #               thresholds, so it is NOT gated on stale-version.
    mode: str = Field(default="reprobe", max_length=16)
    batch_size: int = Field(default=100)

    cursor_asset_id: int = Field(default=0, index=True)
    total_assets: int = Field(default=0)
    processed_assets: int = Field(default=0)
    scanned_assets: int = Field(default=0)
    broken_assets: int = Field(default=0)
    skipped_assets: int = Field(default=0)
    failed_assets: int = Field(default=0)

    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_error: Optional[str] = None

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        Index("idx_signal_backfill_user_status", "user_id", "status", "created_at"),
        Index("idx_signal_backfill_user_cursor", "user_id", "cursor_asset_id"),
    )

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_BACKFILL_STATUSES

    def to_progress_dict(self) -> Dict[str, Any]:
        """Worker-facing progress snapshot (the ARQ task's return value)."""
        return {
            "status": self.status.value,
            "run_id": self.id,
            "target_scanner_version": self.target_scanner_version,
            "mode": self.mode,
            "processed_assets": self.processed_assets,
            "scanned_assets": self.scanned_assets,
            "broken_assets": self.broken_assets,
            "skipped_assets": self.skipped_assets,
            "failed_assets": self.failed_assets,
            "cursor_asset_id": self.cursor_asset_id,
        }
