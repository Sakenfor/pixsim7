"""
LogEntry domain model for centralized log ingestion.

Stores structured logs from all services (API, worker, scripts, frontend).
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, JSON, Column
from sqlalchemy import Index, Text


class LogEntry(SQLModel, table=True):
    """Centralized structured log entry.

    Stores logs from all services with full structured context.
    Indexed for efficient querying by common fields.
    """
    __tablename__ = "log_entries"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Core fields (always present)
    timestamp: datetime = Field(index=True, description="UTC timestamp of log event")
    level: str = Field(index=True, max_length=20, description="Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)")
    service: str = Field(index=True, max_length=50, description="Service name (api, worker, frontend, etc.)")
    env: str = Field(default="dev", max_length=20, description="Environment (dev, staging, prod)")
    msg: Optional[str] = Field(default=None, sa_column=Column(Text), description="Human-readable message")

    # Correlation fields (for tracing)
    request_id: Optional[str] = Field(default=None, index=True, max_length=100, description="Request ID for API calls")
    job_id: Optional[int] = Field(default=None, index=True, description="Job ID for job processing")
    submission_id: Optional[int] = Field(default=None, index=True, description="Provider submission ID")
    artifact_id: Optional[int] = Field(default=None, index=True, description="Generation artifact ID")
    provider_job_id: Optional[str] = Field(default=None, index=True, max_length=255, description="Provider's job ID")

    # Context fields
    provider_id: Optional[str] = Field(default=None, index=True, max_length=50, description="Provider identifier")
    operation_type: Optional[str] = Field(default=None, max_length=50, description="Operation type")
    stage: Optional[str] = Field(default=None, index=True, max_length=50, description="Pipeline stage")
    user_id: Optional[int] = Field(default=None, index=True, description="User ID if available")

    # Error fields
    error: Optional[str] = Field(default=None, sa_column=Column(Text), description="Error message")
    error_type: Optional[str] = Field(default=None, max_length=100, description="Error class/type")

    # Performance fields
    duration_ms: Optional[int] = Field(default=None, description="Operation duration in milliseconds")
    attempt: Optional[int] = Field(default=None, description="Retry attempt number")

    # Additional context (JSON blob for flexibility)
    extra: Optional[dict] = Field(default=None, sa_column=Column(JSON), description="Additional structured context")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When log was ingested")

    __table_args__ = (
        # Composite indexes for common query patterns
        Index("idx_logs_job_stage", "job_id", "stage"),
        Index("idx_logs_job_timestamp", "job_id", "timestamp"),
        Index("idx_logs_service_level_timestamp", "service", "level", "timestamp"),
        Index("idx_logs_provider_timestamp", "provider_id", "timestamp"),
        Index("idx_logs_stage_timestamp", "stage", "timestamp"),
    )

    class Config:
        """SQLModel configuration."""
        json_schema_extra = {
            "example": {
                "timestamp": "2025-11-12T22:53:59.696794Z",
                "level": "info",
                "service": "worker",
                "env": "dev",
                "msg": "job_submitted_to_provider",
                "job_id": 123,
                "operation_type": "text_to_video",
                "provider_id": "pixverse",
                "artifact_id": 789,
                "submission_id": 321,
                "stage": "provider:submit",
                "provider_job_id": "pv_job_abc",
            }
        }
