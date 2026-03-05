"""
AssetAnalysis model - Media analysis jobs for assets.

Stores analysis results that run through the same async pipeline as generations:
submit -> poll -> complete.
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


class AnalysisStatus(str, Enum):
    """Analysis execution status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AssetAnalysis(SQLModel, table=True):
    """
    Asset analysis record.

    Mirrors the Generation model lifecycle but for analysis jobs.
    Immutable fields: asset_id, analyzer_id, model_id, prompt, params
    Mutable fields: status, timestamps, result, error_message
    """

    __tablename__ = "asset_analyses"
    model_config = ConfigDict(protected_namespaces=())

    # Identity
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)

    # Analysis configuration
    analyzer_id: str = Field(
        max_length=100,
        index=True,
        description="Analyzer ID (e.g., 'asset:object-detection')",
    )
    model_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Resolved model ID for analyzer execution",
    )
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Resolved provider ID for analyzer execution",
    )

    # Analysis input
    prompt: Optional[str] = Field(
        default=None,
        description="Prompt for the analysis",
    )
    params: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Additional parameters for the analysis",
    )
    analysis_point: str = Field(
        default="manual",
        max_length=120,
        index=True,
        description="Routing point/context for analysis invocation",
    )
    analyzer_definition_version: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Analyzer definition version token at execution time",
    )
    effective_config_hash: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Hash of effective analyzer execution config",
    )
    input_fingerprint: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Input fingerprint used for idempotency dedupe",
    )
    dedupe_key: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Stable idempotency key over dedupe tuple",
    )

    # Lifecycle
    status: AnalysisStatus = Field(
        default=AnalysisStatus.PENDING,
        sa_column=enum_column(AnalysisStatus, "analysis_status_enum", index=True),
    )
    priority: int = Field(default=5, index=True)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = Field(default=0)

    # Result
    result: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Analysis result (structured data from provider)",
    )

    # Metadata
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        Index("idx_analysis_asset_analyzer", "asset_id", "analyzer_id"),
        Index(
            "idx_analysis_dedupe_lookup",
            "asset_id",
            "analysis_point",
            "analyzer_id",
            "effective_config_hash",
            "input_fingerprint",
            "status",
        ),
        Index("idx_analysis_user_status", "user_id", "status", "created_at"),
        Index("idx_analysis_status_created", "status", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AssetAnalysis(id={self.id}, "
            f"asset_id={self.asset_id}, "
            f"analyzer={self.analyzer_id}, "
            f"status={self.status.value})>"
        )

    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate analysis duration."""

        if not self.started_at or not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    @property
    def is_terminal(self) -> bool:
        """Check if analysis is in a terminal state."""

        return self.status in {
            AnalysisStatus.COMPLETED,
            AnalysisStatus.FAILED,
            AnalysisStatus.CANCELLED,
        }
