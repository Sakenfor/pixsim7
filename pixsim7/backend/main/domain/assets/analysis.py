"""
AssetAnalysis model - Media analysis jobs for assets

Stores analysis results (face detection, scene tagging, content moderation, etc.)
that run through the same async pipeline as generations: submit → poll → complete.
"""
from __future__ import annotations
from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON
from enum import Enum

from pixsim7.backend.main.domain.enums import enum_column


class AnalysisStatus(str, Enum):
    """Analysis execution status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AnalyzerType(str, Enum):
    """Types of analysis that can be performed"""
    FACE_DETECTION = "face_detection"
    SCENE_TAGGING = "scene_tagging"
    CONTENT_MODERATION = "content_moderation"
    OBJECT_DETECTION = "object_detection"
    OCR = "ocr"
    CAPTION = "caption"
    EMBEDDING = "embedding"
    CUSTOM = "custom"


class AssetAnalysis(SQLModel, table=True):
    """
    Asset analysis record.

    Mirrors the Generation model's lifecycle but for analysis jobs:
    - Immutable: asset_id, analyzer_type, analyzer_version, prompt, params
    - Mutable: status, timestamps, result, error_message
    """
    __tablename__ = "asset_analyses"

    # Identity
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)

    # Analysis configuration
    analyzer_type: AnalyzerType = Field(
        sa_column=enum_column(AnalyzerType, "analyzer_type_enum", index=True)
    )
    analyzer_version: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Version of the analyzer (e.g., 'gpt-4-vision-preview')"
    )
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Provider to use for analysis (e.g., 'openai', 'google')"
    )

    # Analysis input
    prompt: Optional[str] = Field(
        default=None,
        description="Prompt for the analysis (e.g., 'Describe the scene')"
    )
    params: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Additional parameters for the analysis"
    )

    # Lifecycle
    status: AnalysisStatus = Field(
        default=AnalysisStatus.PENDING,
        sa_column=enum_column(AnalysisStatus, "analysis_status_enum", index=True)
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
        description="Analysis result (structured data from provider)"
    )

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_analysis_asset_type", "asset_id", "analyzer_type"),
        Index("idx_analysis_user_status", "user_id", "status", "created_at"),
        Index("idx_analysis_status_created", "status", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AssetAnalysis(id={self.id}, "
            f"asset_id={self.asset_id}, "
            f"analyzer={self.analyzer_type.value}, "
            f"status={self.status.value})>"
        )

    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate analysis duration"""
        if not self.started_at or not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    @property
    def is_terminal(self) -> bool:
        """Check if analysis is in a terminal state"""
        return self.status in {
            AnalysisStatus.COMPLETED,
            AnalysisStatus.FAILED,
            AnalysisStatus.CANCELLED
        }
