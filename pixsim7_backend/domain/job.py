"""
Job domain model - tracks video generation jobs

UPDATED: Now stores params for worker access.
Params are duplicated in ProviderSubmission for audit trail.
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Index, Column
from sqlalchemy import JSON

from .enums import JobStatus, OperationType


class Job(SQLModel, table=True):
    """
    Job model - tracks lifecycle and stores generation parameters

    Design principles:
    - Single Responsibility: Track job lifecycle
    - Params Duplication: Stored here for worker access, duplicated in ProviderSubmission for audit
    - Explicit Operations: operation_type is required (no auto-detection)
    """
    __tablename__ = "jobs"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Owner
    user_id: int = Field(foreign_key="users.id", index=True)

    # ===== OPERATION =====
    # EXPLICIT operation type (no auto-detection!)
    operation_type: OperationType = Field(
        description="Operation: text_to_video, image_to_video, etc."
    )

    # Provider (no default!)
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Target provider: 'pixverse', 'runway', 'pika'"
    )

    # ===== GENERATION PARAMETERS =====
    # Stored here for worker access and retry capability
    # Also duplicated in ProviderSubmission for audit trail
    params: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Generation parameters: prompt, quality, duration, etc."
    )

    # ===== ORGANIZATION =====
    # For grouping jobs into projects/workspaces
    workspace_id: Optional[int] = Field(
        default=None,
        foreign_key="workspaces.id",
        index=True,
        description="Optional workspace/project for organization"
    )

    # Job name/description for user reference
    name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="User-friendly job name"
    )
    description: Optional[str] = None

    # ===== PRIORITY & SCHEDULING =====
    priority: int = Field(
        default=5,
        index=True,
        description="Job priority (0=highest, 10=lowest)"
    )
    scheduled_at: Optional[datetime] = Field(
        default=None,
        index=True,
        description="When to execute job (null=immediate)"
    )

    # ===== DEPENDENCIES =====
    # For chaining jobs (e.g., extend depends on original)
    parent_job_id: Optional[int] = Field(
        default=None,
        foreign_key="jobs.id",
        index=True,
        description="Parent job if this is a dependent job"
    )

    # ===== STATUS =====
    status: JobStatus = Field(
        default=JobStatus.PENDING,
        index=True
    )

    # ===== ERROR TRACKING =====
    error_message: Optional[str] = None
    retry_count: int = Field(default=0)

    # ===== RESULT =====
    # Link to final asset (when completed)
    asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        index=True
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # ===== INDEXES =====
    __table_args__ = (
        Index("idx_job_user_status_created", "user_id", "status", "created_at"),
        Index("idx_job_status_created", "status", "created_at"),
        Index("idx_job_priority_created", "priority", "created_at"),
        Index("idx_job_workspace", "workspace_id", "created_at"),
    )

    def __repr__(self):
        return (
            f"<Job(id={self.id}, "
            f"op={self.operation_type.value}, "
            f"provider={self.provider_id}, "
            f"status={self.status.value})>"
        )

    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate job duration"""
        if not self.started_at or not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()

    @property
    def is_terminal(self) -> bool:
        """Check if job is in a terminal state"""
        return self.status in {
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED
        }
