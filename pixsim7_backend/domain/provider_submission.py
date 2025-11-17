"""
ProviderSubmission model - THE source of truth for provider interactions

This model stores:
- Exact payload sent to provider (with ALL generation parameters)
- Provider's response
- Timing metrics
- Retry tracking

This is the ONLY place where generation parameters (prompt, model, quality, etc.) are stored.
Asset and Job models don't duplicate this data.
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON


class ProviderSubmission(SQLModel, table=True):
    """
    Record of provider submission - source of truth for generation params

    Design principles:
    - Single Source of Truth: ALL generation parameters here
    - Audit Trail: Exact payload and response for debugging
    - No Defaults: provider_id must be explicit
    """
    __tablename__ = "provider_submissions"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== GENERATION LINK =====
    generation_id: int = Field(foreign_key="generations.id", index=True)

    # ===== ACCOUNT =====
    # Track which account was used for this submission
    account_id: int = Field(
        foreign_key="provider_accounts.id",
        index=True,
        description="Account used for this submission"
    )

    # ===== PROVIDER =====
    # NO DEFAULT! Must be explicit
    provider_id: str = Field(
        max_length=50,
        index=True,
        description="Provider: 'pixverse', 'runway', 'pika'"
    )

    # ===== PAYLOAD (Source of Truth) =====
    # This contains ALL generation parameters:
    # - prompt, negative_prompt
    # - model, quality, duration
    # - aspect_ratio, seed
    # - image_urls (for i2v, transition)
    # - video_url (for extend)
    # - etc.
    payload: Dict[str, Any] = Field(
        sa_column=Column(JSON),
        description="Exact payload sent to provider (ALL params here!)"
    )

    # ===== RESPONSE =====
    # Provider's response (or error)
    response: Dict[str, Any] = Field(
        sa_column=Column(JSON),
        description="Provider's response or error"
    )

    # Quick-index field for searching
    provider_job_id: Optional[str] = Field(
        default=None,
        max_length=200,
        index=True,
        description="Provider's job ID"
    )

    # ===== RETRY TRACKING =====
    retry_attempt: int = Field(
        default=0,
        description="Retry attempt number (0 = first attempt)"
    )
    previous_submission_id: Optional[int] = Field(
        default=None,
        foreign_key="provider_submissions.id",
        description="Previous submission if this is a retry"
    )

    # ===== TIMING METRICS =====
    submitted_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )
    responded_at: Optional[datetime] = None
    duration_ms: Optional[int] = Field(
        default=None,
        description="Response time in milliseconds"
    )

    # ===== STATUS =====
    status: str = Field(
        max_length=20,
        index=True,
        description="Status: 'pending', 'success', 'error', 'timeout'"
    )

    # ===== INDEXES =====
    __table_args__ = (
        Index("idx_submission_generation_attempt", "generation_id", "retry_attempt"),
        Index("idx_submission_status_submitted", "status", "submitted_at"),
        Index("idx_submission_provider_job", "provider_id", "provider_job_id"),
    )

    def __repr__(self):
        return (
            f"<ProviderSubmission(id={self.id}, "
            f"generation_id={self.generation_id}, "
            f"provider={self.provider_id}, "
            f"status={self.status})>"
        )

    @property
    def prompt(self) -> Optional[str]:
        """Extract prompt from payload (convenience property)"""
        return self.payload.get("prompt")

    @property
    def model(self) -> Optional[str]:
        """Extract model from payload (convenience property)"""
        return self.payload.get("model")

    @property
    def quality(self) -> Optional[str]:
        """Extract quality from payload (convenience property)"""
        return self.payload.get("quality")

    def calculate_duration(self) -> None:
        """Calculate and store duration_ms"""
        if self.submitted_at and self.responded_at:
            delta = self.responded_at - self.submitted_at
            self.duration_ms = int(delta.total_seconds() * 1000)
